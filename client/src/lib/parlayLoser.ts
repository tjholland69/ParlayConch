import type { Game, ParlayLeg, ParlayWithLegs } from "@shared/schema";
import { decidedTime } from "./decidedTime";

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
