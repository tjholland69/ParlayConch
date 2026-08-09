import { db } from "../db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";
import { parlayLegs, games, players, playerWeekStats } from "@shared/schema";
import type { Game, ParlayLeg, PlayerWeekStat, Player } from "@shared/schema";
import { storage } from "../storage";
import { syncGameScoresFromNflverse, syncAllPlayerStatsForWeek } from "./nflverse";
import { getHistoricalGameLines } from "./historicalOddsCache";
import { buildResultDetail } from "@shared/legJustification";

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
function calculateLegResult(betType: string, pick: string, game: Game, line?: string | null): "win" | "loss" | "push" | null {
  const homeScore = game.homeScore;
  const awayScore = game.awayScore;
  if (homeScore == null || awayScore == null) return null;
  const scoreDiff = homeScore - awayScore;

  if (betType === "moneyline") {
    if (pick === "home") return scoreDiff > 0 ? "win" : scoreDiff < 0 ? "loss" : "push";
    if (pick === "away") return scoreDiff < 0 ? "win" : scoreDiff > 0 ? "loss" : "push";
  }
  if (betType === "spread") {
    const spread = parseFloat(line ?? game.spread ?? "0");
    const adj = scoreDiff + spread;
    if (pick === "home") return adj > 0 ? "win" : adj < 0 ? "loss" : "push";
    if (pick === "away") return adj < 0 ? "win" : adj > 0 ? "loss" : "push";
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

function deriveApproximateLine(betType: string, pick: string, game: Game): string | null {
  if (betType === "spread") return game.spread ?? null;
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

  let result: "win" | "loss" | "push" | null;
  if (pick === "over") {
    result = actual > lineNum ? "win" : actual < lineNum ? "loss" : "push";
  } else if (pick === "under") {
    result = actual < lineNum ? "win" : actual > lineNum ? "loss" : "push";
  } else {
    return { result: null, actual, note: `Unexpected pick "${pick}" for stat prop — use over/under/yes/no (actual: ${actual})` };
  }

  return {
    result: result === "push" ? null : result,
    actual,
    note: `${pick} ${lineNum} — actual ${statLabel}: ${actual} → ${result}`,
  };
}

async function saveLog(legId: number, log: EnrichLog): Promise<EnrichLog> {
  try {
    await storage.setLegEnrichmentLog(legId, JSON.stringify(log));
  } catch (err: any) {
    logger.error({ err }, `[legEnrich] Failed to save enrichment log for leg ${legId}`);
  }
  return log;
}

export async function enrichSingleLeg(legId: number): Promise<EnrichLog> {
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

    // If a result is already recorded, skip the data fetch entirely
    if (leg.result) {
      log.changes.push(`Result already set to "${leg.result}" — skipping data fetch`);
      return saveLog(legId, log);
    }

    if (leg.betType === "player_prop") {
      if (!leg.playerName) {
        log.errors.push("No player name set on this leg — edit the leg to add a player name first");
        return saveLog(legId, log);
      }

      let playerStat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);

      if (!playerStat) {
        log.changes.push(`Player "${leg.playerName}" not in local DB — fetching from nflverse (all teams, season ${season} week ${weekNumber})…`);
        try {
          // Use the team-unrestricted sync so players on any team can be found,
          // regardless of whether that team appears in our bet-on games.
          const syncResult = await syncAllPlayerStatsForWeek(season, weekNumber);
          log.changes.push(`nflverse sync: ${syncResult.players} player(s), ${syncResult.stats} stat row(s) fetched`);
        } catch (err: any) {
          log.errors.push(`nflverse player stats fetch failed: ${err.message}`);
          log.warnings.push("For prop bets on unavailable seasons, enter the result manually using the Edit (✏️) button");
          return saveLog(legId, log);
        }
        playerStat = await storage.getPlayerStatByName(leg.playerName, season, weekNumber);
      } else {
        log.changes.push(`Player stats found in local DB`);
      }

      if (!playerStat) {
        log.errors.push(`"${leg.playerName}" not found in nflverse for Season ${season} Week ${weekNumber}`);
        log.warnings.push("Check: player name spelling, correct season/week, data available ~24h after game");
        return saveLog(legId, log);
      }

      log.changes.push(`Stats found: ${playerStat.player.displayName ?? playerStat.player.name} (team: ${playerStat.team ?? "?"})`);

      if (!leg.propType) {
        log.warnings.push("No prop type set on this leg — cannot calculate result. Edit the leg to set a prop type.");
      } else {
        const { result, actual, note } = calcPropResult(leg.propType, leg.pick, leg.line, playerStat);
        log.changes.push(note);

        if (result && !leg.result) {
          const resultDetail = buildResultDetail({ leg, stat: playerStat });
          await storage.updateParlayLeg(legId, { result, resultDetail });
          log.changes.push(`✓ Result set to "${result}"`);
          // Roll up the parlay status now that this leg is resolved
          await storage.rollupParlayStatus(leg.parlayId);
          log.changes.push(`↑ Parlay status rolled up`);
        } else if (result && leg.result) {
          log.warnings.push(`Result already set to "${leg.result}" (re-calculated: "${result}") — no change made`);
        } else if (!result) {
          log.warnings.push("Could not determine a result automatically — manual entry may be needed");
        }
      }
    } else {
      if (!leg.gameId) {
        log.errors.push("No game linked to this leg — this leg needs a game_id to fetch scores and odds");
        log.warnings.push("Tip: re-import this bet with a home_team and away_team so the system can match it to a game");
        return saveLog(legId, log);
      }

      log.changes.push(`Fetching nflverse scores for Season ${season} Week ${weekNumber}…`);
      try {
        const scoreResult = await syncGameScoresFromNflverse(season, [weekNumber]);
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

        if (!leg.result) {
          const result = calculateLegResult(leg.betType, leg.pick, freshGame, resolvedLine);
          if (result) {
            const resultDetail = buildResultDetail({ leg, game: freshGame });
            await storage.updateParlayLeg(legId, { result, resultDetail });
            log.changes.push(`✓ Result set to "${result}" (graded against line: ${resolvedLine ?? "game default"})`);
            // Roll up the parlay status now that this leg is resolved
            await storage.rollupParlayStatus(leg.parlayId);
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
