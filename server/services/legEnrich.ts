import { db } from "../db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { parlayLegs, games, players, playerWeekStats } from "@shared/db-schema";
import type { Game, ParlayLeg, PlayerWeekStat, Player } from "@shared/schema";
import { storage } from "../storage";
import { syncGameScoresFromNflverse, ensureWeekPlayerStats, abbrevToShort } from "./nflverse";
import { syncDefensiveStatsFromEspn } from "./espnBoxscore";
import { syncGameFinishTimesFromPlayByPlay } from "./playByPlay";
import { getHistoricalGameLines } from "./historicalOddsCache";
import { buildResultDetail } from "@shared/legJustification";
import { gradePropOverUnder } from "@shared/propGrading";

const DEFENSIVE_PROP_TYPES = new Set(["sacks", "tackles"]);

export type EnrichLog = {
  at: string;
  changes: string[];
  warnings: string[];
  errors: string[];
};

/**
 * `line` is the line to grade against — pass the leg's own actual line
 * (what the bettor took) when known; only fall back to the game's current
 * spread/overUnder (`game.spread`/`game.overUnder`) when the leg has none,
 * since the current line can drift from what was actually bet.
 */
export function calculateLegResult(betType: string, pick: string, game: Game, line?: string | null): "win" | "loss" | "push" | null {
  const homeScore = game.homeScore;
  const awayScore = game.awayScore;
  if (homeScore == null || awayScore == null) return null;
  const scoreDiff = homeScore - awayScore;

  if (betType === "moneyline") {
    if (pick === "home") return scoreDiff > 0 ? "win" : scoreDiff < 0 ? "loss" : "push";
    if (pick === "away") return scoreDiff < 0 ? "win" : scoreDiff > 0 ? "loss" : "push";
  }
  if (betType === "spread") {
    // A leg's own line is from the picked team's side ("BUF +3.5" is stored as
    // +3.5 on an away pick), while game.spread is always the home team's.
    // Put both on the picked team's side before grading.
    const fallback = pickSideSpread(pick, game.spread) ?? "0";
    const spread = parseFloat(line ?? fallback);
    const margin = pick === "away" ? -scoreDiff : scoreDiff;
    const adj = margin + spread;
    if (pick === "home" || pick === "away") return adj > 0 ? "win" : adj < 0 ? "loss" : "push";
  }
  if (betType === "over" || betType === "under") {
    const total = homeScore + awayScore;
    const ou = parseFloat(line ?? game.overUnder ?? "0");
    if (ou === 0) return null;
    if (betType === "over") return total > ou ? "win" : total < ou ? "loss" : "push";
    if (betType === "under") return total < ou ? "win" : total > ou ? "loss" : "push";
  }
  return null;
}

/** game.spread is the home team's spread; an away pick takes the other side of it. */
function pickSideSpread(pick: string, homeSpread: string | null | undefined): string | null {
  if (!homeSpread) return null;
  if (pick !== "away") return homeSpread;
  const n = parseFloat(homeSpread);
  return Number.isNaN(n) ? homeSpread : String(-n);
}

function deriveApproximateLine(betType: string, pick: string, game: Game): string | null {
  if (betType === "spread") return pickSideSpread(pick, game.spread);
  if (betType === "moneyline") return pick === "home" ? (game.moneylineHome ?? null) : (game.moneylineAway ?? null);
  if (betType === "over" || betType === "under") return game.overUnder ?? null;
  return null;
}

const PROP_STAT_MAP: Partial<Record<string, keyof PlayerWeekStat>> = {
  rush_yards:     "rushingYards",
  rec_yards:      "receivingYards",
  pass_yards:     "passingYards",
  pass_tds:       "passingTds",
  receptions:     "receptions",
  interceptions:  "interceptions",
  rushing_tds:    "rushingTds",
  receiving_tds:  "receivingTds",
};

