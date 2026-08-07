/**
 * nflverse play-by-play sync — Phase 1 of timestamped-settlement work.
 *
 * `games.finishedAt` was previously stamped with `new Date()` at whatever
 * moment our periodic score sync happened to notice a game had ended — often
 * hours after the real final whistle. nflverse's play-by-play release
 * includes a `time_of_day` column: the real-world UTC timestamp (from GSIS)
 * of each play. The last play with a populated `time_of_day` is a close
 * proxy for the actual game-end moment, and is far more accurate than
 * "whenever the cron ran."
 *
 * This is display/analysis precision only — it never touches score, winner,
 * or leg results, which remain governed by syncGameScoresFromNflverse.
 */

import { storage } from "../storage";
import { logger } from "../logger";
import { fetchCsv, findGameInDb, abbrevToShort } from "./nflverse";

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

function playByPlayUrl(season: number) {
  return `${BASE}/pbp/play_by_play_${season}.csv`;
}

interface NflversePbpRow {
  game_id: string;
  season: string;
  week: string;
  home_team: string;
  away_team: string;
  time_of_day: string; // ISO-8601 UTC, blank for synthetic rows (e.g. "END GAME")
}

/**
 * Fetch a season's play-by-play file and reduce it to, for each game_id, the
 * timestamp of the last play that has a real-world time attached.
 */
async function getLastPlayTimestamps(season: number): Promise<Map<string, Date>> {
  logger.info(`[play-by-play] Fetching play-by-play for season ${season}…`);
  const rows = (await fetchCsv(playByPlayUrl(season))) as unknown as NflversePbpRow[];

  const lastTimestamp = new Map<string, Date>();
  for (const row of rows) {
    if (!row.time_of_day) continue;
    const t = new Date(row.time_of_day);
    if (isNaN(t.getTime())) continue;
    const existing = lastTimestamp.get(row.game_id);
    if (!existing || t.getTime() > existing.getTime()) {
      lastTimestamp.set(row.game_id, t);
    }
  }
  logger.info(`[play-by-play] ${lastTimestamp.size} games with a resolvable last-play timestamp`);
  return lastTimestamp;
}

/**
 * Sync `games.finishedAt` from play-by-play last-play timestamps for the
 * given season (and optionally specific week numbers). Only touches games
 * already in our DB and already marked finished — never changes score or
 * winner.
 *
 * Best-effort: if the play-by-play file isn't available for this season
 * (e.g. current week hasn't been published yet), returns zero updates rather
 * than throwing, so callers can treat this as an optional precision pass.
 */
export async function syncGameFinishTimesFromPlayByPlay(
  season: number,
  weekNumbers?: number[]
): Promise<{ updated: number; noMatch: number; notYetFinished: number }> {
  let lastTimestamp: Map<string, Date>;
  try {
    lastTimestamp = await getLastPlayTimestamps(season);
  } catch (err) {
    logger.warn({ err }, `[play-by-play] Could not fetch play-by-play for season ${season}; skipping finish-time sync`);
    return { updated: 0, noMatch: 0, notYetFinished: 0 };
  }

  let updated = 0;
  let noMatch = 0;
  let notYetFinished = 0;

  // Group games by (week, home, away) so we only need one lookup per game_id.
  const byGame = new Map<string, { week: number; home: string; away: string; timestamp: Date }>();
  for (const [gameId, timestamp] of lastTimestamp) {
    const parts = gameId.split("_"); // e.g. "2024_01_ARI_BUF"
    if (parts.length !== 4) continue;
    const [, weekStr, away, home] = parts;
    const week = parseInt(weekStr, 10);
    if (isNaN(week)) continue;
    if (weekNumbers && weekNumbers.length > 0 && !weekNumbers.includes(week)) continue;
    byGame.set(gameId, { week, home, away, timestamp });
  }

  for (const { week, home, away, timestamp } of byGame.values()) {
    const game = await findGameInDb(season, week, abbrevToShort(home), abbrevToShort(away));
    if (!game) {
      noMatch++;
      continue;
    }
    if (!game.isFinished) {
      // Game not yet marked finished by the score sync — leave finishedAt alone.
      notYetFinished++;
      continue;
    }
    await storage.setGameFinishedAt(game.id, timestamp);
    updated++;
  }

  return { updated, noMatch, notYetFinished };
}
