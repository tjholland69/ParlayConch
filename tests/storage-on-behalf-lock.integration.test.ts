import { beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, notifications } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * On Behalf Of picks (maker/checker), what locking and unlocking do to the
 * week's parlay, unlock requests, once-only alerts, and the canned reports.
 */
describe("on-behalf picks, week locks and reports", () => {
  setupTestDatabase();

  const members = ["ob-maestro", "ob-amy", "ob-bo", "ob-cal"];
  let leagueId = 0;
  let weekId = 0;
  let gameIds: number[] = [];

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values(members.map((id) => ({ id, email: `${id}@example.com`, firstName: id.slice(3) })));
    const [league] = await db.insert(leagues)
      .values({ name: "On Behalf League", inviteCode: "ONBEHALF01", minLegsPerParlay: 2, maxLegsPerParlay: 5, loserLabel: "asshole" })
      .returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values(members.map((userId, i) => ({ leagueId, userId, role: i === 0 ? "admin" : "member" })));
    const [week] = await db.insert(weeks).values({ season: 2041, weekNumber: 1, label: "2041 Week 1", isActive: false }).returning();
    weekId = week.id;
    const kickoff = new Date(Date.now() + 86_400_000);
    const rows = await db.insert(games).values(
      ["A", "B", "C", "D"].map((t) => ({
        weekId, homeTeam: `${t}-home`, awayTeam: `${t}-away`, spread: "-3.5", overUnder: "44.5", gameTime: kickoff,
      })),
    ).returning();
    gameIds = rows.map((g) => g.id);
  });

  const spread = (game: number) => ({ gameId: gameIds[game], betType: "spread", pick: "home", line: "-3.5 (-110)" });
  const legsOf = async (parlayId: number) => {
    const { db } = await import("../server/db");
    return db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
  };
  const parlayRow = async (parlayId: number) => {
    const { db } = await import("../server/db");
    return (await db.select().from(parlays).where(eq(parlays.id, parlayId)))[0];
  };

  let parlayId = 0;

  test("a pick made for someone belongs to them, is credited to its maker, and waits on approval", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");

    // Amy kicks the parlay off with a pick she makes for Bo.
    const saved = await storage.setDraftPick("ob-bo", leagueId, weekId, spread(0), { placedByUserId: "ob-amy" });
    parlayId = saved.id;
    expect(saved.started).toBe(true);
    // Whoever actually started it is the starter, not the member picked for.
    expect(saved.userId).toBe("ob-amy");

    const [leg] = await legsOf(parlayId);
    expect(leg).toMatchObject({ userId: "ob-bo", placedByUserId: "ob-amy", approvalStatus: "pending" });
    expect(leg.createdAt).toBeInstanceOf(Date);

    // A pick a member makes themselves needs no approval.
    const own = await storage.setDraftPick("ob-amy", leagueId, weekId, spread(1));
    expect(own.started).toBe(false);
    const amyLeg = (await legsOf(parlayId)).find((l) => l.userId === "ob-amy");
    expect(amyLeg).toMatchObject({ placedByUserId: null, approvalStatus: null });
  });

  test("an unapproved pick blocks submit and lock for everyone but the Maestro", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await expect(storage.submitDraftParlay("ob-amy", parlayId)).rejects.toThrow(/still needs their approval/);
    await expect(storage.lockWeekParlay(leagueId, weekId, "ob-amy", true)).rejects.toThrow(/still needs their approval/);
    expect((await storage.getWeekLockStatus(leagueId, weekId)).isLocked).toBe(false);
  });

  test("only the member it was made for (or an override) can decide on it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const leg = (await legsOf(parlayId)).find((l) => l.userId === "ob-bo")!;

    await expect(storage.resolveLegApproval(leg.id, "ob-cal", "approve")).rejects.toThrow(/Only the member this pick was made for/);
    // Its maker can't approve their own work either.
    await expect(storage.resolveLegApproval(leg.id, "ob-amy", "approve")).rejects.toThrow(/Only the member this pick was made for/);

    const approved = await storage.resolveLegApproval(leg.id, "ob-bo", "approve");
    expect(approved.override).toBe(false);
    expect(approved.leg).toMatchObject({ approvalStatus: "approved", approvalByUserId: "ob-bo" });
    await expect(storage.resolveLegApproval(leg.id, "ob-bo", "approve")).rejects.toThrow(/isn't waiting on approval/);
  });

  test("rejecting removes the pick; the Maestro's decision is recorded as an override", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.setDraftPick("ob-cal", leagueId, weekId, spread(2), { placedByUserId: "ob-maestro" });
    const calLeg = (await legsOf(parlayId)).find((l) => l.userId === "ob-cal")!;
    expect(calLeg.approvalStatus).toBe("pending");

    const rejected = await storage.resolveLegApproval(calLeg.id, "ob-cal", "reject");
    expect(rejected.override).toBe(false);
    expect((await legsOf(parlayId)).some((l) => l.userId === "ob-cal")).toBe(false);

    await storage.setDraftPick("ob-cal", leagueId, weekId, spread(2), { placedByUserId: "ob-amy" });
    const again = (await legsOf(parlayId)).find((l) => l.userId === "ob-cal")!;
    const overridden = await storage.resolveLegApproval(again.id, "ob-maestro", "approve", { canOverride: true });
    expect(overridden.override).toBe(true);
    expect(overridden.leg.approvalByUserId).toBe("ob-maestro");
  });

  test("the maker can take back a pick they made; a bystander can't", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.setDraftPick("ob-cal", leagueId, weekId, spread(3), { placedByUserId: "ob-amy" });
    const leg = (await legsOf(parlayId)).find((l) => l.userId === "ob-cal")!;
    await expect(storage.removeDraftParlayLeg("ob-bo", parlayId, leg.id)).rejects.toThrow(/only remove your own pick/);
    await storage.removeDraftParlayLeg("ob-amy", parlayId, leg.id);
    expect((await legsOf(parlayId)).some((l) => l.userId === "ob-cal")).toBe(false);
  });

  test("locking moves the open parlay to pending; the Maestro's lock overrides a waiting approval", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.setDraftPick("ob-cal", leagueId, weekId, spread(3), { placedByUserId: "ob-amy" });
    expect(await storage.getWeekStarters(leagueId, weekId)).toEqual(["ob-amy"]);

    await storage.lockWeekParlay(leagueId, weekId, "ob-maestro", true, { canOverrideApprovals: true });
    expect((await parlayRow(parlayId)).status).toBe("pending");
    const calLeg = (await legsOf(parlayId)).find((l) => l.userId === "ob-cal")!;
    expect(calLeg).toMatchObject({ approvalStatus: "approved", approvalByUserId: "ob-maestro" });
    await expect(storage.setDraftPick("ob-maestro", leagueId, weekId, spread(2))).rejects.toThrow(/locked/);
  });

  test("an unlock request is one per member, and unlocking grants it and reopens the parlay", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const first = await storage.createUnlockRequest(leagueId, weekId, "ob-bo", "  fat-fingered it  ");
    const second = await storage.createUnlockRequest(leagueId, weekId, "ob-bo");
    expect(second.id).toBe(first.id);
    expect(first.reason).toBe("fat-fingered it");

    await storage.unlockWeekParlay(leagueId, weekId, "ob-maestro");
    expect((await storage.getWeekLockStatus(leagueId, weekId)).isLocked).toBe(false);
    expect((await parlayRow(parlayId)).status).toBe("draft");
    const [request] = await storage.getUnlockRequests(leagueId, weekId);
    expect(request).toMatchObject({ status: "granted", resolvedBy: "ob-maestro" });
    // Already answered: nothing left to resolve.
    expect(await storage.resolveUnlockRequest(request.id, "ob-maestro", "dismissed")).toBeNull();

    // Picks can change again.
    await storage.setDraftPick("ob-maestro", leagueId, weekId, spread(2));
    expect(await legsOf(parlayId)).toHaveLength(4);
  });

  test("unlocking leaves a parlay the Maestro already approved alone", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.lockWeekParlay(leagueId, weekId, "ob-maestro", false);
    await storage.approveParlay(parlayId, "ob-maestro");
    await storage.unlockWeekParlay(leagueId, weekId, "ob-maestro");
    expect((await parlayRow(parlayId)).status).toBe("approved");
  });

  test("person-to-person grants are per league and can be taken back", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.grantPickDelegation(leagueId, "ob-bo", "ob-cal");
    await storage.grantPickDelegation(leagueId, "ob-bo", "ob-cal");
    expect(await storage.getPickDelegations(leagueId)).toHaveLength(1);
    await storage.revokePickDelegation(leagueId, "ob-bo", "ob-cal");
    expect(await storage.getPickDelegations(leagueId)).toHaveLength(0);
  });

  test("an alert with a dedupe key reaches each member once, skips the actor and opt-outs", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    const { notifyLeague } = await import("../server/services/notify");
    await storage.updateUserSettings("ob-cal", { notificationPreferences: { email: false, sms: false, push: false, events: { parlay_busted: false } } });

    const send = () => notifyLeague(leagueId, { event: "parlay_busted", title: "Busted", actorUserId: "ob-amy", dedupeKey: "parlay_busted:test" });
    await send();
    await send();
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.leagueId, leagueId), eq(notifications.type, "parlay_busted")));
    expect(rows.map((r) => r.userId).sort()).toEqual(["ob-bo", "ob-maestro"]);
  });

  test("reports: the loser report names who busted each lost parlay, and allocation counts by type", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { getLeagueReport } = await import("../server/services/reports");
    const legs = await legsOf(parlayId);
    const bo = legs.find((l) => l.userId === "ob-bo")!;
    const amy = legs.find((l) => l.userId === "ob-amy")!;
    await db.update(parlayLegs).set({ result: "loss", decidedAt: new Date("2041-09-08T20:00:00Z") }).where(eq(parlayLegs.id, bo.id));
    await db.update(parlayLegs).set({ result: "loss", decidedAt: new Date("2041-09-08T21:00:00Z") }).where(eq(parlayLegs.id, amy.id));
    await db.update(parlays).set({ status: "loss" }).where(eq(parlays.id, parlayId));
    await db.update(weeks).set({ isActive: true }).where(eq(weeks.id, weekId));

    try {
      const loser = (await getLeagueReport(leagueId, "loser_report"))!;
      expect(loser.dataset.title).toBe("On Behalf League · 2041 Asshole Report");
      expect(loser.dataset.rows).toEqual([
        { week: 1, week_label: "2041 Week 1", parlay_id: parlayId, parlay_result: "loss", member: "bo", bet: "A-home -3.5" },
      ]);

      const allocation = (await getLeagueReport(leagueId, "allocation"))!;
      expect(allocation.dataset.rows).toEqual([
        { bet_type: "spread", bets: 4, share_pct: 100, wins: 0, losses: 2, pushes: 0, pending: 2, win_rate_pct: 0 },
      ]);

      const standings = (await getLeagueReport(leagueId, "standings_season"))!;
      expect(standings.dataset.rows.find((r) => r.member === "bo")).toMatchObject({ wins: 0, losses: 1 });
    } finally {
      await db.update(weeks).set({ isActive: false }).where(eq(weeks.id, weekId));
    }
  });
});
