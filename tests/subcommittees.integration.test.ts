import { beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, leagues, leagueMembers } from "@shared/db-schema";
import { SubcommitteeError, leagueTerms, roleLabel } from "@shared/subcommittee";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * A subcommittee is a league inside a league: only the parent's members can
 * be in it, and it's invisible to everyone else.
 */
describe("subcommittees", () => {
  setupTestDatabase();

  let parentId = 0;
  let subId = 0;

  const member = async (leagueId: number, userId: string) => {
    const { db } = await import("../server/db");
    return (await db.select().from(leagueMembers).where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId))))[0];
  };

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    await db.insert(users).values(["amy", "bo", "cy", "di", "out"].map((n) => ({ id: `sc-${n}`, email: `sc-${n}@example.com`, firstName: n })));
    const parent = await storage.createLeague("sc-amy", { name: "Parent League" });
    parentId = parent.id;
    for (const n of ["bo", "cy", "di"]) await storage.addMemberToLeague(parentId, `sc-${n}`);
  });

  test("any member can form one, and runs it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const sub = await storage.createSubcommittee("sc-bo", parentId, { name: "The Breakout" }, ["sc-cy", "sc-di"]);
    subId = sub.id;
    expect(sub.parentLeagueId).toBe(parentId);
    expect((await member(subId, "sc-bo")).role).toBe("admin");
    expect((await member(subId, "sc-cy")).role).toBe("member");
    // Join dates are kept for a subcommittee as for any league.
    expect((await member(subId, "sc-cy")).startDate).toBeInstanceOf(Date);
  });

  test("outsiders can't form, join or be added to one", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    await expect(storage.createSubcommittee("sc-out", parentId, { name: "Nope" })).rejects.toBeInstanceOf(SubcommitteeError);
    await expect(storage.createSubcommittee("sc-bo", parentId, { name: "Nope" }, ["sc-out"])).rejects.toBeInstanceOf(SubcommitteeError);
    await expect(storage.addMemberToLeague(subId, "sc-out")).rejects.toBeInstanceOf(SubcommitteeError);
    const [sub] = await db.select().from(leagues).where(eq(leagues.id, subId));
    await expect(storage.joinLeague("sc-out", sub.inviteCode)).rejects.toBeInstanceOf(SubcommitteeError);
    // The database refuses too, whatever wrote the row.
    await expect(db.insert(leagueMembers).values({ leagueId: subId, userId: "sc-out" })).rejects.toThrow();
  });

  test("a subcommittee can't have subcommittees", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    await expect(storage.createSubcommittee("sc-bo", subId, { name: "Deeper" })).rejects.toBeInstanceOf(SubcommitteeError);
    await expect(db.insert(leagues).values({ name: "Deeper", inviteCode: "SCDEEP0001", parentLeagueId: subId })).rejects.toThrow();
  });

  test("only the people in it see it", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const ids = async (userId: string) => (await storage.getUserLeagues(userId)).map((l) => l.id);
    expect(await ids("sc-bo")).toEqual(expect.arrayContaining([parentId, subId]));
    // Amy runs the parent league and still isn't shown it.
    expect(await ids("sc-amy")).toEqual([parentId]);
    expect(await storage.getSubcommittees(parentId, "sc-amy")).toEqual([]);
    expect((await storage.getSubcommittees(parentId, "sc-cy")).map((l) => l.id)).toEqual([subId]);
  });

  test("reads that span leagues leave it out for outsiders", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    const { computeWinRateSeries } = await import("../server/services/dashboardAnalytics");
    const { weeks, games, parlays, parlayLegs } = await import("@shared/db-schema");
    const [week] = await db.insert(weeks).values({ season: 2016, weekNumber: 2, label: "2016 Week 2", isActive: false }).returning();
    const [game] = await db.insert(games).values({ weekId: week.id, homeTeam: "Subs", awayTeam: "Mains", isFinished: true }).returning();
    const [parlay] = await db.insert(parlays).values({ userId: "sc-bo", leagueId: subId, weekId: week.id, status: "win" }).returning();
    const [leg] = await db.insert(parlayLegs)
      .values({ parlayId: parlay.id, userId: "sc-bo", gameId: game.id, betType: "moneyline", pick: "home", result: "win" })
      .returning();

    expect(await storage.canSeeLeague(subId, "sc-bo")).toBe(true);
    expect(await storage.canSeeLeague(subId, "sc-amy")).toBe(false);
    expect(await storage.canSeeLeague(parentId, "sc-out")).toBe(true); // an ordinary league keeps its own checks
    expect(await storage.getLeagueIdForLeg(leg.id)).toBe(subId);

    // Asking for the subcommittee by id gets an outsider nothing.
    expect((await computeWinRateSeries("sc-bo", { leagueIds: [subId] })).points.length).toBeGreaterThan(0);
    expect((await computeWinRateSeries("sc-amy", { leagueIds: [subId] })).points).toEqual([]);

    expect((await storage.getLegExportRows("sc-di", { leagueId: subId })).map((r) => r.legId)).toEqual([leg.id]);
    expect(await storage.getLegExportRows("sc-amy", { leagueId: subId })).toEqual([]);

    // Off the global leaderboard, which everyone can see.
    const bo = (await storage.getStats()).find((row) => row.userId === "sc-bo");
    expect(bo?.wins ?? 0).toBe(0);
  });

  test("leaving the league leaves its subcommittees, on the same date", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const left = new Date("2026-01-05T00:00:00Z");
    await storage.leaveLeagueMember(parentId, "sc-cy", left);
    const row = await member(subId, "sc-cy");
    expect(row.isActive).toBe(false);
    expect(row.endDate?.toISOString()).toBe(left.toISOString());
    expect((await storage.getUserLeagues("sc-cy")).map((l) => l.id)).not.toContain(subId);
    // Its history went with the membership.
    expect(await storage.getLegExportRows("sc-cy", { leagueId: subId })).toEqual([]);
    // Back in the league, they can be added again.
    await storage.addMemberToLeague(parentId, "sc-cy");
    expect((await storage.addMemberToLeague(subId, "sc-cy")).isActive).toBe(true);
  });

  test("when the Frondeur leaves the league, the subcommittee passes on", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    await storage.setMemberRole(subId, "sc-di", "lieutenant");
    await storage.removeLeagueMember(parentId, "sc-bo");
    expect((await member(subId, "sc-bo")).isActive).toBe(false);
    // The minion takes over ahead of a plain member.
    expect((await member(subId, "sc-di")).role).toBe("admin");
  });

  test("deleting the league deletes its subcommittees", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    await db.delete(leagues).where(eq(leagues.id, parentId));
    expect(await db.select().from(leagues).where(eq(leagues.id, subId))).toEqual([]);
  });

  test("roles are named for a subcommittee on screen only", () => {
    expect(roleLabel({ parentLeagueId: 4 }, "admin")).toBe("Frondeur");
    expect(roleLabel({ parentLeagueId: 4 }, "lieutenant")).toBe("Minion");
    expect(roleLabel({ parentLeagueId: null }, "admin")).toBe("Parlay Maestro");
    expect(leagueTerms({ parentLeagueId: 4 }).kind).toBe("Subcommittee");
  });
});

describe("subcommittee wording", () => {
  test("league text is reworded for a subcommittee only", async () => {
    const { subcommitteeWording } = await import("@shared/subcommittee");
    const sub = { parentLeagueId: 4 };
    expect(subcommitteeWording("Only the Parlay Maestro (or a Lieutenant with Unlock permission) can unlock the parlay.", sub))
      .toBe("Only the Frondeur (or a Minion with Unlock permission) can unlock the parlay.");
    expect(subcommitteeWording("Maximum 2 Parlay Lieutenants allowed per league", sub)).toBe("Maximum 2 Minions allowed per league");
    expect(subcommitteeWording("Off, a lieutenant needs each member's own permission", sub)).toBe("Off, a minion needs each member's own permission");
    expect(subcommitteeWording("Only the Parlay Maestro can edit parlays", { parentLeagueId: null })).toBe("Only the Parlay Maestro can edit parlays");
    // League names often contain the word: it's never touched.
    expect(subcommitteeWording("Dev League: the parlay is locked", sub)).toBe("Dev League: the parlay is locked");
  });
});
