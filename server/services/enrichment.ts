import { storage } from "../storage";
import { logger } from "../logger";
import { buildResultDetail } from "@shared/legJustification";
import { calculateLegResult, deriveApproximateLine } from "@shared/legGrading";

type LegEnrichUpdate = {
  id: number;
  result?: string | null;
  resultDetail?: string | null;
  line?: string | null;
  oddsEnriched: boolean;
};

/**
 * Settles game bets for a league (or all leagues if leagueId is omitted).
 * For each leg not yet settled:
 *  - If the game is finished: calculate the result from the score, graded
 *    against the leg's own line (the game's line only when the leg has none)
 *  - If the leg has no line: fill in an approximate one from the game record
 *
 * A leg is only marked enriched once it has a result. One whose game hasn't
 * finished stays in the queue, so it's picked up again after the whistle.
 * (Player props are marked straight away: they're settled from player stats
 * by propEnrichment, not here.)
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

  let resultsFilled = 0;
  let linesFilled = 0;
  const batch: LegEnrichUpdate[] = [];

  for (const leg of legs) {
    const game = leg.game;

    if (leg.betType === "player_prop" || !game) {
      batch.push({ id: leg.id, oddsEnriched: true });
      continue;
    }

    const updates: LegEnrichUpdate = { id: leg.id, oddsEnriched: !!leg.result };

    // Auto-fill approximate line if leg has no line
    const line = leg.line ?? deriveApproximateLine(leg.betType, leg.pick, game);
    if (!leg.line && line) {
      updates.line = line;
      linesFilled++;
    }

    // Auto-fill result if game is finished and leg has no result
    if (game.isFinished && !leg.result) {
      const result = calculateLegResult(leg.betType, leg.pick, game, line);
      if (result) {
        updates.result = result;
        updates.resultDetail = buildResultDetail({ leg: { ...leg, line, result }, game });
        updates.oddsEnriched = true;
        resultsFilled++;
      }
    }

    // Nothing new to save for a leg still waiting on its game.
    if (updates.oddsEnriched || updates.line) batch.push(updates);
  }

  let enriched = 0;
  let skipped = 0;
  try {
    await storage.enrichParlayLegsBatch(batch);
    enriched = batch.length;
  } catch (err) {
    logger.error({ err }, "[Enrichment] batch update failed; falling back per-leg");
    for (const u of batch) {
      try {
        const { id, ...rest } = u;
        await storage.enrichParlayLeg(id, rest);
        enriched++;
      } catch (legErr) {
        logger.error({ err: legErr }, `Failed to enrich leg ${u.id}:`);
        skipped++;
      }
    }
  }

  // After enriching legs, roll up parlay-level statuses so the Dashboard
  // leaderboard (which counts parlay.status = 'win'/'loss'/'push') reflects
  // the individual leg results.
  const rollupResult = await storage.rollupLeagueParlayStatuses(leagueId);
  logger.info(`[Enrichment] rollup: ${rollupResult.updated} parlay(s) promoted to win/loss/push, ${rollupResult.skipped} skipped`);

  return { enriched, resultsFilled, linesFilled, skipped };
}
