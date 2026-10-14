import { beforeAll, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, players, teams } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

/**
 * A prop leg is linked to its player by the database, whichever code path
 * wrote it (trigger parlay_legs_link_player, migration 0030).
 */
describe("prop legs link to their player", () => {
  setupTestDatabase();

  let parlayId = 0;
  let leagueId = 0;
  let gameId = 0;
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values({ id: "lp-amy", email: "lp-amy@example.com", firstName: "Amy" });
    const [league] = await db.insert(leagues).values({ name: "Link League", inviteCode: "LINK000001" }).returning();
    leagueId = league.id;
    await db.insert(leagueMembers).values({ leagueId, userId: "lp-amy", role: "admin" });
    const [week] = await db.insert(weeks).values({ season: 2018, weekNumber: 1, label: "2018 Week 1", isActive: false }).returning();
    await db.insert(teams).values([
      { abbreviation: "ZZA", fullName: "Linkville Otters", city: "Linkville", nickname: "Otters" },
      { abbreviation: "ZZB", fullName: "Joinburg Yaks", city: "Joinburg", nickname: "Yaks" },
      { abbreviation: "ZZC", fullName: "Farway Emus", city: "Farway", nickname: "Emus" },
    ]);
    const [game] = await db.insert(games).values({ weekId: week.id, homeTeam: "Otters", awayTeam: "Yaks", isFinished: true }).returning();
    gameId = game.id;
    const rows = await db.insert(players).values([
      { name: "D.Henryx", displayName: "Derrick Henryx", position: "RB", team: "ZZA" },
      { name: "J.Twin", displayName: "Josh Twin", position: "QB", team: "ZZB" },
      { name: "J.Twin", displayName: "Josh Twin", position: "LB", team: "ZZC" },
      { name: "M.Far", displayName: "Mo Far", position: "WR", team: "ZZC" },
      { name: "M.Far", displayName: "Mo Far", position: "TE", team: "ZZC" },
    ]).returning();
    Object.assign(ids, { henry: rows[0].id, twinQb: rows[1].id });
    const [parlay] = await db.insert(parlays).values({ userId: "lp-amy", leagueId, weekId: week.id, status: "win" }).returning();
    parlayId = parlay.id;
  });

  const addProp = async (playerName: string | null, extra: Record<string, unknown> = {}) => {
    const { db } = await import("../server/db");
    const [leg] = await db.insert(parlayLegs)
      .values({ parlayId, userId: "lp-amy", gameId, betType: "player_prop", pick: "over", propType: "rush_yards", playerName, result: "win", ...extra })
      .returning();
    return leg;
  };

  test("a name is matched however it was typed", async ({ skip }) => {
    skipIfNoDb(skip);
    expect((await addProp("Derrick Henryx")).playerId).toBe(ids.henry);
    expect((await addProp("  derrick henryx ")).playerId).toBe(ids.henry);
    expect((await addProp("D.Henryx")).playerId).toBe(ids.henry);
  });

  test("two players with one name: the one in the leg's game is linked", async ({ skip }) => {
    skipIfNoDb(skip);
    expect((await addProp("Josh Twin")).playerId).toBe(ids.twinQb);
    // Neither is in this game, or there's no game to go by: left unlinked.
    expect((await addProp("Mo Far")).playerId).toBeNull();
    expect((await addProp("Josh Twin", { gameId: null })).playerId).toBeNull();
  });

  test("an unknown name, or a bet that isn't a prop, has no player", async ({ skip }) => {
    skipIfNoDb(skip);
    expect((await addProp("Nobody Atall")).playerId).toBeNull();
    expect((await addProp(null)).playerId).toBeNull();
    expect((await addProp("Derrick Henryx", { betType: "spread", pick: "home", propType: null })).playerId).toBeNull();
  });

  test("correcting the name moves the link; other edits leave it alone", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const leg = await addProp("Nobody Atall");
    const [renamed] = await db.update(parlayLegs).set({ playerName: "Derrick Henryx" }).where(eq(parlayLegs.id, leg.id)).returning();
    expect(renamed.playerId).toBe(ids.henry);
    const [graded] = await db.update(parlayLegs).set({ result: "loss" }).where(eq(parlayLegs.id, leg.id)).returning();
    expect(graded.playerId).toBe(ids.henry);
    const [cleared] = await db.update(parlayLegs).set({ playerName: null }).where(eq(parlayLegs.id, leg.id)).returning();
    expect(cleared.playerId).toBeNull();
  });

  test("a prop typed before its player was on file is linked when the players are next synced", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    const leg = await addProp("Rookie Newman");
    expect(leg.playerId).toBeNull();
    const saved = await storage.bulkUpsertPlayers([{ nflverseId: "00-LINKTEST", name: "R.Newman", displayName: "Rookie Newman", position: "WR", team: "ZZA" }]);
    const [linked] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, leg.id));
    expect(linked.playerId).toBe(saved.get("00-LINKTEST"));
  });

  test("trends read the position off the linked player", async ({ skip }) => {
    skipIfNoDb(skip);
    const { leaguePickTrends } = await import("../server/services/pickSuggestions");
    const { you } = await leaguePickTrends("lp-amy", leagueId);
    const backs = you.find((t) => t.key === "position:RB");
    expect(backs).toMatchObject({ phrase: "betting running backs", hot: true });
    expect(backs!.wins).toBeGreaterThanOrEqual(3);
  });
});
