import type { Game } from "@shared/schema";
import { withPlusSign } from "./formatPick";

/**
 * The away team's side of the home spread stored on a game: "-3.5" -> "3.5",
 * "+3.5" -> "-3.5". Parses the number rather than editing the string, which
 * used to turn a home underdog's "+3.5" into "++3.5".
 */
export function awaySpread(homeSpread: string | null | undefined): string {
  const n = parseFloat(homeSpread ?? "");
  return Number.isNaN(n) ? "" : String(-n || 0);
}

/** Both sides of a game's spread as they read on a pick tile: "+3.5" / "-3.5". */
export function spreadLabels(game: Pick<Game, "spread">): { away: string | null; home: string | null } {
  return { away: withPlusSign(awaySpread(game.spread)), home: withPlusSign(game.spread) };
}

/** Formats a game's own spread/moneyline/total odds into the combined
 * "line (odds)" string stored on a leg — same convention the live weekly
 * pick flow uses (see LeagueDetail's toggleLeg), so historical/backfilled
 * legs read identically to ones picked off the board in real time. */
export function getLineForBet(game: Game, betType: string, pick: string): string | undefined {
  if (betType === 'spread') {
    const line = spreadLabels(game)[pick === 'home' ? 'home' : 'away'];
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
