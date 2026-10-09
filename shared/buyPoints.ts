/**
 * Alternate lines: lets a bettor move a Spread or Over/Under line off the
 * market number, the same trade-off real sportsbooks offer. Buying points
 * (a positive move) makes the bet safer at worse odds; selling points (a
 * negative move) makes it riskier at better odds. Not derived from live
 * alternate-line market data (this app doesn't fetch that) — instead uses a
 * standard, fixed cents-per-half-point price, the simplified model most
 * "buy points" features use in place of real per-line market pricing.
 *
 * Shared between server (sanity-checking a submitted line) and the clients
 * (computing the live preview as the member steps the line) so both sides
 * agree on the exact same numbers.
 */
import { spreadLabels } from "./formatPick";

/** Half-point steps, up to 6 points either way — the common single-leg
 * buy-points/teaser cap most books apply. */
export const MAX_POINTS_MOVE = 6;
export const POINTS_STEP = 0.5;

/** Standard alternate-line price: 10 cents of American odds per half point. */
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

/**
 * Moves `baseOdds` by 10 cents per half point: worse when points are bought,
 * better when they're sold. American odds skip from -100 straight to +100,
 * so the move is made on a scale with that gap closed (-110 is -10, +105 is
 * +5) and converted back: 20 cents worse than -110 is -130, 20 cents better
 * is +110, and 10 cents worse than +105 is -105.
 */
export function adjustedOdds(baseOdds: number, pointsMoved: number): number {
  const cents = pointsMoved * 2 * CENTS_PER_HALF_POINT; // 2 half-points per point
  if (cents === 0) return baseOdds;
  const closed = baseOdds <= -100 ? baseOdds + 100 : baseOdds - 100;
  const moved = closed - cents;
  return moved < 0 ? moved - 100 : moved + 100;
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
 * Reverse-engineers how many points a stored leg line was moved by (bought
 * if positive, sold if negative), relative to a game's own current market
 * spread/total — there's no dedicated "points moved" column, so both the
 * clients' display (clamped to ±MAX_POINTS_MOVE) and the server's sanity
 * check (unclamped, to catch an out-of-range value) derive it from here.
 */
export function impliedPointsMoved(
  betType: string,
  pick: string,
  marketLine: { spread?: string | null; overUnder?: string | null },
  storedLine: string | null | undefined,
): number {
  if (!storedLine || !canBuyPoints(betType)) return 0;
  // A total is stored with its side in front ("O47.5 (-110)").
  const stored = parseFloat(storedLine.replace(/^[ou]\s*/i, ""));
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

type LineGame = {
  spread?: string | null;
  spreadOdds?: string | null;
  overUnder?: string | null;
  overOdds?: string | null;
  underOdds?: string | null;
  moneylineHome?: string | null;
  moneylineAway?: string | null;
};

/** A pick's line as it's stored on a leg: "-3.5 (-110)", "O47.5 (-110)", or
 * the moneyline price. Same formatting as web's getLineForBet. `pointsMoved`
 * (0 by default, no behavior change for a plain pick) moves a Spread or
 * Over/Under off the market number: positive buys points (safer line, worse
 * odds), negative sells them. Moneyline has no line to move and ignores it. */
export function lineForBet(game: LineGame, betType: string, pick: string, pointsMoved = 0): string | undefined {
  if (betType === "spread") {
    const rawLine = spreadLabels(game)[pick === "home" ? "home" : "away"];
    if (!rawLine) return undefined;
    const baseOdds = parseFloat(game.spreadOdds || "-110");
    if (pointsMoved === 0) return `${rawLine} (${game.spreadOdds || "-110"})`;
    const line = adjustedLine("spread", parseFloat(rawLine), pointsMoved);
    const odds = adjustedOdds(baseOdds, pointsMoved);
    return `${line > 0 ? "+" : ""}${line} (${formatAmericanOdds(odds)})`;
  }
  if (betType === "moneyline") {
    return pick === "home" ? game.moneylineHome || undefined : game.moneylineAway || undefined;
  }
  if (betType === "over" || betType === "under") {
    if (!game.overUnder) return undefined;
    const prefix = betType === "over" ? "O" : "U";
    const baseOddsRaw = betType === "over" ? game.overOdds : game.underOdds;
    const baseOdds = parseFloat(baseOddsRaw || "-110");
    if (pointsMoved === 0) return `${prefix}${game.overUnder} (${baseOddsRaw || "-110"})`;
    const line = adjustedLine(betType, parseFloat(game.overUnder), pointsMoved);
    const odds = adjustedOdds(baseOdds, pointsMoved);
    return `${prefix}${line} (${formatAmericanOdds(odds)})`;
  }
  return undefined;
}
