import { beforeAll, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, games, parlays, parlayLegs, players } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb, testDb } from "./helpers/test-db";

// ESPN is the only thing the tick reaches out to here. `espn.final` flips the
// scoreboard from "in progress" to "final".
const espn = { final: false };
vi.mock("../server/lib/fetchWithRetry", () => ({
  fetchJsonWithRetry: async (url: string) => {
    if (url.includes("/scoreboard")) {
      return {
        events: [{
          id: "evt-1",
          status: { type: { completed: espn.final } },
          competitions: [{ competitors: [
            { homeAway: "home", team: { abbreviation: "LAR" }, score: "37" },
            { homeAway: "away", team: { abbreviation: "BUF" }, score: "34" },
          ] }],
        }],
      };
    }
    return {
      boxscore: { players: [{
        team: { abbreviation: "BUF" },
        statistics: [
          { name: "rushing", labels: ["CAR", "YDS", "AVG", "TD", "LONG"], athletes: [{ athlete: { id: "lr-9001", displayName: "Zed Runnerman" }, stats: ["21", "165", "7.9", "1", "72"] }] },
          { name: "passing", labels: ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"], athletes: [{ athlete: { id: "lr-9002", displayName: "Quin Throwsby" }, stats: ["19/25", "189", "7.6", "1", "0", "1-11", "59.4", "110.2"] }] },
        ],
      }] },
    };
  },
}));

/**
 * Picks settle on their own once a game ends: the grading queue keeps a
 * pick until it has a result, and the live tick reads scores and player
 * stats from ESPN.
 */
describe("live results", () => {
  setupTestDatabase();

  const now = new Date("2017-09-24T22:00:00Z");
  let gameId = 0;
  let parlayId = 0;
  const legs: Record<string, number> = {};

  beforeAll(async () => {
    if (!testDb.ready) return;
    const { db } = await import("../server/db");
    await db.insert(users).values({ id: "lr-amy", email: "lr-amy@example.com", firstName: "Amy" });
    const [league] = await db.insert(leagues).values({ name: "Live League", inviteCode: "LIVE000001" }).returning();
    await db.insert(leagueMembers).values({ leagueId: league.id, userId: "lr-amy", role: "admin" });
    // Not the active week: the tick goes by kickoff time.
    const [week] = await db.insert(weeks).values({ season: 2017, weekNumber: 3, label: "2017 Week 3", isActive: false }).returning();
    const [game] = await db.insert(games)
      .values({ weekId: week.id, homeTeam: "Rams", awayTeam: "Bills", overUnder: "50.5", spread: "-3.5", gameTime: new Date("2017-09-24T18:00:00Z"), isFinished: false })
      .returning();
    gameId = game.id;
    // The stat file knows this player's position; ESPN's boxscore doesn't.
    await db.insert(players).values({ name: "Z.Runnerman", displayName: "Zed Runnerman", position: "RB", team: "BUF" });
    const [parlay] = await db.insert(parlays).values({ userId: "lr-amy", leagueId: league.id, weekId: week.id, status: "placed" }).returning();
    parlayId = parlay.id;
    const leg = async (values: Record<string, unknown>) =>
      (await db.insert(parlayLegs).values({ parlayId, userId: "lr-amy", gameId, ...values } as any).returning())[0].id;
    legs.under = await leg({ betType: "under", pick: "under", line: "U54.5 (-105)" });
    legs.spread = await leg({ betType: "spread", pick: "away", line: "+3.5 (-110)" });
    legs.rush = await leg({ betType: "player_prop", pick: "over", propType: "rush_yards", playerName: "Zed Runnerman", line: "80.5" });
    legs.pass = await leg({ betType: "player_prop", pick: "under", propType: "pass_yards", playerName: "Quin Throwsby", line: "220.5" });
  });

  const legRow = async (id: number) => {
    const { db } = await import("../server/db");
    return (await db.select().from(parlayLegs).where(eq(parlayLegs.id, id)))[0];
  };

  test("a pick whose game isn't over stays in the grading queue", async ({ skip }) => {
    skipIfNoDb(skip);
    const { enrichLeagueParlayLegs } = await import("../server/services/enrichment");
    await enrichLeagueParlayLegs();
    const under = await legRow(legs.under);
    expect(under.result).toBeNull();
    expect(under.oddsEnriched).toBe(false);
  });

  test("a tick during the game changes nothing", async ({ skip }) => {
    skipIfNoDb(skip);
    const { runLiveResultsTick } = await import("../server/services/liveResults");
    const tick = await runLiveResultsTick(now);
    expect(tick).toMatchObject({ ran: true, gamesFinalized: 0, legsGraded: 0 });
    expect((await legRow(legs.under)).result).toBeNull();
  });

  test("the tick after the whistle settles game bets and props", async ({ skip }) => {
    skipIfNoDb(skip);
    espn.final = true;
    const { db } = await import("../server/db");
    const { runLiveResultsTick } = await import("../server/services/liveResults");
    const tick = await runLiveResultsTick(now);
    expect(tick).toMatchObject({ ran: true, gamesFinalized: 1, legsGraded: 2, propsResolved: 2 });

    // 71 points against an under of 54.5, graded on the pick's own line.
    expect((await legRow(legs.under)).result).toBe("loss");
    expect((await legRow(legs.spread)).result).toBe("win");
    expect((await legRow(legs.rush)).result).toBe("win");
    expect((await legRow(legs.pass)).result).toBe("win");

    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, parlayId));
    expect(parlay.status).toBe("loss");

    // ESPN's boxscore has no position: the one already on file is kept.
    const [runner] = await db.select().from(players).where(eq(players.displayName, "Zed Runnerman"));
    expect(runner.position).toBe("RB");
    expect(runner.espnId).toBe("lr-9001");
  });

  test("with everything settled the tick goes back to idle", async ({ skip }) => {
    skipIfNoDb(skip);
    const { runLiveResultsTick } = await import("../server/services/liveResults");
    expect(await runLiveResultsTick(now)).toMatchObject({ ran: false });
  });
});
