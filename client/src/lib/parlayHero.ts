import type { ParlayWithLegs } from "@shared/schema";

type LegWithGameAndUser = ParlayWithLegs["legs"][number];

/**
 * The "Parlay Hero" for a winning parlay: among the legs that won, the one
 * whose game finished latest (via games.finishedAt — same approximation used
 * by parlayLoser's "bust moment") — i.e. the last leg to be decided. Ties (or
 * legs with no resolvable game, e.g. player props) fall back to leg id
 * ascending for a deterministic result.
 *
 * Returns null for anything that isn't a decided win, or if no winning leg
 * has a game at all.
 */
export function getHeroLeg(parlay: ParlayWithLegs): LegWithGameAndUser | null {
  if (parlay.status !== "win") return null;
  const winners = parlay.legs.filter(l => l.result === "win");
  if (winners.length === 0) return null;

  return [...winners].sort((a, b) => {
    const at = a.game?.finishedAt ? new Date(a.game.finishedAt).getTime() : -Infinity;
    const bt = b.game?.finishedAt ? new Date(b.game.finishedAt).getTime() : -Infinity;
    return bt - at || a.id - b.id;
  })[0];
}
