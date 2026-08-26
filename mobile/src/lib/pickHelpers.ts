import type { Game } from "@shared/schema";

export type SelectedLeg = {
  gameId: number;
  betType: string;
  pick: string;
  line?: string;
};

/** Same line formatting as web LeagueDetail.getLineForBet */
export function getLineForBet(game: Game, betType: string, pick: string): string | undefined {
  if (betType === "spread") {
    const line =
      pick === "home"
        ? game.spread
        : game.spread
          ? game.spread.startsWith("-")
            ? `+${game.spread.slice(1)}`
            : `-${game.spread.slice(1)}`
          : null;
    const odds = game.spreadOdds || "-110";
    return line ? `${line} (${odds})` : undefined;
  }
  if (betType === "moneyline") {
    return pick === "home" ? game.moneylineHome || undefined : game.moneylineAway || undefined;
  }
  if (betType === "over") {
    const odds = game.overOdds || "-110";
    return game.overUnder ? `O${game.overUnder} (${odds})` : undefined;
  }
  if (betType === "under") {
    const odds = game.underOdds || "-110";
    return game.overUnder ? `U${game.overUnder} (${odds})` : undefined;
  }
  return undefined;
}

export function awaySpreadDisplay(spread: string | null | undefined): string | null {
  if (!spread) return null;
  return `+${spread.replace(/^[+-]/, "")}`;
}

export function shortLegLabel(leg: SelectedLeg, game: Game | undefined): string {
  if (!game) return "Pick";
  if (leg.betType === "spread") {
    const line =
      leg.pick === "home"
        ? game.spread
        : awaySpreadDisplay(game.spread);
    const team = leg.pick === "home" ? game.homeTeam : game.awayTeam;
    return `${team} ${line ?? ""}`.trim();
  }
  if (leg.betType === "moneyline") {
    const team = leg.pick === "home" ? game.homeTeam : game.awayTeam;
    const odds = leg.pick === "home" ? game.moneylineHome : game.moneylineAway;
    return odds ? `${team} ML (${odds})` : `${team} ML`;
  }
  if (leg.betType === "over") return `O ${game.overUnder ?? ""}`.trim();
  if (leg.betType === "under") return `U ${game.overUnder ?? ""}`.trim();
  return `${leg.pick}`;
}

export function isGamePast(game: Game): boolean {
  if (game.isFinished) return true;
  if (!game.gameTime) return false;
  return new Date(game.gameTime) < new Date();
}

export function webLeagueSettingsUrl(leagueId: number, apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  return `${base}/leagues/${leagueId}/settings`;
}
