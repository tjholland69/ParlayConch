import type { Game, ParlayLeg } from "@shared/schema";

/**
 * Best available "when was this leg decided" timestamp: parlayLegs.decidedAt
 * when the decision-detection job has populated it (precise, derived from
 * play-by-play), falling back to games.finishedAt (coarser — stamped in a
 * batch when the score sync learns a game ended, so games in the same sync
 * run can share ~the same timestamp). Shared by parlayLoser.ts, parlayHero.ts,
 * and the rollup card's leg ordering so all three stay in agreement.
 */
export function decidedTime(leg: ParlayLeg & { game?: Game | null }): number | null {
  if (leg.decidedAt) return new Date(leg.decidedAt).getTime();
  if (leg.game?.finishedAt) return new Date(leg.game.finishedAt).getTime();
  return null;
}
