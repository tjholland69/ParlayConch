import type { Game } from "@shared/schema";

/** Formats a game's own spread/moneyline/total odds into the combined
 * "line (odds)" string stored on a leg — same convention the live weekly
 * pick flow uses (see LeagueDetail's toggleLeg), so historical/backfilled
 * legs read identically to ones picked off the board in real time. */
export function getLineForBet(game: Game, betType: string, pick: string): string | undefined {
  if (betType === 'spread') {
    const line = pick === 'home' ? game.spread : (game.spread ? (game.spread.startsWith('-') ? `+${game.spread.slice(1)}` : `-${game.spread.slice(1)}`) : null);
    const odds = game.spreadOdds || '-110';
    return line ? `${line} (${odds})` : undefined;
  } else if (betType === 'moneyline') {
    return pick === 'home' ? game.moneylineHome || undefined : game.moneylineAway || undefined;
  } else if (betType === 'over') {
    const odds = game.overOdds || '-110';
    return game.overUnder ? `O${game.overUnder} (${odds})` : undefined;
  } else if (betType === 'under') {
    const odds = game.underOdds || '-110';
    return game.overUnder ? `U${game.overUnder} (${odds})` : undefined;
  }
  return undefined;
}
