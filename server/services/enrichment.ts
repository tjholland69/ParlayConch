import { storage } from "../storage";
import type { Game, ParlayLeg } from "@shared/schema";
import { logger } from "../logger";

/**
 * Given a finished game and a parlay leg, calculate whether it was a win, loss, or push.
 */
function calculateLegResult(
  betType: string,
  pick: string,
  game: Game
): "win" | "loss" | "push" | null {
  const homeScore = game.homeScore;
  const awayScore = game.awayScore;

  if (homeScore === null || homeScore === undefined || awayScore === null || awayScore === undefined) {
    return null; // No scores yet
  }

  const scoreDiff = homeScore - awayScore; // positive = home winning

  if (betType === "moneyline") {
    if (pick === "home") return scoreDiff > 0 ? "win" : scoreDiff < 0 ? "loss" : "push";
    if (pick === "away") return scoreDiff < 0 ? "win" : scoreDiff > 0 ? "loss" : "push";
  }

  if (betType === "spread") {
    const spread = parseFloat(game.spread ?? "0");
    // spread = home team's handicap (e.g., -3.5 means home favored by 3.5)
    // adjustedMargin = scoreDiff + spread
    //   > 0 → home covers  = 0 → push  < 0 → away covers
    const adjustedMargin = scoreDiff + spread;
    if (pick === "home") return adjustedMargin > 0 ? "win" : adjustedMargin < 0 ? "loss" : "push";
    if (pick === "away") return adjustedMargin < 0 ? "win" : adjustedMargin > 0 ? "loss" : "push";
  }

  if (betType === "over" || betType === "under") {
    const total = homeScore + awayScore;
    const ou = parseFloat(game.overUnder ?? "0");
    if (ou === 0) return null;
    if (betType === "over") return total > ou ? "win" : total < ou ? "loss" : "push";
    if (betType === "under") return total < ou ? "win" : total > ou ? "loss" : "push";
  }

  return null;
}

/**
 * Derive an approximate line from the game record for a given bet type / pick.
 */
function deriveApproximateLine(betType: string, pick: string, game: Game): string | null {
  if (betType === "spread") return game.spread ?? null;
  if (betType === "moneyline") {
    return pick === "home" ? (game.moneylineHome ?? null) : (game.moneylineAway ?? null);
  }
  if (betType === "over") return game.overUnder ? `o${game.overUnder}` : null;
  if (betType === "under") return game.overUnder ? `u${game.overUnder}` : null;
  return null;
}

/**
 * Enrich all unenriched parlay legs for a league (or all leagues if leagueId is omitted).
 * For each leg:
 *  - If the game is finished: calculate result from scores + bet type
 *  - If the leg has no line: fill in approximate odds from the game record
 *  - Mark the leg as enriched regardless, so we don't re-query on every request
 *
 * Returns counts of enriched / skipped legs.
 */
export async function enrichLeagueParlayLegs(leagueId?: number): Promise<{
  enriched: number;
  resultsFilled: number;
  linesFilled: number;
  skipped: number;
}> {
  const legs = await storage.getUnenrichedLegs(leagueId);

  let enriched = 0;
  let resultsFilled = 0;
  let linesFilled = 0;
  let skipped = 0;

  for (const leg of legs) {
    const game = leg.game;
    const updates: { result?: string | null; line?: string | null; oddsEnriched: boolean } = {
      oddsEnriched: true,
    };

    // Player prop legs: skip result/line enrichment (no game-score formula applies)
    if (leg.betType === 'player_prop' || !game) {
      try {
        await storage.enrichParlayLeg(leg.id, updates);
        enriched++;
      } catch (err) {
        logger.error({ err }, `Failed to mark prop leg ${leg.id} enriched:`);
        skipped++;
      }
      continue;
    }

    // Auto-fill result if game is finished and leg has no result
    if (game.isFinished && !leg.result) {
      const result = calculateLegResult(leg.betType, leg.pick, game);
      if (result) {
        updates.result = result;
        resultsFilled++;
      }
    }

    // Auto-fill approximate line if leg has no line
    if (!leg.line) {
      const line = deriveApproximateLine(leg.betType, leg.pick, game);
      if (line) {
        updates.line = line;
        linesFilled++;
      }
    }

    try {
      await storage.enrichParlayLeg(leg.id, updates);
      enriched++;
    } catch (err) {
      logger.error({ err }, `Failed to enrich leg ${leg.id}:`);
      skipped++;
    }
  }

  // After enriching legs, roll up parlay-level statuses so the Dashboard
  // leaderboard (which counts parlay.status = 'win'/'loss'/'push') reflects
  // the individual leg results.
  const rollupResult = await storage.rollupLeagueParlayStatuses(leagueId);
  logger.info(`[Enrichment] rollup: ${rollupResult.updated} parlay(s) promoted to win/loss/push, ${rollupResult.skipped} skipped`);

  return { enriched, resultsFilled, linesFilled, skipped };
}
