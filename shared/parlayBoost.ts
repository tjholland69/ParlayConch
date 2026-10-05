/**
 * Sportsbook promo boosts on a parlay's odds ("25% profit boost"). Stored on
 * the parlay as a percentage; null means no boost.
 */

/** A boost multiplies the winnings, not the stake: decimal 5.0 (4 to 1) with
 * a 25% boost pays 5 to 1, which is decimal 6.0. */
export function applyBoost(decimalOdds: number, boostPct: number | null | undefined): number {
  if (!boostPct || boostPct <= 0) return decimalOdds;
  return 1 + (decimalOdds - 1) * (1 + boostPct / 100);
}

/** "+25% boost", or null when there isn't one. */
export function boostLabel(boostPct: number | null | undefined): string | null {
  if (!boostPct || boostPct <= 0) return null;
  return `+${Number(boostPct.toFixed(1))}% boost`;
}

/** Parses the percent a user typed ("25", "25%", " 12.5 "). Null if it isn't
 * a usable boost. */
export function parseBoostPct(raw: string): number | null {
  const n = parseFloat(raw.replace("%", "").trim());
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : null;
}
