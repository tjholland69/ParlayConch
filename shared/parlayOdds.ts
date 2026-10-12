/**
 * A parlay's odds as a whole. The app can only estimate them, by multiplying
 * each leg's posted odds (and any promo boost). A sportsbook prices the
 * ticket itself and the number moves, so whoever placed the bet can record
 * what it actually paid: `parlays.actualOdds`, which wins wherever the
 * parlay's odds are shown.
 */
import { parseAmericanOdds } from "./powerScore";
import { applyBoost } from "./parlayBoost";

/** American odds → decimal multiplier, for comparing/combining bets of any sign. */
export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** Decimal multiplier → American odds string, for display ("+650", "-120"). */
export function decimalToAmericanLabel(decimal: number): string {
  if (decimal >= 2) return `+${Math.round((decimal - 1) * 100)}`;
  return String(Math.round(-100 / (decimal - 1)));
}

/**
 * What a member typed for the odds on their ticket ("+650", "650", "-120"),
 * as stored: signed American odds. Null when it isn't usable. American odds
 * are never between -100 and +100.
 */
export function parseActualOdds(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().replace(/\s+/g, "");
  if (!/^[+-]?\d{3,6}$/.test(text)) return null;
  const n = parseInt(text, 10);
  if (!Number.isFinite(n) || Math.abs(n) < 100) return null;
  return n > 0 ? `+${n}` : String(n);
}

type OddsLeg = { odds?: string | null };

/** Every leg's posted odds multiplied together, with the boost applied. Null
 * when no leg has odds. Legs without odds are left out of the product. */
export function estimatedParlayDecimal(legs: OddsLeg[], boostPct?: number | null): number | null {
  let combined = 1;
  let any = false;
  for (const leg of legs) {
    const american = parseAmericanOdds(leg.odds);
    if (american == null) continue;
    combined *= americanToDecimal(american);
    any = true;
  }
  return any ? applyBoost(combined, boostPct) : null;
}

export type ParlayOdds = {
  /** "+650" */
  label: string;
  decimal: number;
  /** True when it's the app's estimate rather than what the book paid. */
  estimated: boolean;
};

/** The odds to show for a parlay: the recorded actual odds, else the estimate. */
export function parlayOdds(parlay: { actualOdds?: string | null; boostPct?: number | null; legs?: OddsLeg[] | null }): ParlayOdds | null {
  const actual = parseAmericanOdds(parlay.actualOdds);
  if (actual != null) return { label: actual > 0 ? `+${actual}` : String(actual), decimal: americanToDecimal(actual), estimated: false };
  const decimal = estimatedParlayDecimal(parlay.legs ?? [], parlay.boostPct);
  return decimal == null ? null : { label: decimalToAmericanLabel(decimal), decimal, estimated: true };
}

/** "+650" or "+612 est." */
export function parlayOddsText(odds: ParlayOdds | null): string | null {
  if (!odds) return null;
  return odds.estimated ? `${odds.label} est.` : odds.label;
}
