/**
 * The order a parlay's legs are listed in, which follows where the parlay is:
 *
 *  - Still open, pending or locked (no game started): the order the picks
 *    were made, oldest first.
 *  - In progress or settled: one timeline. A settled leg sits at the moment
 *    it was decided, a leg still to play at its kickoff, so the list reads
 *    top to bottom as the week unfolds.
 */
import { hasGameStarted } from "./parlayProgress";

type OrderLeg = {
  id: number;
  createdAt?: Date | string | null;
  decidedAt?: Date | string | null;
  result?: string | null;
  game?: {
    gameTime?: Date | string | null;
    finishedAt?: Date | string | null;
    isFinished?: boolean | null;
  } | null;
};

export type LegOrderMode = "picked" | "timeline";

const ms = (t: Date | string | null | undefined): number | null => {
  if (t == null) return null;
  const n = new Date(t).getTime();
  return Number.isNaN(n) ? null : n;
};

/** "picked" until the first game on the ticket kicks off, "timeline" after. */
export function legOrderMode(
  parlay: { status?: string | null; legs?: OrderLeg[] | null },
  now: Date = new Date(),
): LegOrderMode {
  if (parlay.status === "draft") return "picked";
  const legs = parlay.legs ?? [];
  const underway = legs.some((l) => l.result != null || hasGameStarted(l.game, now));
  return underway ? "timeline" : "picked";
}

/** Oldest pick first. Legs saved before picks were timestamped share one
 * time, so the id (which also counts up as picks are made) settles them. */
export function comparePicked(a: OrderLeg, b: OrderLeg): number {
  return (ms(a.createdAt) ?? 0) - (ms(b.createdAt) ?? 0) || a.id - b.id;
}

/** When a leg was decided, else when its game kicks off; undated legs last. */
function timelinePoint(leg: OrderLeg): number {
  return ms(leg.decidedAt) ?? ms(leg.game?.finishedAt) ?? ms(leg.game?.gameTime) ?? Infinity;
}

export function compareTimeline(a: OrderLeg, b: OrderLeg): number {
  return timelinePoint(a) - timelinePoint(b) || comparePicked(a, b);
}

/** A copy of the parlay's legs in display order. */
export function sortParlayLegs<L extends OrderLeg>(
  parlay: { status?: string | null; legs?: L[] | null },
  now: Date = new Date(),
): L[] {
  const legs = [...(parlay.legs ?? [])];
  return legs.sort(legOrderMode(parlay, now) === "picked" ? comparePicked : compareTimeline);
}
