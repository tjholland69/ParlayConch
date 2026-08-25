// Mobile port of client/src/lib/parlayMix.ts — identical logic.
import type { ParlayLeg } from "@shared/schema";

export type ParlayMixCategory = "spread" | "moneyline" | "prop" | "ou";

export const PARLAY_MIX_LABELS: Record<ParlayMixCategory, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  prop: "Prop",
  ou: "O/U",
};

export const PARLAY_MIX_COLORS: Record<ParlayMixCategory, string> = {
  spread: "#3b82f6",
  moneyline: "#a855f7",
  prop: "#f59e0b",
  ou: "#14b8a6",
};

function categorize(betType: string | null): ParlayMixCategory | null {
  switch (betType) {
    case "spread": return "spread";
    case "moneyline": return "moneyline";
    case "player_prop": return "prop";
    case "over":
    case "under": return "ou";
    default: return null;
  }
}

export type ParlayMixEntry = { category: ParlayMixCategory; count: number; pct: number };

/** Weighting of a parlay's legs across spread/moneyline/prop/O-U, as percentages of total legs. */
export function getParlayMix(legs: Pick<ParlayLeg, "betType">[]): ParlayMixEntry[] {
  const counts: Record<ParlayMixCategory, number> = { spread: 0, moneyline: 0, prop: 0, ou: 0 };
  let total = 0;
  for (const leg of legs) {
    const category = categorize(leg.betType);
    if (!category) continue;
    counts[category]++;
    total++;
  }
  if (total === 0) return [];

  return (Object.keys(counts) as ParlayMixCategory[])
    .map(category => ({ category, count: counts[category], pct: (counts[category] / total) * 100 }))
    .filter(entry => entry.count > 0);
}
