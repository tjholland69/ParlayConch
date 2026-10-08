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

type DatedLeg = ParlayLeg & { game?: Game | null };

/** decidedTime, falling back to scheduled kickoff for a leg still pending, so
 * open legs order sensibly against decided ones instead of all landing last. */
function decidedOrKickoff(leg: DatedLeg): number | null {
  return decidedTime(leg) ?? (leg.game?.gameTime ? new Date(leg.game.gameTime).getTime() : null);
}

/** When a parlay as a whole was decided: its last leg's decided time. Null for
 * a parlay with no dated legs. Same "ending" as storage.getAllLeagueParlays. */
export function parlayDecidedTime(parlay: { legs: DatedLeg[] }): number | null {
  const times = parlay.legs.map(decidedOrKickoff).filter((t): t is number => t != null);
  return times.length ? Math.max(...times) : null;
}