function calcPropResult(
  propType: string,
  pick: string,
  line: string | null,
  stat: PlayerWeekStat
): { result: "win" | "loss" | null; actual: number | null; note: string } {
  if (propType === "anytime_td" || propType === "first_td" || propType === "last_td") {
    const tds = (stat.rushingTds ?? 0) + (stat.receivingTds ?? 0);
    const scored = tds > 0;
    const label = propType === "anytime_td" ? "anytime TD" : propType === "first_td" ? "first TD" : "last TD";
    if (propType !== "anytime_td") {
      return { result: null, actual: tds, note: `"${label}" cannot be auto-calculated from nflverse stats — manual entry required (total TDs: ${tds})` };
    }
    return {
      result: pick === "yes" ? (scored ? "win" : "loss") : (scored ? "loss" : "win"),
      actual: tds,
      note: `${tds} total TD(s) scored — anytime_td = ${scored ? "yes" : "no"}`,
    };
  }

  let actual: number | null;
  let statLabel: string;

  if (propType === "all_purpose_yards") {
    // No single nflverse field for this — sum rushing + receiving yards.
    if (stat.rushingYards == null && stat.receivingYards == null) {
      return { result: null, actual: null, note: `Neither rushing nor receiving yards are tracked for this player/week` };
    }
    actual = (stat.rushingYards ?? 0) + (stat.receivingYards ?? 0);
    statLabel = "all_purpose_yards";
  } else if (propType === "tackles") {
    // Conventionally graded as solo + assisted combined — see schema comment
    // on playerWeekStats.defTacklesSolo/defTacklesWithAssist.
    if (stat.defTacklesSolo == null && stat.defTacklesWithAssist == null) {
      return { result: null, actual: null, note: `No tackle stats tracked for this player/week (defensive stats come from ESPN, not nflverse)` };
    }
    actual = (stat.defTacklesSolo ?? 0) + (stat.defTacklesWithAssist ?? 0);
    statLabel = "tackles";
  } else if (propType === "sacks") {
    if (stat.defSacks == null) {
      return { result: null, actual: null, note: `No sack stats tracked for this player/week (defensive stats come from ESPN, not nflverse)` };
    }
    actual = stat.defSacks;
    statLabel = "sacks";
  } else {
    const statKey = PROP_STAT_MAP[propType];
    if (!statKey) {
      return { result: null, actual: null, note: `Prop type "${propType}" is not tracked in nflverse data — manual entry required` };
    }
    actual = stat[statKey] as number | null;
    statLabel = statKey;
    if (actual == null) {
      return { result: null, actual: null, note: `Stat "${statKey}" is null for this player/week` };
    }
  }

  if (!line) {
    return { result: null, actual, note: `No line set — cannot determine over/under (actual: ${actual})` };
  }

  const lineNum = parseFloat(line);
  if (isNaN(lineNum)) {
    return { result: null, actual, note: `Line "${line}" is not a valid number (actual: ${actual})` };
  }

  // Landing exactly on the line wins the over — a prop never pushes.
  const result = gradePropOverUnder(actual, lineNum, pick);
  if (!result) {
    return { result: null, actual, note: `Unexpected pick "${pick}" for stat prop — use over/under/yes/no (actual: ${actual})` };
  }

  return {
    result,
    actual,
    note: `${pick} ${lineNum} — actual ${statLabel}: ${actual} → ${result}`,
  };
}

function gradeChangeNote(before: string | null, after: string): string {
  if (!before) return `✓ Result set to "${after}"`;
  return before === after ? `✓ Regraded: still "${after}"` : `✓ Result changed from "${before}" to "${after}"`;
}

async function saveLog(legId: number, log: EnrichLog): Promise<EnrichLog> {
  try {
    await storage.setLegEnrichmentLog(legId, JSON.stringify(log));
  } catch (err: any) {
    logger.error({ err }, `[legEnrich] Failed to save enrichment log for leg ${legId}`);
  }
  return log;
}

/**
 * A prop leg is entered without a game. Finds the game from the team the
 * player suited up for that week (player_week_stats.team, not their current
 * team, so a since-traded player still lands on the right game) and saves it
 * on the leg, which is what fills the card's Date / Kickoff / Slate columns.
 * Returns the game, or null when the player's stats for the week aren't in
 * the DB or their team has no game in that week.
 */
export async function linkPropLegToGame(
  leg: Pick<ParlayLeg, "id" | "playerName">,
  weekId: number,
  season: number,
  weekNumber: number,
): Promise<Game | null> {
  if (!leg.playerName) return null;
  const stat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);
  if (!stat?.team) return null;
  const team = abbrevToShort(stat.team);
  const game = (await storage.getGamesByWeek(weekId)).find(g => g.homeTeam === team || g.awayTeam === team);
  if (!game) return null;
  await storage.updateParlayLeg(leg.id, { gameId: game.id });
  return game;
}

