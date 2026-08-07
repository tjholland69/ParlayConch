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
 * This module also exposes the grouped/ordered play data itself
 * (getPlaysByGame) so Phase 3 (decisionDetection.ts) can walk a game's plays
 * in order to find the exact moment a leg's outcome became fixed, without
 * re-implementing the fetch/group/sort logic.
 */

import { storage } from "../storage";
import { logger } from "../logger";
import { fetchCsv, findGameInDb, abbrevToShort } from "./nflverse";

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

function playByPlayUrl(season: number) {
  return `${BASE}/pbp/play_by_play_${season}.csv`;
}

// A play-by-play row from nflverse. Only the columns this codebase actually
// reads are typed; the CSV has ~370 columns total.
export interface PbpRow {
  play_id: string;
  game_id: string;
  season: string;
  week: string;
  home_team: string;
  away_team: string;
  qtr: string;
  time: string;              // game clock, e.g. "9:14"
  time_of_day: string;       // ISO-8601 UTC, blank for synthetic rows (e.g. "END GAME")
  desc: string;
  game_seconds_remaining: string; // seconds left in regulation at this play (0 in OT)
  total_home_score: string;
  total_away_score: string;
  rush_attempt: string;
  rusher_player_id: string;
  rushing_yards: string;
  rush_touchdown: string;
  complete_pass: string;
  receiver_player_id: string;
  receiving_yards: string;
  pass_touchdown: string;
  pass_attempt: string;
  passer_player_id: string;
  passing_yards: string;
  interception: string;
}

export interface GameId {
  season: number;
  week: number;
  awayAbbrev: string;
  homeAbbrev: string;
}

/** Parse an nflverse game_id like "2024_01_ARI_BUF" → structured parts. */
export function parseGameId(gameId: string): GameId | null {
  const parts = gameId.split("_");
  if (parts.length !== 4) return null;
  const [seasonStr, weekStr, away, home] = parts;
  const season = parseInt(seasonStr, 10);
  const week = parseInt(weekStr, 10);
  if (isNaN(season) || isNaN(week)) return null;
  return { season, week, awayAbbrev: away, homeAbbrev: home };
}

/**
 * Fetch a season's play-by-play file and group rows by game_id, each game's
 * plays sorted chronologically (ascending numeric play_id — nflverse assigns
 * these in play order within a game).
 */
export async function getPlaysByGame(season: number): Promise<Map<string, PbpRow[]>> {
  logger.info(`[play-by-play] Fetching play-by-play for season ${season}…`);
  const rows = (await fetchCsv(playByPlayUrl(season))) as unknown as PbpRow[];

  const byGame = new Map<string, PbpRow[]>();
  for (const row of rows) {
    const list = byGame.get(row.game_id);
    if (list) list.push(row);
    else byGame.set(row.game_id, [row]);
  }
  for (const plays of byGame.values()) {
    plays.sort((a, b) => (parseInt(a.play_id, 10) || 0) - (parseInt(b.play_id, 10) || 0));
  }
  logger.info(`[play-by-play] ${byGame.size} games, ${rows.length} plays total for season ${season}`);
  return byGame;
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
  let playsByGame: Map<string, PbpRow[]>;
  try {
    playsByGame = await getPlaysByGame(season);
  } catch (err) {
    logger.warn({ err }, `[play-by-play] Could not fetch play-by-play for season ${season}; skipping finish-time sync`);
    return { updated: 0, noMatch: 0, notYetFinished: 0 };
  }

  let updated = 0;
  let noMatch = 0;
  let notYetFinished = 0;

  for (const [gameId, plays] of playsByGame) {
    const parsed = parseGameId(gameId);
    if (!parsed) continue;
    if (weekNumbers && weekNumbers.length > 0 && !weekNumbers.includes(parsed.week)) continue;

    const lastTimestamped = [...plays].reverse().find(p => p.time_of_day);
    if (!lastTimestamped) continue;
    const timestamp = new Date(lastTimestamped.time_of_day);
    if (isNaN(timestamp.getTime())) continue;

    const game = await findGameInDb(season, parsed.week, abbrevToShort(parsed.homeAbbrev), abbrevToShort(parsed.awayAbbrev));
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
