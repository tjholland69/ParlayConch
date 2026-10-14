import { beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs } from "@shared/db-schema";
import { happenedAt, parlayHappenedAt, wasMemberAt } from "@shared/membershipWindow";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

describe("membership window helpers", () => {
  test("a member is in the league from their start to their end, inclusive", () => {
    const m = { startDate: "2023-09-01T00:00:00Z", endDate: "2024-01-31T23:59:59Z" };
    expect(wasMemberAt(m, "2023-08-31T23:00:00Z")).toBe(false);
    expect(wasMemberAt(m, "2023-09-10T17:00:00Z")).toBe(true);
    expect(wasMemberAt(m, "2024-02-01T00:00:00Z")).toBe(false);
    expect(wasMemberAt({ startDate: "2023-09-01T00:00:00Z", endDate: null }, "2030-01-01T00:00:00Z")).toBe(true);
    expect(wasMemberAt(m, null)).toBe(true);
  });

  test("a parlay happened at its first kickoff, not when it was typed in", () => {
    const parlay = { createdAt: "2026-08-25T12:00:00Z" };
    const legs = [{ game: { gameTime: "2023-09-17T17:00:00Z" } }, { game: { gameTime: "2023-09-14T00:15:00Z" } }, { game: null }];
    expect(parlayHappenedAt(parlay, legs)).toBe(Date.parse("2023-09-14T00:15:00Z"));
    expect(parlayHappenedAt(parlay, [{ game: null }])).toBe(Date.parse("2026-08-25T12:00:00Z"));
    expect(happenedAt([], null)).toBeNull();
  });
});

/**
 * History entered long after it was played: weeks date from their kickoffs,
 * and the Maestro can correct when each member was really in the league.
 */
describe("member dates and historical voids", () => {
  setupTestDatabase();

  let leagueId = 0;
  const weekIds: number[] = [];

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values([
      { id: "md-founder", email: "md-founder@example.com", firstName: "Fay" },
      { id: "md-late", email: "md-late@example.com", firstName: "Lou" },
      { id: "md-gone", email: "md-gone@example.com", firstName: "Gus" },
    ]);
    const [league] = await db.insert(leagues).values({ name: "History League", inviteCode: "HISTORY001" }).returning();
    leagueId = league.id;
    // Everyone signed up to the app this year; the history is from 2019.
    await db.insert(leagueMembers).values([
      { leagueId, userId: "md-founder", role: "admin" },
      { leagueId, userId: "md-late", role: "member" },
      { leagueId, userId: "md-gone", role: "member", isActive: false, endDate: new Date() },
    ]);
    // Three weeks of 2019. The founder picked in weeks 1 and 3 (missed 2);
    // the late joiner only arrived for week 3.
    for (const n of [1, 2, 3]) {
      const [week] = await db.insert(weeks).values({ season: 2019, weekNumber: n, label: `2019 Week ${n}`, isActive: false }).returning();
      weekIds.push(week.id);
      const kickoff = new Date(Date.UTC(2019, 8, 2 + 7 * n, 17));
      const [game] = await db.insert(games).values({ weekId: week.id, homeTeam: `H${n}`, awayTeam: `A${n}`, gameTime: kickoff, isFinished: true }).returning();
      const pickers = n === 1 ? ["md-founder", "md-gone"] : n === 2 ? ["md-gone"] : ["md-founder", "md-late"];
      const [parlay] = await db.insert(parlays).values({ userId: pickers[0], leagueId, weekId: week.id, status: "loss", source: "imported" }).returning();
      await db.insert(parlayLegs).values(pickers.map((userId) => ({ parlayId: parlay.id, userId, gameId: game.id, betType: "spread", pick: "home", result: "win" })));
    }
  });

  const statFor = async (userId: string) => {
    const { storage } = await import("../server/storage");
    return (await storage.getLeagueStats(leagueId)).find((s) => s.userId === userId)!;
  };

  test("weeks played before anyone's start date count against nobody", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    expect((await storage.getMissedWeeksForMember(leagueId, "md-founder")).eligibleCount).toBe(0);
    expect((await storage.getMissedWeeksForMember(leagueId, "md-late")).weeks).toEqual([]);
  });

  test("backdating to first pick makes each member answerable from the week they first picked", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const changed = await storage.backdateMembersToFirstPick(leagueId);
    expect(changed.map((c) => c.userId).sort()).toEqual(["md-founder", "md-gone", "md-late"]);
    expect(changed.find((c) => c.userId === "md-founder")!.to.toISOString()).toBe("2019-09-09T17:00:00.000Z");

    // The founder was there for all three and missed week 2.
    const founder = await storage.getMissedWeeksForMember(leagueId, "md-founder");
    expect(founder).toMatchObject({ eligibleCount: 3, submittedCount: 2 });
    expect(founder.weeks.map((w) => w.weekNumber)).toEqual([2]);
    // The late joiner isn't Void for the two weeks before they arrived.
    expect(await storage.getMissedWeeksForMember(leagueId, "md-late")).toMatchObject({ eligibleCount: 1, submittedCount: 1, weeks: [] });
    // Standings agree: 1 of 1 for the late joiner, 2 of 3 for the founder.
    expect((await statFor("md-late")).participationRate).toBeGreaterThan((await statFor("md-founder")).participationRate);
    // Running it again changes nothing: it never moves a date later.
    expect(await storage.backdateMembersToFirstPick(leagueId)).toEqual([]);
  });

  test("the Maestro can set a member's dates by hand", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    // The late joiner was really there from week 2 and skipped it.
    await storage.setMemberDates(leagueId, "md-late", { startDate: new Date("2019-09-10T00:00:00Z") });
    const late = await storage.getMissedWeeksForMember(leagueId, "md-late");
    expect(late.weeks.map((w) => w.weekNumber)).toEqual([2]);

    // Someone who left after week 2 isn't answerable for week 3.
    await storage.setMemberDates(leagueId, "md-gone", { startDate: new Date("2019-09-01T00:00:00Z"), endDate: new Date("2019-09-17T23:59:59Z") });
    expect(await storage.getMissedWeeksForMember(leagueId, "md-gone")).toMatchObject({ eligibleCount: 2, submittedCount: 2 });
  });

  test("dates that make no sense are refused", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    const tomorrow = new Date(Date.now() + 86_400_000);
    await expect(storage.setMemberDates(leagueId, "md-founder", { startDate: tomorrow })).rejects.toThrow(/future/);
    await expect(storage.setMemberDates(leagueId, "md-founder", { startDate: new Date("2019-09-01"), endDate: new Date("2041-01-01") })).rejects.toThrow(/has left/);
    await expect(storage.setMemberDates(leagueId, "md-gone", { startDate: new Date("2019-09-01"), endDate: null })).rejects.toThrow(/needs an end date/);
    await expect(storage.setMemberDates(leagueId, "md-gone", { startDate: new Date("2019-09-01"), endDate: new Date("2019-08-01") })).rejects.toThrow(/after the start/);
    await expect(storage.setMemberDates(leagueId, "nobody", { startDate: new Date("2019-09-01") })).rejects.toThrow(/isn't in this league/);
    const [founder] = await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, "md-founder")));
    expect(founder.endDate).toBeNull();
  });
});
