/**
 * The weekly "shame report" for a losing parlay: who ruined it, then every
 * member whose bet lost and what they picked. Built from a parlay the client
 * already has, so web and mobile show (and share) the same two slides.
 */
import { legChipLabel, legShortLabel } from "./formatPick";

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
  /** Every losing bet, the parlay loser's first. `shortPick` is the text-message form. */
  losers: { legId: number; name: string; pick: string; shortPick: string; isParlayLoser: boolean }[];
  /** Legs still waiting on a result (a lost parlay with Monday night to play). */
  pendingCount: number;
};

/** Shame reports are only for the season being played: `currentSeason` is the active week's. */
export function canShameSeason(parlaySeason: number | null | undefined, currentSeason: number | null | undefined): boolean {
  return parlaySeason != null && currentSeason != null && parlaySeason === currentSeason;
}

/** "…and 2 more pending in the balance", or null when every leg has settled. */
export function shamePendingLine(pendingCount: number): string | null {
  return pendingCount > 0 ? `…and ${pendingCount} more pending in the balance` : null;
}

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
    shortPick: legShortLabel(leg, leg.game),
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
    pendingCount: input.legs.filter((l) => l.result == null).length,
  };
}

/**
 * Plain-text version, for pasting into the group chat. Kept short: no year
 * in the title ("2026 Week 5" reads as "Week 5") and shorthand picks.
 */
export function shameReportText(report: ShameReport): string {
  const week = report.weekLabel.replace(/^\d{4}\s+/, "");
  const pending = shamePendingLine(report.pendingCount);
  return [
    `🔔 ${week} Shame Report 🔔`,
    `${report.loserLabel}: ${report.loserName} (${report.losers[0].shortPick})`,
    "",
    `Losing bets (${report.losers.length}):`,
    ...report.losers.map((l) => `• ${l.name}: ${l.shortPick}`),
    ...(pending ? ["", pending] : []),
  ].join("\n");
}
