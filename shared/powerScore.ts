/**
 * Power Score & BAR (Bets Above Replacement) — pure, compute-on-read helpers.
 *
 * Power Score (per user, averaged over decided legs):
 *   legScore = I(win) * oddsFactor(americanOdds)
 *   powerScore = mean(legScore) over win/loss legs (pushes/void/undecided excluded)
 *
 * oddsFactor:
 *   missing odds → treat as -110
 *   +american → american / 100   (+100 → 1, +1000 → 10)
 *   -american → 100 / |american| (-100 → 1, -525 → ~0.1905)
 *
 * Participation:
 *   weeksSubmitted / weeksEligible  (0–1)
 *
 * BAR:
 *   (PS_u * Part_u) − (mean(PS) * mean(Part))
 */

export const DEFAULT_MISSING_ODDS = -110;

/** Parse American odds from stored text ("-110", "+150", "150"). */
export function parseAmericanOdds(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // Strip trailing junk like " (-110)" wrappers if a bare number isn't present
  const match = trimmed.match(/^[+-]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/** Odds multiplier B; always non-negative. */
export function oddsFactor(american: number): number {
  if (!Number.isFinite(american) || american === 0) {
    return oddsFactor(DEFAULT_MISSING_ODDS);
  }
  if (american > 0) return american / 100;
  return 100 / Math.abs(american);
}

export function oddsFactorFromRaw(
  raw: string | null | undefined,
  missingDefault: number = DEFAULT_MISSING_ODDS,
): number {
  const parsed = parseAmericanOdds(raw);
  return oddsFactor(parsed ?? missingDefault);
}

/**
 * Contribution of one leg to the Power Score average.
 * Returns null when the leg should be excluded (push / void / unsettled).
 */
export function legPowerContribution(
  result: string | null | undefined,
  oddsRaw: string | null | undefined,
): number | null {
  if (result !== "win" && result !== "loss") return null;
  const factor = oddsFactorFromRaw(oddsRaw);
  return result === "win" ? factor : 0;
}

export function averagePowerScore(legScores: number[]): number {
  if (legScores.length === 0) return 0;
  const sum = legScores.reduce((a, b) => a + b, 0);
  return sum / legScores.length;
}

export function participationRate(weeksSubmitted: number, weeksEligible: number): number {
  if (weeksEligible <= 0) return 0;
  return Math.min(1, Math.max(0, weeksSubmitted / weeksEligible));
}

export function computeBar(
  userPowerScore: number,
  userParticipation: number,
  leagueMeanPowerScore: number,
  leagueMeanParticipation: number,
): number {
  return userPowerScore * userParticipation - leagueMeanPowerScore * leagueMeanParticipation;
}

export type PowerScoreStandingInput = {
  powerScore: number;
  participationRate: number;
};

/** Attach BAR using unweighted means across the cohort. */
export function withBar<T extends PowerScoreStandingInput>(
  rows: T[],
): Array<T & { bar: number }> {
  if (rows.length === 0) return [];
  const meanPs = rows.reduce((s, r) => s + r.powerScore, 0) / rows.length;
  const meanPart = rows.reduce((s, r) => s + r.participationRate, 0) / rows.length;
  return rows.map((r) => ({
    ...r,
    bar: computeBar(r.powerScore, r.participationRate, meanPs, meanPart),
  }));
}
