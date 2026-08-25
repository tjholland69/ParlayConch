// Mobile port of client/src/lib/parlayHero.ts — identical logic.
import type { ParlayWithLegs } from "@shared/schema";

type LegWithGameAndUser = ParlayWithLegs["legs"][number];

function decidedTime(leg: LegWithGameAndUser): number | null {
  if (leg.decidedAt) return new Date(leg.decidedAt).getTime();
  if (leg.game?.finishedAt) return new Date(leg.game.finishedAt).getTime();
  return null;
}

/**
 * The "Parlay Hero" for a winning parlay: among the legs that won, the one
 * decided latest — i.e. the last leg to be decided. Returns null for anything
 * that isn't a decided win, or if no winning leg has a resolvable timestamp.
 */
export function getHeroLeg(parlay: ParlayWithLegs): LegWithGameAndUser | null {
  if (parlay.status !== "win") return null;
  const winners = parlay.legs.filter(l => l.result === "win");
  if (winners.length === 0) return null;

  return [...winners].sort((a, b) => {
    const at = decidedTime(a) ?? -Infinity;
    const bt = decidedTime(b) ?? -Infinity;
    return bt - at || a.id - b.id;
  })[0];
}
