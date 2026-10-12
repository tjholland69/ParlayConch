import { beforeAll, describe, expect, test } from "vitest";
import { and, eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, pickSuggestions } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * Suggested picks are stored whether or not they're taken, and a pick made
 * from one points back at it.
 */
describe("suggested picks", () => {
  setupTestDatabase();

  let leagueId = 0;
  let weekId = 0;
  let billsGame = 0;
  let lionsGame = 0;

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values([
      { id: "sg-amy", email: "sg-amy@example.com", firstName: "Amy" },
      { id: "sg-bo", email: "sg-bo@example.com", firstName: "Bo" },
    ]);
    const [league] = await db.insert(leagues)
      .values({ name: "Suggestion League", inviteCode: "SUGGEST001", minLegsPerParlay: 2, maxLegsPerParlay: 5 })
      .returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values([
      { leagueId, userId: "sg-amy", role: "admin" },
      { leagueId, userId: "sg-bo", role: "member" },
    ]);
    const [past, current] = await db.insert(weeks).values([
      { season: 2045, weekNumber: 1, label: "2045 Week 1", isActive: false },
      { season: 2045, weekNumber: 2, label: "2045 Week 2", isActive: false },
    ]).returning();
    weekId = current.id;

    // Last week: Amy went 4-0 backing the Bills.
    const [pastGame] = await db.insert(games)
      .values({ weekId: past.id, homeTeam: "Bills", awayTeam: "Jets", spread: "-3", isFinished: true, gameTime: new Date(Date.now() - 7 * 86_400_000) })
      .returning();
    for (let i = 0; i < 4; i++) {
      const [p] = await db.insert(parlays).values({ userId: "sg-amy", leagueId, weekId: past.id, status: "win" }).returning();
      await db.insert(parlayLegs).values({ parlayId: p.id, userId: "sg-amy", gameId: pastGame.id, betType: "spread", pick: "home", line: "-3 (-110)", result: "win" });
    }

    const kickoff = new Date(Date.now() + 3 * 86_400_000);
    const rows = await db.insert(games).values([
      { weekId, homeTeam: "Dolphins", awayTeam: "Bills", spread: "+2.5", spreadOdds: "-110", moneylineHome: "+120", moneylineAway: "-140", gameTime: kickoff },
      { weekId, homeTeam: "Lions", awayTeam: "Bears", spread: "-6", spreadOdds: "-110", gameTime: kickoff },
    ]).returning();
    [billsGame, lionsGame] = rows.map((g) => g.id);
  });

  test("suggestions are stored once, however often they're shown", async ({ skip }) => {
    skipIfNoDb(skip);
    const { suggestPicks } = await import("../server/services/pickSuggestions");
    const { db } = await import("../server/db");
    const first = await suggestPicks("sg-amy", leagueId, weekId);
    expect(first[0]).toMatchObject({ gameId: billsGame, pick: "away", reason: "own_team", detail: "You're 4-0 picking the Bills" });
    const second = await suggestPicks("sg-amy", leagueId, weekId);
    expect(second.map((s) => s.id)).toEqual(first.map((s) => s.id));
    const stored = await db.select().from(pickSuggestions).where(eq(pickSuggestions.userId, "sg-amy"));
    expect(stored).toHaveLength(first.length);
  });

  test("a bet another member has in the parlay stops being suggested", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { suggestPicks } = await import("../server/services/pickSuggestions");
    const parlay = await storage.setDraftPick("sg-bo", leagueId, weekId, { gameId: billsGame, betType: "spread", pick: "home", line: "+2.5 (-110)" });
    const out = await suggestPicks("sg-amy", leagueId, weekId, parlay.id);
    expect(out.some((s) => s.gameId === billsGame && s.betType === "spread")).toBe(false);
    expect(out.some((s) => s.gameId === billsGame && s.betType === "moneyline" && s.pick === "away")).toBe(true);
  });

  test("a pick made from a suggestion points back at it, and keeps the link when its line moves", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    const [suggestion] = await db.select().from(pickSuggestions)
      .where(and(eq(pickSuggestions.userId, "sg-amy"), eq(pickSuggestions.betType, "moneyline"), eq(pickSuggestions.gameId, billsGame)));
    const myLeg = async () => (await db.select().from(parlayLegs).innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(eq(parlays.weekId, weekId), eq(parlayLegs.userId, "sg-amy"))))[0].parlay_legs;

    await storage.setDraftPick("sg-amy", leagueId, weekId, { gameId: billsGame, betType: "moneyline", pick: "away", line: "-140", suggestionId: suggestion.id });
    expect((await myLeg()).suggestionId).toBe(suggestion.id);

    await storage.setDraftPick("sg-amy", leagueId, weekId, { gameId: billsGame, betType: "moneyline", pick: "away", line: "-140" });
    expect((await myLeg()).suggestionId).toBe(suggestion.id);
  });

  test("picking something else drops the link but keeps the suggestion on record", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    const before = (await db.select().from(pickSuggestions).where(eq(pickSuggestions.userId, "sg-amy"))).length;
    await storage.setDraftPick("sg-amy", leagueId, weekId, { gameId: lionsGame, betType: "spread", pick: "home", line: "-6 (-110)" });
    const [leg] = (await db.select().from(parlayLegs).where(eq(parlayLegs.userId, "sg-amy"))).filter((l) => l.gameId === lionsGame);
    expect(leg.suggestionId).toBeNull();
    expect(await db.select().from(pickSuggestions).where(eq(pickSuggestions.userId, "sg-amy"))).toHaveLength(before);
  });

  test("a suggestion made to someone else, or for a different bet, isn't linked", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../server/storage");
    const { db } = await import("../server/db");
    const [amys] = await db.select().from(pickSuggestions).where(eq(pickSuggestions.userId, "sg-amy"));
    await storage.setDraftPick("sg-bo", leagueId, weekId, { gameId: billsGame, betType: "spread", pick: "home", line: "+2.5 (-110)", suggestionId: amys.id });
    const [bos] = await db.select().from(parlayLegs).innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(eq(parlays.weekId, weekId), eq(parlayLegs.userId, "sg-bo")));
    expect(bos.parlay_legs.suggestionId).toBeNull();
  });
});
