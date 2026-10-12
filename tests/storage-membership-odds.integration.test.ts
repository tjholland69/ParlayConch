import { beforeAll, describe, expect, test } from "vitest";
import { eq, sql } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * Who can have a pick in a league's parlay (members only, super users
 * included), the odds recorded off the ticket, and the Open Parlays report.
 */
describe("pick membership, actual parlay odds, and the Open Parlays report", () => {
  setupTestDatabase();

  let leagueId = 0;
  let weekId = 0;
  let gameIds: number[] = [];

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values([
      { id: "mo-maestro", email: "mo-maestro@example.com", firstName: "Mae" },
      { id: "mo-amy", email: "mo-amy@example.com", firstName: "Amy" },
      { id: "mo-bo", email: "mo-bo@example.com", firstName: "Bo" },
      { id: "mo-left", email: "mo-left@example.com", firstName: "Lee" },
      { id: "mo-super", email: "mo-super@example.com", firstName: "Sue", isSuperUser: true },
    ]);
    const [league] = await db.insert(leagues)
      .values({ name: "Members Only", inviteCode: "MEMBERS001", minLegsPerParlay: 2, maxLegsPerParlay: 5 })
      .returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values([
      { leagueId, userId: "mo-maestro", role: "admin" },
      { leagueId, userId: "mo-amy", role: "member" },
      { leagueId, userId: "mo-bo", role: "member" },
      // Left the league: the row stays, inactive.
      { leagueId, userId: "mo-left", role: "member", isActive: false, endDate: new Date() },
    ]);
    const [week] = await db.insert(weeks).values({ season: 2044, weekNumber: 1, label: "2044 Week 1", isActive: false }).returning();
    weekId = week.id;
    const kickoff = new Date(Date.now() + 3 * 86_400_000);
    const rows = await db.insert(games).values(
      ["A", "B", "C"].map((t) => ({ weekId, homeTeam: `${t}-home`, awayTeam: `${t}-away`, spread: "-3.5", overUnder: "44.5", gameTime: kickoff })),
    ).returning();
    gameIds = rows.map((g) => g.id);
  });

  const spread = (game: number, odds = "-110") => ({ gameId: gameIds[game], betType: "spread", pick: "home", line: "-3.5", odds });

  test("a super user who isn't in the league can't have a pick of their own in it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    await expect(storage.setDraftPick("mo-super", leagueId, weekId, spread(0))).rejects.toThrow(/aren't a member of this league.*On Behalf Of/);
    // Nothing was started on the way to that refusal.
    expect(await db.select().from(parlays).where(eq(parlays.leagueId, leagueId))).toHaveLength(0);
  });

  test("nor can someone who has left it, even On Behalf Of", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await expect(storage.setDraftPick("mo-left", leagueId, weekId, spread(0))).rejects.toThrow(/aren't a member/);
    await expect(storage.setDraftPick("mo-left", leagueId, weekId, spread(0), { placedByUserId: "mo-super" }))
      .rejects.toThrow(/isn't a member of this league/);
  });

  let parlayId = 0;

  test("the super user can still pick On Behalf Of a member, who then has to approve it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    parlayId = (await storage.setDraftPick("mo-amy", leagueId, weekId, spread(0), { placedByUserId: "mo-super" })).id;
    const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
    expect(leg).toMatchObject({ userId: "mo-amy", placedByUserId: "mo-super", approvalStatus: "pending" });
  });

  test("a pick is stamped when it's saved, and again when it's changed", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    await storage.setDraftPick("mo-bo", leagueId, weekId, spread(1));
    const legOf = async () => (await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId))).find((l) => l.userId === "mo-bo")!;
    const first = await legOf();
    expect(first.createdAt).toBeInstanceOf(Date);
    // Backdate it (by the database's own clock), then swap the pick: the
    // new pick carries a fresh time.
    await db.update(parlayLegs).set({ createdAt: sql`now() - interval '1 hour'` }).where(eq(parlayLegs.id, first.id));
    const backdated = (await legOf()).createdAt!;
    await storage.setDraftPick("mo-bo", leagueId, weekId, spread(2));
    const swapped = await legOf();
    expect(swapped.gameId).toBe(gameIds[2]);
    expect(swapped.createdAt!.getTime() - backdated.getTime()).toBeGreaterThan(59 * 60_000);
  });

  test("the Open Parlays report lists who's in, when, and who still owes a pick", async ({ skip }) => {
    skipIfNoDb(skip);
    const { getLeagueReport } = await import("../server/services/reports");
    const report = await getLeagueReport(leagueId, "open_parlays");
    const rows = report!.dataset.rows;
    expect(rows.map((r) => [r.member, r.status])).toEqual([["Amy", "In"], ["Bo", "In"], ["Mae", "Open"]]);
    expect(rows.every((r) => (r.status === "In") === (typeof r.picked_at === "string"))).toBe(true);
    expect(report!.chart.bars).toEqual([{ label: "2044 Week 1", value: 2, display: "2/3" }]);
    expect(report!.text).toContain("Still need a pick (1): Mae");
    // Someone who left isn't chased for a pick.
    expect(report!.text).not.toContain("Lee");
  });

  test("odds recorded off the ticket are kept on the parlay and can be cleared", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { parlayOdds } = await import("@shared/parlayOdds");
    const legs = await (await import("../server/db")).db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
    expect(parlayOdds({ ...(await storage.getParlay(parlayId))!, legs })).toMatchObject({ label: "+264", estimated: true });

    const saved = await storage.setParlayActualOdds(parlayId, "+310");
    expect(saved.actualOdds).toBe("+310");
    expect(parlayOdds({ ...saved, legs })).toMatchObject({ label: "+310", estimated: false });

    const cleared = await storage.setParlayActualOdds(parlayId, null);
    expect(parlayOdds({ ...cleared, legs })).toMatchObject({ label: "+264", estimated: true });
  });

  test("once it's submitted there's nothing open to report", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { getLeagueReport } = await import("../server/services/reports");
    await db.update(parlays).set({ status: "pending" }).where(eq(parlays.id, parlayId));
    const report = await getLeagueReport(leagueId, "open_parlays");
    expect(report!.dataset.rows).toEqual([]);
    expect(report!.text).toContain("No parlay is open for picks right now.");
  });
});
