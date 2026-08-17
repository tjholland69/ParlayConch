import type { Game, ParlayLeg, ParlayWithLegs } from "@shared/schema";

/**
 * Best available "when was this leg decided" timestamp: parlayLegs.decidedAt
 * when the decision-detection job has populated it (precise, derived from
 * play-by-play), falling back to games.finishedAt (coarser — stamped in a
 * batch when the score sync learns a game ended, so games in the same sync
 * run can share ~the same timestamp).
 */
function decidedTime(leg: ParlayLeg & { game?: Game | null }): number | null {
  if (leg.decidedAt) return new Date(leg.decidedAt).getTime();
  if (leg.game?.finishedAt) return new Date(leg.game.finishedAt).getTime();
  return null;
}

/**
 * Approximate "who busted first" for a losing parlay: among the legs that
 * lost, the one decided earliest (see decidedTime above). Ties (or legs with
 * no resolvable timestamp, e.g. player props with no decision data yet) fall
 * back to leg id ascending for a deterministic result.
 *
 * Returns null for anything that isn't a decided loss, or if no losing leg
 * has a resolvable timestamp at all.
 */
export function getBustedLeg(parlay: ParlayWithLegs): (ParlayLeg & { game: Game | null }) | null {
  if (parlay.status !== "loss") return null;
  const busted = parlay.legs.filter(l => l.result === "loss");
  if (busted.length === 0) return null;

  return [...busted].sort((a, b) => {
    const at = decidedTime(a) ?? Infinity;
    const bt = decidedTime(b) ?? Infinity;
    return at - bt || a.id - b.id;
  })[0];
}
