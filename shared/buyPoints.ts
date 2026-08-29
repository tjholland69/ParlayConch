/**
 * "Buy points" / points-slider math — lets a bettor move a Spread or
 * Over/Under line in their own favor (safer bet) in exchange for worse
 * odds, the same trade-off real sportsbooks offer. Not derived from live
 * alternate-line market data (this app doesn't fetch that) — instead uses a
 * standard, fixed cents-per-half-point cost, the simplified model most
 * "buy points" features use in place of real per-line market pricing.
 *
 * Shared between server (sanity-checking a submitted line) and mobile
 * (computing the live preview as the user steps the slider) so both sides
 * agree on the exact same numbers.
 */

/** Half-point steps, so the max move is 6 points — the common single-leg
 * buy-points/teaser cap most books apply. */
export const MAX_POINTS_MOVE = 6;
export const POINTS_STEP = 0.5;

/** Standard "buy points" price: 10 cents of American odds per half point. */
const CENTS_PER_HALF_POINT = 10;

export function canBuyPoints(betType: string): boolean {
  return betType === "spread" || betType === "over" || betType === "under";
}

/**
 * Moves `baseLine` (the line as displayed for the side actually picked —
 * e.g. the away spread's own sign, already flipped from the game's
 * home-perspective spread) toward safer territory by `pointsMoved`.
 * Spread and "under" get safer by adding points; "over" gets safer by
 * subtracting them (a lower total is easier to stay under... to go over).
 */
export function adjustedLine(betType: string, baseLine: number, pointsMoved: number): number {
  if (betType === "over") return baseLine - pointsMoved;
  return baseLine + pointsMoved; // spread (either side, once baseLine is side-signed) and "under"
}

function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

/**
 * Worsens `baseOdds` by `pointsMoved * CENTS_PER_HALF_POINT`, added directly
 * in American-odds terms while odds stay negative (the common range for
 * spread/total prices), then continues the same cost scale through the
 * +100/-100 "pick'em" boundary via decimal odds so a rare plus-money base
 * (e.g. +105) still comes out worse, not wrapped/undefined.
 */
export function adjustedOdds(baseOdds: number, pointsMoved: number): number {
  const totalCost = pointsMoved * 2 * CENTS_PER_HALF_POINT; // 2 half-points per point
  if (totalCost === 0) return baseOdds;

  if (baseOdds <= -100) {
    return baseOdds - totalCost;
  }
  // Plus-money base: spend the cost walking down through 0 toward -100 first...
  const remainingAfterZero = totalCost - baseOdds; // baseOdds > 0 here
  if (remainingAfterZero <= 0) {
    return baseOdds - totalCost; // stayed positive
  }
  // ...then keep spending on the negative side starting from -100.
  return -100 - remainingAfterZero;
}

export type BoughtLine = { line: number; odds: number };

/** Convenience: apply both line and odds adjustments in one call. */
export function buyPoints(betType: string, baseLine: number, baseOdds: number, pointsMoved: number): BoughtLine {
  return {
    line: adjustedLine(betType, baseLine, pointsMoved),
    odds: adjustedOdds(baseOdds, pointsMoved),
  };
}

export function formatAmericanOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

/**
 * Reverse-engineers how many points a stored leg line was bought by,
 * relative to a game's own current market spread/total — there's no
 * dedicated "points bought" column, so both the mobile display (clamped to
 * the valid [0, MAX_POINTS_MOVE] range) and the server's submission sanity
 * check (unclamped, to catch an out-of-range value) derive it from here.
 */
export function impliedPointsMoved(
  betType: string,
  pick: string,
  marketLine: { spread?: string | null; overUnder?: string | null },
  storedLine: string | null | undefined,
): number {
  if (!storedLine || !canBuyPoints(betType)) return 0;
  const stored = parseFloat(storedLine);
  if (Number.isNaN(stored)) return 0;

  let baseLine: number | null = null;
  if (betType === "spread" && marketLine.spread) {
    const parsed = parseFloat(marketLine.spread);
    baseLine = pick === "home" ? parsed : -parsed;
  } else if ((betType === "over" || betType === "under") && marketLine.overUnder) {
    baseLine = parseFloat(marketLine.overUnder);
  }
  if (baseLine == null || Number.isNaN(baseLine)) return 0;

  const diff = betType === "over" ? baseLine - stored : stored - baseLine;
  return Math.round(diff / POINTS_STEP) * POINTS_STEP;
}
