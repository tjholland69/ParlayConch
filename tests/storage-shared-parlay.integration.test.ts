import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, leagueWeekLocks } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * The weekly parlay is one shared ticket: 1 member, 1 pick per parlay, saved
 * the moment it's made and visible to every other member straight away.
 */
describe("shared league parlay: one pick per member", () => {
  setupTestDatabase();

  const members = ["sp-maestro", "sp-amy", "sp-bo", "sp-cal", "sp-dee", "sp-eve"];
  let leagueId = 0;
  let weekId = 0;
  let gameIds: number[] = [];

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values(members.map((id) => ({ id, email: `${id}@example.com`, firstName: id.slice(3) })));
    const [league] = await db.insert(leagues)
      .values({ name: "Shared Parlay League", inviteCode: "SHAREDPAR1", minLegsPerParlay: 3, maxLegsPerParlay: 5 })
      .returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values(members.map((userId, i) => ({ leagueId, userId, role: i === 0 ? "admin" : "member" })));
    const [week] = await db.insert(weeks).values({ season: 2040, weekNumber: 1, label: "2040 Week 1" }).returning();
    weekId = week.id;
    const kickoff = new Date(Date.now() + 86_400_000);
    const rows = await db.insert(games).values(
      ["A", "B", "C", "D", "E", "F"].map((t) => ({
        weekId, homeTeam: `${t}-home`, awayTeam: `${t}-away`, spread: "-3.5", overUnder: "44.5", gameTime: kickoff,
      })),
    ).returning();
    gameIds = rows.map((g) => g.id);
  });

  const spread = (game: number, pick = "home") =>
    ({ gameId: gameIds[game], betType: "spread", pick, line: pick === "home" ? "-3.5 (-110)" : "+3.5 (-110)" });
  const weekParlays = async () => {
    const { db } = await import("../server/db");
    return db.select().from(parlays).where(eq(parlays.weekId, weekId));
  };
  const legsOf = async (parlayId: number) => {
    const { db } = await import("../server/db");
    return db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
  };

  test("the second member sees, and joins, the parlay the first one started", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");

    expect(await storage.getMemberWeekParlay("sp-amy", leagueId, weekId)).toBeNull();
    const started = await storage.setDraftPick("sp-maestro", leagueId, weekId, spread(0));
    expect(started.status).toBe("draft");

    // Step 5 of the bug report: another member opens the parlay and the
    // first pick is there, credited to whoever made it.
    const seenByAmy = await storage.getMemberWeekParlay("sp-amy", leagueId, weekId);
    expect(seenByAmy?.id).toBe(started.id);
    expect(seenByAmy?.legs.map((l) => l.userId)).toEqual(["sp-maestro"]);
    expect(seenByAmy?.taken).toHaveLength(1);
    expect(seenByAmy?.taken[0]).toMatchObject({ gameId: gameIds[0], betType: "spread", pick: "home" });
    expect(seenByAmy?.taken[0].takenBy.mobile).toBe("maestro");

    const joined = await storage.setDraftPick("sp-amy", leagueId, weekId, spread(1));
    expect(joined.id).toBe(started.id);
    expect(await weekParlays()).toHaveLength(1);
    expect((await storage.getMemberWeekParlay("sp-maestro", leagueId, weekId))?.legs).toHaveLength(2);
    // The Your Picks list shows it to her too, before anyone submits.
    expect((await storage.getUserParlayHistory("sp-amy", leagueId)).map((p) => p.id)).toEqual([started.id]);
  });

  test("a member only ever has one pick: a new one replaces the old", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const [parlay] = await weekParlays();

    await storage.setDraftPick("sp-amy", leagueId, weekId, spread(2));
    await storage.setDraftPick("sp-amy", leagueId, weekId, { gameId: gameIds[3], betType: "moneyline", pick: "away" });
    const mine = (await legsOf(parlay.id)).filter((l) => l.userId === "sp-amy");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ gameId: gameIds[3], betType: "moneyline", pick: "away" });
    expect(await legsOf(parlay.id)).toHaveLength(2);
  });

  test("nobody can repeat another member's bet, or take its other side", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const [parlay] = await weekParlays();

    await expect(storage.setDraftPick("sp-bo", leagueId, weekId, spread(0))).rejects.toThrow(/maestro already has the spread/);
    await expect(storage.setDraftPick("sp-bo", leagueId, weekId, spread(0, "away"))).rejects.toThrow(/already has the spread/);
    // Moneylines too: the same pick twice was item 12 of the feedback.
    await expect(
      storage.setDraftPick("sp-bo", leagueId, weekId, { gameId: gameIds[3], betType: "moneyline", pick: "away" }),
    ).rejects.toThrow(/amy already has the moneyline/);
    expect((await legsOf(parlay.id)).some((l) => l.userId === "sp-bo")).toBe(false);

    // A different market on the same game is fine.
    await storage.setDraftPick("sp-bo", leagueId, weekId, { gameId: gameIds[0], betType: "over", pick: "over", line: "O44.5 (-110)" });
    expect(await legsOf(parlay.id)).toHaveLength(3);
  });

  test("members picking at the same moment end up in one parlay, one leg each", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    // Start from nothing, so the taps also race to create the parlay.
    await db.delete(parlays).where(eq(parlays.weekId, weekId));
    const results = await Promise.allSettled([
      ...members.map((userId, i) => storage.setDraftPick(userId, leagueId, weekId, spread(i))),
      // Each member also double-taps a second pick on another game's total.
      ...members.map((userId, i) =>
        storage.setDraftPick(userId, leagueId, weekId, { gameId: gameIds[i], betType: "under", pick: "under", line: "U44.5 (-110)" })),
    ]);

    const all = await weekParlays();
    expect(all).toHaveLength(1);
    const legs = await legsOf(all[0].id);
    // Max 5 legs in this league, 6 members racing: exactly one is turned away.
    expect(legs).toHaveLength(5);
    expect(new Set(legs.map((l) => l.userId)).size).toBe(5);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.length).toBeGreaterThan(0);
    for (const r of rejected) expect(String(r.reason.message)).toMatch(/full \(5 legs\)/);
  });

  test("two members racing for the same bet: one gets it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    await db.delete(parlays).where(eq(parlays.weekId, weekId));
    const results = await Promise.allSettled([
      storage.setDraftPick("sp-amy", leagueId, weekId, spread(4)),
      storage.setDraftPick("sp-bo", leagueId, weekId, spread(4)),
      storage.setDraftPick("sp-cal", leagueId, weekId, spread(4, "away")),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [parlay] = await weekParlays();
    expect(await legsOf(parlay.id)).toHaveLength(1);
  });

  test("a member removes only their own pick; the Maestro can remove anyone's", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const [parlay] = await weekParlays();
    const [taken] = await legsOf(parlay.id);
    const other = members.find((m) => m !== taken.userId && m !== "sp-maestro")!;

    await storage.setDraftPick(other, leagueId, weekId, spread(5));
    await expect(storage.removeDraftParlayLeg(other, parlay.id, taken.id)).rejects.toThrow(/only remove your own/);
    expect(await legsOf(parlay.id)).toHaveLength(2);

    await storage.removeDraftParlayLeg("sp-maestro", parlay.id, taken.id, { canRemoveOthers: true });
    expect((await legsOf(parlay.id)).map((l) => l.userId)).toEqual([other]);
    // Removing it again (a double tap) is a no-op, not an error.
    await expect(storage.removeDraftParlayLeg("sp-maestro", parlay.id, taken.id, { canRemoveOthers: true })).resolves.toBeTruthy();
  });

  test("submitting needs the league minimum, and the right person", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    await db.delete(parlays).where(eq(parlays.weekId, weekId));
    const parlay = await storage.setDraftPick("sp-amy", leagueId, weekId, spread(0));
    await storage.setDraftPick("sp-bo", leagueId, weekId, spread(1));
    await expect(storage.submitDraftParlay("sp-amy", parlay.id)).rejects.toThrow(/at least 3 legs \(2 so far\)/);

    await storage.setDraftPick("sp-cal", leagueId, weekId, spread(2));
    await expect(storage.submitDraftParlay("sp-cal", parlay.id)).rejects.toThrow(/started this parlay or the Parlay Maestro/);
    // A member can't discard a parlay other members have picks in.
    await expect(storage.cancelOwnParlay(parlay.id, "sp-amy")).rejects.toThrow(/Other members have picks/);

    const submitted = await storage.submitDraftParlay("sp-maestro", parlay.id, null, { canSubmitAny: true });
    expect(submitted.status).toBe("pending");

    // Submitted: picks are frozen, and with one parlay a week nothing new starts.
    await expect(storage.setDraftPick("sp-dee", leagueId, weekId, spread(3))).rejects.toThrow(/already been submitted, so picks are closed/);
    await expect(storage.setDraftPick("sp-amy", leagueId, weekId, spread(3), { parlayId: parlay.id })).rejects.toThrow(/picks can't change/);
    const seenByDee = await storage.getMemberWeekParlay("sp-dee", leagueId, weekId);
    expect(seenByDee).toMatchObject({ id: parlay.id, status: "pending", canStartAnother: false });
  });

  test("a league with two parlays a week: a member can have one pick in each", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    await db.update(leagues).set({ maxParlaysPerWeek: 2 }).where(eq(leagues.id, leagueId));
    const [first] = await weekParlays();
    expect((await storage.getMemberWeekParlay("sp-amy", leagueId, weekId))?.canStartAnother).toBe(true);

    // Amy started the first one and starts the second too.
    const second = await storage.setDraftPick("sp-amy", leagueId, weekId, spread(0));
    expect(second.id).not.toBe(first.id);
    expect((await legsOf(second.id)).map((l) => l.userId)).toEqual(["sp-amy"]);
    // The same bet can sit in two different parlays, just not twice in one.
    await storage.setDraftPick("sp-dee", leagueId, weekId, spread(1));
    expect(await legsOf(second.id)).toHaveLength(2);
    await expect(storage.setDraftPick("sp-eve", leagueId, weekId, spread(2), { startNew: true })).rejects.toThrow(/already has its 2 parlays/);
  });

  test("a line can move 6 points off the market number, no further", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const alt = (line: string) => ({ gameId: gameIds[4], betType: "spread", pick: "home", line });
    await expect(storage.setDraftPick("sp-eve", leagueId, weekId, alt("+3 (-240)"))).rejects.toThrow(/only move 6 points/);
    await expect(storage.setDraftPick("sp-eve", leagueId, weekId, alt("-10 (+240)"))).rejects.toThrow(/only move 6 points/);
    const saved = await storage.setDraftPick("sp-eve", leagueId, weekId, alt("-1.5 (-150)"));
    expect((await legsOf(saved.id)).find((l) => l.userId === "sp-eve")?.line).toBe("-1.5 (-150)");
  });

  test("a locked week, or a game that has kicked off, takes no picks", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    await db.update(games).set({ gameTime: new Date(Date.now() - 60_000) }).where(eq(games.id, gameIds[5]));
    await expect(storage.setDraftPick("sp-eve", leagueId, weekId, spread(5))).rejects.toThrow(/already started/);

    await db.insert(leagueWeekLocks).values({ leagueId, weekId, lockedBy: "sp-maestro" });
    await expect(storage.setDraftPick("sp-eve", leagueId, weekId, spread(2))).rejects.toThrow(/locked/);
  });
});
