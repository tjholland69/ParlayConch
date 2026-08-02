import type { Game, ParlayLeg, ParlayWithLegs } from "@shared/schema";

/**
 * Approximate "who busted first" for a losing parlay: among the legs that
 * lost, the one whose game finished earliest (via games.finishedAt — itself
 * an approximation stamped when we learn a game ended, not the true live
 * bust moment). Ties (or legs with no resolvable game, e.g. player props)
 * fall back to leg id ascending for a deterministic result.
 *
 * Returns null for anything that isn't a decided loss, or if no losing leg
 * has a game at all.
 */
export function getBustedLeg(parlay: ParlayWithLegs): (ParlayLeg & { game: Game | null }) | null {
  if (parlay.status !== "loss") return null;
  const busted = parlay.legs.filter(l => l.result === "loss");
  if (busted.length === 0) return null;

  return [...busted].sort((a, b) => {
    const at = a.game?.finishedAt ? new Date(a.game.finishedAt).getTime() : Infinity;
    const bt = b.game?.finishedAt ? new Date(b.game.finishedAt).getTime() : Infinity;
    return at - bt || a.id - b.id;
  })[0];
}
