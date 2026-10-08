/**
 * "The Locks Report": the shame report's opposite number, for a parlay that
 * won. First who brought it home (the Parlay Hero, whose bet was the last to
 * come in), then every member and their bet, since all of them had to hit.
 * Built from a parlay the client already has, like the shame report.
 */
import { legChipLabel, legShortLabel } from "./formatPick";

type LocksLeg = Parameters<typeof legChipLabel>[0] & {
  id: number;
  result: string | null;
  game?: Parameters<typeof legChipLabel>[1];
};

export type LocksReport = {
  weekLabel: string;
  /** The league's name for the hero ("Parlay Hero", "Hoss", …). */
  heroLabel: string;
  heroName: string;
  heroPick: string;
  /** Every winning bet, the hero's first. `shortPick` is the text-message form. */
  locks: { legId: number; name: string; pick: string; shortPick: string; isHero: boolean }[];
  /** Legs that pushed: they dropped out of the ticket without losing it. */
  pushCount: number;
};

/** "…and 1 push that dropped off the ticket", or null when nothing pushed. */
export function locksPushLine(pushCount: number): string | null {
  if (pushCount <= 0) return null;
  return `…and ${pushCount} push${pushCount === 1 ? "" : "es"} that dropped off the ticket`;
}

/**
 * `heroLegId` is the winning leg decided last (getHeroLeg). Returns null when
 * the parlay isn't a clean win: a leg lost or is still open, or the hero's
 * leg isn't among the winners.
 */
export function buildLocksReport<L extends LocksLeg>(input: {
  legs: L[];
  heroLegId: number | null | undefined;
  nameOf: (leg: L) => string;
  weekLabel: string;
  heroLabel: string;
}): LocksReport | null {
  if (input.legs.some((l) => l.result === "loss" || l.result == null)) return null;
  const won = input.legs.filter((l) => l.result === "win");
  const hero = won.find((l) => l.id === input.heroLegId);
  if (!hero) return null;

  const row = (leg: L) => ({
    legId: leg.id,
    name: input.nameOf(leg),
    pick: legChipLabel(leg, leg.game),
    shortPick: legShortLabel(leg, leg.game),
    isHero: leg.id === hero.id,
  });
  const others = won.filter((l) => l.id !== hero.id).map(row);
  others.sort((a, b) => a.name.localeCompare(b.name));
  const first = row(hero);

  return {
    weekLabel: input.weekLabel,
    heroLabel: input.heroLabel,
    heroName: first.name,
    heroPick: first.pick,
    locks: [first, ...others],
    pushCount: input.legs.filter((l) => l.result === "push").length,
  };
}

/** Plain-text version for the group chat, in the shame report's short form. */
export function locksReportText(report: LocksReport): string {
  const week = report.weekLabel.replace(/^\d{4}\s+/, "");
  const pushes = locksPushLine(report.pushCount);
  return [
    `🔒 ${week} Locks Report 🔒`,
    `${report.heroLabel}: ${report.heroName}`,
    "",
    `The locks (${report.locks.length}):`,
    ...report.locks.map((l) => `• ${l.name}: ${l.shortPick}`),
    ...(pushes ? ["", pushes] : []),
  ].join("\n");
}
