/**
 * How a league's weekly parlay is built: one shared parlay that every member
 * adds a single pick to. Pure rules, shared by the server (which enforces
 * them inside one transaction) and both clients (which label them).
 *
 *  - 1 member, 1 pick per parlay. Picking again replaces the earlier pick.
 *  - One bet per market per parlay: nobody can repeat, or take the other
 *    side of, a bet another member already has in it.
 *  - A league can run up to `maxParlaysPerWeek` parlays in a week; a member
 *    can have a pick in each.
 */
import { betMarket } from "./multiBetValidation";

export type WeekParlayLeg = {
  userId: string;
  gameId?: number | null;
  betType: string;
  pick: string;
  playerName?: string | null;
  propType?: string | null;
};

export type WeekParlay<L extends WeekParlayLeg = WeekParlayLeg> = {
  id: number;
  /** Whoever started the parlay. */
  userId: string;
  status: string | null;
  legs: L[];
};

/** Thrown for a pick the rules don't allow. The message is safe to show the member. */
export class PickRuleError extends Error {}

/** A parlay still collecting picks. Once submitted, its picks are frozen. */
export function isOpenForPicks(parlay: { status: string | null }): boolean {
  return parlay.status === "draft";
}

/** Void and rejected parlays don't use up one of the week's parlays. */
function countsTowardWeekLimit(parlay: { status: string | null }): boolean {
  return parlay.status !== "void" && parlay.status !== "rejected";
}

export function canStartParlay(parlays: { status: string | null }[], maxParlaysPerWeek: number | null | undefined): boolean {
  return parlays.filter(countsTowardWeekLimit).length < Math.max(1, maxParlaysPerWeek ?? 1);
}

const hasLegFrom = (parlay: WeekParlay, userId: string) => parlay.legs.some((l) => l.userId === userId);

/**
 * The open parlay a member's next pick goes into: the oldest one still
 * missing their pick, else the newest one (where a new pick replaces theirs).
 * Undefined when no parlay is open.
 */
export function openParlayFor<P extends WeekParlay>(parlays: P[], userId: string): P | undefined {
  const open = parlays.filter(isOpenForPicks).sort((a, b) => a.id - b.id);
  return open.find((p) => !hasLegFrom(p, userId)) ?? open[open.length - 1];
}

/**
 * The parlay to show a member for the week: `preferId` if it's there, else
 * the open one they'd pick into, else the latest submitted one (theirs first).
 */
export function currentParlayFor<P extends WeekParlay>(parlays: P[], userId: string, preferId?: number | null): P | null {
  const preferred = preferId != null ? parlays.find((p) => p.id === preferId) : undefined;
  if (preferred) return preferred;
  const open = openParlayFor(parlays, userId);
  if (open) return open;
  const live = parlays.filter(countsTowardWeekLimit).sort((a, b) => a.id - b.id);
  const mine = live.filter((p) => hasLegFrom(p, userId) || p.userId === userId);
  return mine[mine.length - 1] ?? live[live.length - 1] ?? null;
}

/** Another member's leg on the same market as `candidate`, on either side. */
export function findMarketConflict<L extends WeekParlayLeg>(legs: L[], candidate: Omit<WeekParlayLeg, "userId">, userId: string): L | undefined {
  const market = betMarket({ ...candidate, userId })?.market;
  if (!market) return undefined;
  return legs.find((l) => l.userId !== userId && betMarket(l)?.market === market);
}

/** "the spread on this game", for telling a member why a pick is taken. */
export function marketLabel(leg: { betType: string }): string {
  if (leg.betType === "player_prop") return "that player prop";
  if (leg.betType === "over" || leg.betType === "under") return "the total on this game";
  return `the ${leg.betType} on this game`;
}

/** Where a member stands in a parlay, for the build screens. */
export function pickStanding(parlay: WeekParlay | null | undefined, userId: string | undefined, minLegs: number, maxLegs: number) {
  const legs = parlay?.legs ?? [];
  const open = !!parlay && isOpenForPicks(parlay);
  return {
    open,
    legCount: legs.length,
    myLeg: userId ? legs.find((l) => l.userId === userId) : undefined,
    needed: Math.max(0, minLegs - legs.length),
    full: legs.length >= maxLegs,
    readyToSubmit: open && legs.length >= minLegs && legs.length <= maxLegs,
  };
}
