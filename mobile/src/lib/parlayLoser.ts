// Mobile port of client/src/lib/parlayLoser.ts — identical logic.
import type { Game, ParlayLeg, ParlayWithLegs } from "@shared/schema";

function decidedTime(leg: ParlayLeg & { game?: Game | null }): number | null {
  if (leg.decidedAt) return new Date(leg.decidedAt).getTime();
  if (leg.game?.finishedAt) return new Date(leg.game.finishedAt).getTime();
  return null;
}

/**
 * Approximate "who busted first" for a losing parlay: among the legs that
 * lost, the one decided earliest. Returns null for anything that isn't a
 * decided loss, or if no losing leg has a resolvable timestamp at all.
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