/**
 * `skipScoreSync` grades against the scores already in the DB instead of
 * pulling the week again. For a caller enriching several legs from one week
 * back to back, where the first leg's pull already covered the rest.
 *
 * `force` regrades a leg that already has a result: the data is pulled again
 * and the stored result is overwritten when the grade comes out different. A
 * leg that can't be graded automatically keeps the result it has.
 */
export async function enrichSingleLeg(legId: number, opts: { skipScoreSync?: boolean; force?: boolean } = {}): Promise<EnrichLog> {
  const log: EnrichLog = { at: new Date().toISOString(), changes: [], warnings: [], errors: [] };

  try {
    const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
    if (!leg) { log.errors.push("Leg not found"); return log; }

    const parlay = await storage.getParlay(leg.parlayId);
    if (!parlay) { log.errors.push("Parlay not found"); return log; }

    const week = await storage.getWeek(parlay.weekId);
    if (!week) { log.errors.push(`Week #${parlay.weekId} not found in database`); return log; }

    const { season, weekNumber } = week;
    log.changes.push(`Bet: Season ${season} Week ${weekNumber} — type=${leg.betType} pick=${leg.pick}`);

    // A prop leg with no game shows blank Date / Kickoff / Slate. Linking it
    // doesn't depend on grading, so it runs even when the result was typed in.
    let needsGameLink = leg.betType === "player_prop" && leg.gameId == null && !!leg.playerName;
    const tryGameLink = async () => {
      if (!needsGameLink) return;
      const game = await linkPropLegToGame(leg, parlay.weekId, season, weekNumber);
      if (!game) return;
      needsGameLink = false;
      log.changes.push(`✓ Linked to ${game.awayTeam} @ ${game.homeTeam} (game #${game.id})`);
    };
    if (needsGameLink) {
      await tryGameLink();
      if (needsGameLink) {
        try {
          await ensureWeekPlayerStats(season, weekNumber);
          await tryGameLink();
        } catch (err: any) {
          log.warnings.push(`Could not pull Season ${season} Week ${weekNumber} player stats to find this prop's game: ${err.message}`);
        }
      }
    }

    // If a result is already recorded, skip the data fetch entirely
    if (leg.result && !opts.force) {
      if (needsGameLink) {
        log.warnings.push(`No game linked: "${leg.playerName}" has no stats for Season ${season} Week ${weekNumber}. Check the spelling, or set the game with the Edit button.`);
      }
      log.changes.push(`Result already set to "${leg.result}" — skipping data fetch`);
      return saveLog(legId, log);
    }

    if (leg.betType === "player_prop") {
      if (!leg.playerName) {
        log.errors.push("No player name set on this leg — edit the leg to add a player name first");
        return saveLog(legId, log);
      }

      const isDefensiveProp = !!leg.propType && DEFENSIVE_PROP_TYPES.has(leg.propType);
      let playerStat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);

      if (!playerStat && !isDefensiveProp) {
        log.changes.push(`Player "${leg.playerName}" not in local DB — fetching from nflverse (all teams, season ${season} week ${weekNumber})…`);
        try {
          // Use the team-unrestricted sync so players on any team can be found,
          // regardless of whether that team appears in our bet-on games.
          const syncResult = await ensureWeekPlayerStats(season, weekNumber);
          log.changes.push(`nflverse sync: ${syncResult.players} player(s), ${syncResult.stats} stat row(s) fetched`);
        } catch (err: any) {
          log.errors.push(`nflverse player stats fetch failed: ${err.message}`);
          log.warnings.push("For prop bets on unavailable seasons, enter the result manually using the Edit (✏️) button");
          return saveLog(legId, log);
        }
        playerStat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);
      } else if (playerStat) {
        log.changes.push(`Player stats found in local DB`);
      }

      // nflverse's weekly file has no defensive columns (sacks/tackles) at all,
      // and often omits players with zero offensive counting stats entirely —
      // ESPN's boxscore is the only source for those, so always top it up for
      // defensive props rather than relying on the nflverse fetch above.
      if (isDefensiveProp && (!playerStat || (playerStat.defSacks == null && playerStat.defTacklesSolo == null && playerStat.defTacklesWithAssist == null))) {
        log.changes.push(`Defensive prop — fetching sacks/tackles from ESPN boxscore (season ${season} week ${weekNumber})…`);
        try {
          const espnResult = await syncDefensiveStatsFromEspn(season, weekNumber);
          log.changes.push(`ESPN sync: ${espnResult.matched}/${espnResult.events} game(s) matched, ${espnResult.players} player(s), ${espnResult.stats} stat row(s)`);
        } catch (err: any) {
          log.errors.push(`ESPN defensive stats fetch failed: ${err.message}`);
        }
        playerStat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);
      }

      if (!playerStat) {
        log.errors.push(`"${leg.playerName}" not found in ${isDefensiveProp ? "ESPN boxscore" : "nflverse"} for Season ${season} Week ${weekNumber}`);
        log.warnings.push("Check: player name spelling, correct season/week, data available ~24h after game");
        return saveLog(legId, log);
      }

      log.changes.push(`Stats found: ${playerStat.player.displayName ?? playerStat.player.name} (team: ${playerStat.team ?? "?"})`);
      // Defensive players only arrive with the ESPN pull above, so try again.
      await tryGameLink();
      if (needsGameLink) log.warnings.push(`No game linked: ${playerStat.team ?? "this player's team"} has no game in Week ${weekNumber} in our schedule`);

      if (!leg.propType) {
        log.warnings.push("No prop type set on this leg — cannot calculate result. Edit the leg to set a prop type.");
      } else {
        const { result, actual, note } = calcPropResult(leg.propType, leg.pick, leg.line, playerStat);
        log.changes.push(note);

        if (result && (!leg.result || opts.force)) {
          const resultDetail = buildResultDetail({ leg: { ...leg, result }, stat: playerStat });
          await storage.updateParlayLeg(legId, { result, resultDetail });
          log.changes.push(gradeChangeNote(leg.result, result));
          // Roll up the parlay status now that this leg is resolved
          await storage.rollupParlayStatus(leg.parlayId, { recompute: opts.force });
          log.changes.push(`↑ Parlay status rolled up`);
        } else if (result && leg.result) {
          log.warnings.push(`Result already set to "${leg.result}" (re-calculated: "${result}") — no change made`);
        } else if (!result) {
          log.warnings.push(leg.result
            ? `Could not regrade automatically — keeping "${leg.result}"`
            : "Could not determine a result automatically — manual entry may be needed");
        }
      }
    } else {
      if (!leg.gameId) {
        log.errors.push("No game linked to this leg — this leg needs a game_id to fetch scores and odds");
        log.warnings.push("Tip: re-import this bet with a home_team and away_team so the system can match it to a game");
        return saveLog(legId, log);
      }

      if (opts.skipScoreSync) {
        log.changes.push(`Scores for Season ${season} Week ${weekNumber} already refreshed in this run`);
      } else {
        log.changes.push(`Fetching nflverse scores for Season ${season} Week ${weekNumber}…`);
        let scoreResult: Awaited<ReturnType<typeof syncGameScoresFromNflverse>> | null = null;
        try {
          scoreResult = await syncGameScoresFromNflverse(season, [weekNumber]);
          if (scoreResult.updated > 0) {
            log.changes.push(`nflverse: ${scoreResult.updated} game(s) updated with new scores`);
          } else if (scoreResult.alreadyFinal > 0) {
            log.changes.push(`Scores already final in DB (${scoreResult.alreadyFinal} game(s))`);
          } else {
            log.warnings.push(`No matching games found in nflverse (noMatch=${scoreResult.noMatch}) — verify season/week or that the game was in our DB`);
          }
        } catch (err: any) {
          log.errors.push(`nflverse score fetch failed: ${err.message}`);
          return saveLog(legId, log);
        }

        // The score sync above stamps games.finishedAt at the moment THIS sync
        // runs, not the game's actual final whistle, so every game it just
        // finalized shares ~the same timestamp (breaks Hero/Loser ordering).
        // Play-by-play has the real finish time, but it's a ~100 MB download
        // that grading doesn't need: only fetch it when scores actually
        // changed, and don't make the caller wait on it.
        if (scoreResult && scoreResult.updated > 0) {
          log.changes.push(`Play-by-play: refreshing precise finish times in the background`);
          void syncGameFinishTimesFromPlayByPlay(season, [weekNumber]).catch((err) =>
            logger.warn({ err }, `[legEnrich] play-by-play finish-time sync failed for ${season} week ${weekNumber}`),
          );
        }
      }

      const [freshGame] = await db.select().from(games).where(eq(games.id, leg.gameId));
      if (!freshGame) {
        log.errors.push(`Game #${leg.gameId} not found in database`);
        return saveLog(legId, log);
      }

      const gameLabel = `${freshGame.awayTeam} @ ${freshGame.homeTeam}`;
      const scoreLabel = freshGame.isFinished
        ? `${freshGame.homeScore ?? "?"}–${freshGame.awayScore ?? "?"} (final)`
        : "not yet final";
      log.changes.push(`Game: ${gameLabel} — ${scoreLabel}`);

      if (!freshGame.isFinished) {
        log.warnings.push("Game is not yet marked as finished — nflverse data typically arrives ~24h after the final whistle");
      } else {
        // Resolve the line to grade against *before* calculating the result,
        // so grading uses the leg's own line (or the closest historical
        // approximation of it) instead of whatever the current game record
        // happens to show — the market can move well past what was actually bet.
        let resolvedLine = leg.line;
        let lineSource: "leg" | "historical" | "current" | null = leg.line ? "leg" : null;

        if (!resolvedLine && freshGame.gameTime) {
          try {
            const historicalLines = await getHistoricalGameLines(
              season, weekNumber, freshGame.homeTeam, freshGame.awayTeam,
              freshGame.gameTime, parlay.createdAt ?? new Date()
            );
            if (historicalLines) {
              resolvedLine = deriveApproximateLine(leg.betType, leg.pick, { ...freshGame, ...historicalLines });
              if (resolvedLine) lineSource = "historical";
            }
          } catch (err: any) {
            log.warnings.push(`Historical odds lookup failed, falling back to current line: ${err.message}`);
          }
        }

        if (!resolvedLine) {
          resolvedLine = deriveApproximateLine(leg.betType, leg.pick, freshGame);
          if (resolvedLine) lineSource = "current";
        }

        if (!leg.line && resolvedLine) {
          await storage.updateParlayLeg(legId, { line: resolvedLine });
          log.changes.push(
            lineSource === "historical"
              ? `✓ Line filled from historical odds snapshot: ${resolvedLine}`
              : `✓ Line filled from current game record (approximate): ${resolvedLine}`
          );
        } else if (!leg.line) {
          log.warnings.push("No line/odds data found for this game");
        } else {
          log.changes.push(`Line already set to "${leg.line}" — no change`);
        }

        if (!leg.result || opts.force) {
          const result = calculateLegResult(leg.betType, leg.pick, freshGame, resolvedLine);
          if (result) {
            const resultDetail = buildResultDetail({ leg: { ...leg, result }, game: freshGame });
            await storage.updateParlayLeg(legId, { result, resultDetail });
            log.changes.push(`${gradeChangeNote(leg.result, result)} (graded against line: ${resolvedLine ?? "game default"})`);
            // Roll up the parlay status now that this leg is resolved
            await storage.rollupParlayStatus(leg.parlayId, { recompute: opts.force });
            log.changes.push(`↑ Parlay status rolled up`);
          } else {
            log.warnings.push(`Could not calculate result for betType="${leg.betType}" pick="${leg.pick}" — check game scores are valid`);
          }
        } else {
          log.warnings.push(`Result already set to "${leg.result}" — no change made`);
        }
      }
    }
  } catch (err: any) {
    log.errors.push(`Unexpected error: ${err.message}`);
  }

  return saveLog(legId, log);
}

/**
 * Regrades every leg of a parlay from fresh data, overwriting results that
 * come out different, then re-derives the parlay's own status. The legs share
 * one week, so the scores are pulled once.
 */
export async function recalcParlay(parlayId: number): Promise<{ logs: Record<number, EnrichLog>; status: string | null }> {
  const legs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
  const logs: Record<number, EnrichLog> = {};
  let scoresPulled = false;
  for (const leg of legs) {
    const needsScores = leg.betType !== "player_prop";
    logs[leg.id] = await enrichSingleLeg(leg.id, { force: true, skipScoreSync: needsScores && scoresPulled });
    if (needsScores) scoresPulled = true;
  }
  await storage.rollupParlayStatus(parlayId, { recompute: true });
  const parlay = await storage.getParlay(parlayId);
  return { logs, status: parlay?.status ?? null };
}
