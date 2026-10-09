/**
 * Keeps results moving while games are on, without anyone pressing a sync
 * button. Run every few minutes (server/jobs/live-results-queue.ts).
 *
 * A tick with nothing to do costs three small database reads and no network:
 * it only reaches out once a game on the active week has kicked off and
 * isn't final yet.
 *
 *  1. Final scores come from ESPN's scoreboard, which is live. Game bets
 *     (spread, moneyline, totals) are graded and parlays rolled up right
 *     after, so they settle minutes after the whistle.
 *  2. Player props are graded from player stats. Sacks and tackles come from
 *     ESPN's boxscore (live). Passing, rushing and receiving stats come from
 *     nflverse, which publishes them some hours after a game, so those props
 *     settle when nflverse does. They're retried every PROP_RETRY_MS until
 *     they land.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";
import { storage } from "../storage";
import { games, parlayLegs, parlays } from "@shared/db-schema";
import { enrichLeagueParlayLegs } from "./enrichment";
import { syncDefensiveStatsFromEspn, syncGameScoresFromEspn } from "./espnBoxscore";
import { ensureWeekPlayerStats } from "./nflverse";
import { resolvePropsFromStats } from "./propEnrichment";
import { detectExactDecisionMoments } from "./decisionDetection";
import { announceFinishedSlates } from "./parlayAlerts";

const PROP_RETRY_MS = 30 * 60 * 1000;
let lastPropAttempt = 0;

export type LiveResultsTick =
  | { ran: false; reason: string }
  | { ran: true; gamesFinalized: number; legsGraded: number; propsResolved: number | null; slateAlerts: number };

/** Unsettled prop legs this week whose game is already final. */
async function propsAwaitingStats(weekId: number): Promise<number> {
  const rows = await db
    .select({ id: parlayLegs.id })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(games, eq(parlayLegs.gameId, games.id))
    .where(and(
      eq(parlays.weekId, weekId),
      eq(parlayLegs.betType, "player_prop"),
      isNull(parlayLegs.result),
      eq(games.isFinished, true),
    ));
  return rows.length;
}

export async function runLiveResultsTick(now: Date = new Date()): Promise<LiveResultsTick> {
  // A locked parlay whose first game has kicked off is taken as placed.
  await storage.markStartedParlaysPlaced(now).catch((err) => logger.error({ err }, "[live results] couldn't mark started parlays placed"));

  const activeWeek = await storage.getActiveWeek();
  if (!activeWeek) return { ran: false, reason: "No active week" };

  const weekGames = await storage.getGamesByWeek(activeWeek.id);
  const underway = weekGames.filter((g) => !g.isFinished && g.gameTime && new Date(g.gameTime) <= now);
  const awaitingProps = await propsAwaitingStats(activeWeek.id);
  const propsDue = awaitingProps > 0 && now.getTime() - lastPropAttempt >= PROP_RETRY_MS;
  if (underway.length === 0 && !propsDue) return { ran: false, reason: "No games in progress" };

  let gamesFinalized = 0;
  let legsGraded = 0;
  if (underway.length > 0) {
    const scores = await syncGameScoresFromEspn(activeWeek.season, activeWeek.weekNumber);
    gamesFinalized = scores.updated;
    if (gamesFinalized > 0) {
      // Grades the game bets on the games that just went final, then rolls
      // every affected parlay up to won or lost.
      legsGraded = (await enrichLeagueParlayLegs()).resultsFilled;
    }
  }

  let propsResolved: number | null = null;
  if (gamesFinalized > 0 || propsDue) {
    lastPropAttempt = now.getTime();
    try {
      await ensureWeekPlayerStats(activeWeek.season, activeWeek.weekNumber);
    } catch (err) {
      logger.warn({ err }, "[live-results] nflverse player stats not available yet");
    }
    try {
      await syncDefensiveStatsFromEspn(activeWeek.season, activeWeek.weekNumber);
    } catch (err) {
      logger.warn({ err }, "[live-results] ESPN defensive stats sync failed");
    }
    propsResolved = (await resolvePropsFromStats()).resolved;
    if (propsResolved > 0) {
      await storage.rollupLeagueParlayStatuses();
      await detectExactDecisionMoments().catch((err) => logger.warn({ err }, "[live-results] decision detection failed"));
    }
  }

  const fresh = gamesFinalized > 0 ? await storage.getGamesByWeek(activeWeek.id) : weekGames;
  const slateAlerts = await announceFinishedSlates(activeWeek, fresh, now);
  return { ran: true, gamesFinalized, legsGraded, propsResolved, slateAlerts };
}
