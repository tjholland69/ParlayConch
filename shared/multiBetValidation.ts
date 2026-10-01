/**
 * Validation for the Data Editor's "Add Parlay (Multi-Bet)" form: one parlay,
 * one bet per league member. Pure functions with no DB/React dependencies, so
 * the dialog and the POST /parlays/multi-bet route run the exact same checks.
 */

export type MultiBetLegInput = {
  userId: string;
  gameId?: number | null;
  betType: string;
  pick: string;
  line?: string | null;
  odds?: string | null;
  result?: string | null;
  playerName?: string | null;
  propType?: string | null;
};

export type MultiBetValidation = {
  /** Problems with the parlay as a whole (e.g. too few bets). */
  formErrors: string[];
  /** Problems with one row, keyed by its index in `legs`. */
  rowErrors: Record<number, string[]>;
  valid: boolean;
};

/** Scoring props are a yes/no call with no number; every other prop is an
 * over/under on a line. */
export const YES_NO_PROP_TYPES = new Set(["anytime_td", "first_td", "last_td"]);

const GAME_BET_TYPES = new Set(["spread", "moneyline", "over", "under"]);
const AMERICAN_ODDS = /^[+-]?\d{3,}$/;

const isNumeric = (v: string | null | undefined) => !!v && v.trim() !== "" && Number.isFinite(Number(v));

/**
 * The market a bet is on and which side of it was taken. Two bets on the same
 * market are the same bet when the sides match and opposing bets when they
 * don't. Returns null while a row is too incomplete to compare.
 */
export function betMarket(leg: MultiBetLegInput): { market: string; side: string } | null {
  if (leg.betType === "player_prop") {
    const player = leg.playerName?.trim().toLowerCase();
    if (!player || !leg.propType || !leg.pick) return null;
    return { market: `prop:${player}:${leg.propType}`, side: leg.pick };
  }
  if (leg.gameId == null) return null;
  if (leg.betType === "over" || leg.betType === "under") {
    return { market: `game:${leg.gameId}:total`, side: leg.betType };
  }
  if ((leg.betType === "spread" || leg.betType === "moneyline") && leg.pick) {
    return { market: `game:${leg.gameId}:${leg.betType}`, side: leg.pick };
  }
  return null;
}

function validateRow(leg: MultiBetLegInput): string[] {
  const errors: string[] = [];
  if (!leg.userId) errors.push("Choose a bet owner");

  if (leg.betType === "player_prop") {
    if (!leg.playerName?.trim()) errors.push("Choose a player");
    if (!leg.propType) {
      errors.push("Choose the stat for this prop");
    } else if (YES_NO_PROP_TYPES.has(leg.propType)) {
      if (leg.pick !== "yes" && leg.pick !== "no") errors.push("Pick Yes or No");
    } else {
      if (leg.pick !== "over" && leg.pick !== "under") errors.push("Pick Over or Under");
      if (!isNumeric(leg.line)) errors.push("Enter the prop line (e.g. 74.5)");
    }
  } else if (GAME_BET_TYPES.has(leg.betType)) {
    if (leg.gameId == null) {
      errors.push("Choose a game");
    } else if (leg.betType === "spread" || leg.betType === "moneyline") {
      if (leg.pick !== "home" && leg.pick !== "away") errors.push("Choose a team");
    } else if (leg.pick !== leg.betType) {
      errors.push("Pick must match the bet type");
    }
    if (leg.betType !== "moneyline" && leg.gameId != null && !isNumeric(leg.line)) {
      errors.push(leg.betType === "spread" ? "Enter the spread (e.g. -3.5)" : "Enter the total (e.g. 47.5)");
    }
  } else {
    errors.push("Choose a bet type");
  }

  if (leg.odds && !AMERICAN_ODDS.test(leg.odds.trim())) errors.push("Odds should look like -110 or +150");
  return errors;
}

export function validateMultiBetLegs(
  legs: MultiBetLegInput[],
  opts: { minLegs?: number } = {},
): MultiBetValidation {
  const formErrors: string[] = [];
  const rowErrors: Record<number, string[]> = {};
  const add = (row: number, message: string) => {
    (rowErrors[row] ??= []).push(message);
  };

  const minLegs = Math.max(1, opts.minLegs ?? 1);
  if (legs.length < minLegs) {
    formErrors.push(`A parlay needs at least ${minLegs} bet${minLegs === 1 ? "" : "s"} (${legs.length} entered)`);
  }

  legs.forEach((leg, i) => validateRow(leg).forEach((e) => add(i, e)));

  // One bet per member.
  const rowsByUser = new Map<string, number[]>();
  legs.forEach((leg, i) => {
    if (leg.userId) rowsByUser.set(leg.userId, [...(rowsByUser.get(leg.userId) ?? []), i]);
  });
  for (const rows of rowsByUser.values()) {
    if (rows.length < 2) continue;
    for (const i of rows) {
      const others = rows.filter((r) => r !== i).map((r) => r + 1).join(", ");
      add(i, `This member already has a bet in row ${others}`);
    }
  }

  // Same bet twice, or both sides of one market.
  const markets = legs.map(betMarket);
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = markets[i];
      const b = markets[j];
      if (!a || !b || a.market !== b.market) continue;
      if (a.side === b.side) {
        add(i, `Same bet as row ${j + 1}`);
        add(j, `Same bet as row ${i + 1}`);
      } else {
        add(i, `Opposes the bet in row ${j + 1}, so the parlay could never win`);
        add(j, `Opposes the bet in row ${i + 1}, so the parlay could never win`);
      }
    }
  }

  return { formErrors, rowErrors, valid: formErrors.length === 0 && Object.keys(rowErrors).length === 0 };
}
