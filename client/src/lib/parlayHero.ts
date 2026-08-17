import type { ParlayWithLegs } from "@shared/schema";

type LegWithGameAndUser = ParlayWithLegs["legs"][number];

/**
 * Best available "when was this leg decided" timestamp — see parlayLoser.ts's
 * copy of this helper for the full rationale (decidedAt is more precise than
 * games.finishedAt when the decision-detection job has populated it).
 */
function decidedTime(leg: LegWithGameAndUser): number | null {
  if (leg.decidedAt) return new Date(leg.decidedAt).getTime();
  if (leg.game?.finishedAt) return new Date(leg.game.finishedAt).getTime();
  return null;
}

/**
 * The "Parlay Hero" for a winning parlay: among the legs that won, the one
 * decided latest (see decidedTime above) — i.e. the last leg to be decided.
 * Ties (or legs with no resolvable timestamp, e.g. player props with no
 * decision data yet) fall back to leg id ascending for a deterministic result.
 *
 * Returns null for anything that isn't a decided win, or if no winning leg
 * has a resolvable timestamp at all.
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
