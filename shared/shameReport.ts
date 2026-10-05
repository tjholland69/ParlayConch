/**
 * The weekly "shame report" for a losing parlay: who ruined it, then every
 * member whose bet lost and what they picked. Built from a parlay the client
 * already has, so web and mobile show (and share) the same two slides.
 */
import { legChipLabel } from "./formatPick";

type ShameLeg = Parameters<typeof legChipLabel>[0] & {
  id: number;
  result: string | null;
  game?: Parameters<typeof legChipLabel>[1];
};

export type ShameReport = {
  weekLabel: string;
  /** The league's name for whoever busted the parlay first ("Parlay Loser", "Jerry", …). */
  loserLabel: string;
  loserName: string;
  loserPick: string;
  /** Every losing bet, the parlay loser's first. */
  losers: { legId: number; name: string; pick: string; isParlayLoser: boolean }[];
};

/**
 * `bustedLegId` is the leg that lost first (getBustedLeg). Returns null when
 * there's nothing to shame: no losing legs, or no busted leg among them.
 */
export function buildShameReport<L extends ShameLeg>(input: {
  legs: L[];
  bustedLegId: number | null | undefined;
  nameOf: (leg: L) => string;
  weekLabel: string;
  loserLabel: string;
}): ShameReport | null {
  const lost = input.legs.filter((l) => l.result === "loss");
  const busted = lost.find((l) => l.id === input.bustedLegId);
  if (!busted) return null;

  const row = (leg: L) => ({
    legId: leg.id,
    name: input.nameOf(leg),
    pick: legChipLabel(leg, leg.game),
    isParlayLoser: leg.id === busted.id,
  });
  const others = lost.filter((l) => l.id !== busted.id).map(row);
  others.sort((a, b) => a.name.localeCompare(b.name));
  const first = row(busted);

  return {
    weekLabel: input.weekLabel,
    loserLabel: input.loserLabel,
    loserName: first.name,
    loserPick: first.pick,
    losers: [first, ...others],
  };
}

/** Plain-text version, for pasting into the group chat. */
export function shameReportText(report: ShameReport): string {
  return [
    `🚨 ${report.weekLabel} Shame Report 🚨`,
    `${report.loserLabel}: ${report.loserName} (${report.loserPick})`,
    "",
    `Losing bets (${report.losers.length}):`,
    ...report.losers.map((l) => `• ${l.name}: ${l.pick}`),
  ].join("\n");
}
