/**
 * Keeps results moving while games are on, without anyone pressing a sync
 * button. Run every couple of minutes (server/jobs/live-results-queue.ts).
 *
 * A tick with nothing to do costs a few small database reads and no network:
 * it only reaches out once a game has kicked off and isn't final yet, or a
 * pick on a finished game is still unsettled.
 *
 *  1. Final scores come from ESPN's scoreboard, which is live. Game bets
 *     (spread, moneyline, totals) are graded and parlays rolled up right
 *     after, so they settle minutes after the whistle.
 *  2. Player props are graded from player stats, which ESPN's boxscore has
 *     at the whistle too. nflverse publishes the same numbers some hours
 *     later; a prop ESPN couldn't settle (a name it spells differently, say)
 *     is retried every PROP_RETRY_MS against both until it lands.
 *
 * Games are found by kickoff time, not by the active week, so a Monday
 * night game still settles after the week has rolled over.
 */
import { and, eq, gte, isNull, lte, notInArray, or } from "drizzle-orm";
import { db } from "../db";
import { logger } from "../logger";
import { storage } from "../storage";
import { games, parlayLegs, parlays, weeks } from "@shared/db-schema";
import { enrichLeagueParlayLegs } from "./enrichment";
import { syncPlayerStatsFromEspn, syncGameScoresFromEspn } from "./espnBoxscore";
import { ensureWeekPlayerStats } from "./nflverse";
import { resolvePropsFromStats } from "./propEnrichment";
import { detectExactDecisionMoments } from "./decisionDetection";
import { announceFinishedSlates } from "./parlayAlerts";

const PROP_RETRY_MS = 15 * 60 * 1000;
// A game that never goes final (cancelled, or a seeded one) stops being
// chased after this long.
const UNDERWAY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
let lastPropAttempt = 0;

export type LiveResultsTick =
  | { ran: false; reason: string }
  | { ran: true; gamesFinalized: number; legsGraded: number; propsResolved: number | null; slateAlerts: number };

type WeekRef = { weekId: number; season: number; weekNumber: number };
const weekKey = (w: WeekRef) => w.weekId;

/** Weeks with a game that has kicked off and isn't final. */
async function weeksWithGamesUnderway(now: Date): Promise<WeekRef[]> {
  const rows = await db
    .selectDistinct({ weekId: weeks.id, season: weeks.season, weekNumber: weeks.weekNumber })
    .from(games)
    .innerJoin(weeks, eq(games.weekId, weeks.id))
    .where(and(
      eq(games.isFinished, false),
      lte(games.gameTime, now),
      gte(games.gameTime, new Date(now.getTime() - UNDERWAY_WINDOW_MS)),
    ));
  return rows;
}

/**
 * Unsettled picks on games that went final recently, by kind. Older ones
 * are left to the nightly jobs and the Data Editor rather than retried here
 * for ever.
 */
async function unsettledOnFinishedGames(now: Date): Promise<{ gameBets: number; props: (WeekRef & { gameId: number })[] }> {
  const rows = await db
    .select({ betType: parlayLegs.betType, gameId: games.id, weekId: weeks.id, season: weeks.season, weekNumber: weeks.weekNumber })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(games, eq(parlayLegs.gameId, games.id))
    .innerJoin(weeks, eq(games.weekId, weeks.id))
    .where(and(
      isNull(parlayLegs.result),
      eq(games.isFinished, true),
      gte(games.finishedAt, new Date(now.getTime() - UNDERWAY_WINDOW_MS)),
      // Game bets leave the queue once graded; one still in it is waiting.
      or(eq(parlayLegs.betType, "player_prop"), eq(parlayLegs.oddsEnriched, false)),
      notInArray(parlays.status, ["draft", "void"]),
    ));
  return {
    gameBets: rows.filter((r) => r.betType !== "player_prop").length,
    props: rows.filter((r) => r.betType === "player_prop"),
  };
}

export async function runLiveResultsTick(now: Date = new Date()): Promise<LiveResultsTick> {
  // A locked parlay whose first game has kicked off is taken as placed.
  await storage.markStartedParlaysPlaced(now).catch((err) => logger.error({ err }, "[live results] couldn't mark started parlays placed"));

  const underway = await weeksWithGamesUnderway(now);
  const before = await unsettledOnFinishedGames(now);
  const propsDue = before.props.length > 0 && now.getTime() - lastPropAttempt >= PROP_RETRY_MS;
  if (underway.length === 0 && before.gameBets === 0 && !propsDue) return { ran: false, reason: "No games in progress" };

  let gamesFinalized = 0;
  for (const week of underway) {
    try {
      gamesFinalized += (await syncGameScoresFromEspn(week.season, week.weekNumber)).updated;
    } catch (err) {
      logger.warn({ err, week }, "[live-results] ESPN score sync failed");
    }
  }

  // Grades the game bets on games that are final, whichever sync made them
  // so, then rolls every affected parlay up to won or lost.
  let legsGraded = 0;
  if (gamesFinalized > 0 || before.gameBets > 0) {
    legsGraded = (await enrichLeagueParlayLegs()).resultsFilled;
  }

  let propsResolved: number | null = null;
  const waiting = gamesFinalized > 0 ? (await unsettledOnFinishedGames(now)).props : before.props;
  if (waiting.length > 0 && (gamesFinalized > 0 || propsDue)) {
    lastPropAttempt = now.getTime();
    const byWeek = new Map<number, WeekRef & { gameIds: Set<number> }>();
    for (const p of waiting) {
      const entry = byWeek.get(weekKey(p)) ?? { weekId: p.weekId, season: p.season, weekNumber: p.weekNumber, gameIds: new Set<number>() };
      entry.gameIds.add(p.gameId);
      byWeek.set(weekKey(p), entry);
    }
    for (const week of Array.from(byWeek.values())) {
      try {
        await syncPlayerStatsFromEspn(week.season, week.weekNumber, { offense: true, gameIds: week.gameIds });
      } catch (err) {
        logger.warn({ err }, "[live-results] ESPN player stats sync failed");
      }
    }
    propsResolved = (await resolvePropsFromStats()).resolved;
    // Whatever ESPN couldn't settle waits for nflverse's own numbers.
    if (propsDue && propsResolved < waiting.length) {
      for (const week of Array.from(byWeek.values())) {
        try {
          await ensureWeekPlayerStats(week.season, week.weekNumber);
        } catch (err) {
          logger.warn({ err }, "[live-results] nflverse player stats not available yet");
        }
      }
      propsResolved += (await resolvePropsFromStats()).resolved;
    }
    if (propsResolved > 0) {
      await storage.rollupLeagueParlayStatuses();
      await detectExactDecisionMoments().catch((err) => logger.warn({ err }, "[live-results] decision detection failed"));
    }
  }

  let slateAlerts = 0;
  const activeWeek = await storage.getActiveWeek();
  if (activeWeek) {
    slateAlerts = await announceFinishedSlates(activeWeek, await storage.getGamesByWeek(activeWeek.id), now);
  }
  return { ran: true, gamesFinalized, legsGraded, propsResolved, slateAlerts };
}
