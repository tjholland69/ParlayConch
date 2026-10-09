/**
 * "Illogical Bets": two bets in one parlay that pull against each other, or
 * that mostly win or lose together so one adds little. They're allowed, but
 * the member is warned first. Pure rules, shared by web and mobile.
 *
 * Every rule looks at two bets on the same game:
 *  - A moneyline and a spread.
 *  - A player's under with the over on the game total, or their over with
 *    the under on the game total.
 *  - A player's under with a bet on that player's own team, or their over
 *    with a bet against it. This one needs the player's team, so it's
 *    skipped for a player the app can't place on a team.
 *
 * Player rules only cover offensive stats. A defender's sacks or a
 * quarterback's interceptions don't move with the score the same way.
 */

export type IllogicalBet = {
  gameId: number | null;
  betType: string;
  pick: string;
  playerName?: string | null;
  propType?: string | null;
  /** The player's team, as the games table names it ("Chiefs"). */
  playerTeam?: string | null;
};

type GameTeams = { homeTeam?: string | null; awayTeam?: string | null };

const OFFENSE_PROPS = new Set([
  "rush_yards", "rush_tds", "rush_attempts",
  "rec_yards", "rec_tds", "receptions", "all_purpose_yards",
  "pass_yards", "pass_tds", "pass_attempts", "pass_completions",
  "anytime_td", "first_td", "last_td",
  "kicking_pts", "fg_made",
]);

/** "over" for a prop that needs the player to produce, "under" for one that needs them not to. */
function propLean(bet: IllogicalBet): "over" | "under" | null {
  if (bet.betType !== "player_prop" || !bet.propType || !OFFENSE_PROPS.has(bet.propType)) return null;
  if (bet.pick === "over" || bet.pick === "yes") return "over";
  if (bet.pick === "under" || bet.pick === "no") return "under";
  return null;
}

const isSide = (bet: IllogicalBet) => bet.betType === "moneyline" || bet.betType === "spread";
const isTotal = (bet: IllogicalBet) => bet.betType === "over" || bet.betType === "under";
const sameTeam = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function propVersus(prop: IllogicalBet, other: IllogicalBet, game?: GameTeams | null): string | null {
  const lean = propLean(prop);
  if (!lean) return null;
  const player = prop.playerName?.trim() || "this player";
  if (isTotal(other)) {
    if (lean === "under" && other.betType === "over") return `An under on ${player} fights the over on this game's total.`;
    if (lean === "over" && other.betType === "under") return `An over on ${player} fights the under on this game's total.`;
    return null;
  }
  if (isSide(other) && prop.playerTeam && game) {
    const backed = other.pick === "home" ? game.homeTeam : game.awayTeam;
    const onPlayersTeam = sameTeam(backed, prop.playerTeam);
    if (lean === "under" && onPlayersTeam) return `An under on ${player} fights the bet on the ${backed}, their own team.`;
    if (lean === "over" && !onPlayersTeam) return `An over on ${player} fights the bet on the ${backed}, the team they're playing.`;
  }
  return null;
}

/** Why two bets on the same game are an Illogical Bet together, or null if they're fine. */
export function illogicalReason(a: IllogicalBet, b: IllogicalBet, game?: GameTeams | null): string | null {
  if (a.gameId == null || a.gameId !== b.gameId) return null;
  if (isSide(a) && isSide(b) && a.betType !== b.betType) {
    return "A moneyline and a spread on the same game mostly win or lose together.";
  }
  return propVersus(a, b, game) ?? propVersus(b, a, game);
}

/**
 * Every bet already in the parlay that makes `candidate` an Illogical Bet.
 * `others` are the picks other members have in (the candidate's own earlier
 * pick is replaced, so it isn't passed in).
 */
export function findIllogicalBets<T extends IllogicalBet>(
  candidate: IllogicalBet,
  others: T[] | null | undefined,
  game?: GameTeams | null,
): { bet: T; reason: string }[] {
  const found: { bet: T; reason: string }[] = [];
  for (const bet of others ?? []) {
    const reason = illogicalReason(candidate, bet, game);
    if (reason) found.push({ bet, reason });
  }
  return found;
}

/** The warning shown before an Illogical Bet goes in. */
export function illogicalBetWarning(found: { reason: string; who?: string | null }[]): { title: string; message: string } {
  const lines = found.map((f) => (f.who ? `${f.reason} (${f.who} has the other bet.)` : f.reason));
  return {
    title: "Illogical Bet",
    message: `${lines.join("\n")}\n\nYou can still add it, but the two bets work against the parlay.`,
  };
}
