import type { Game, TakenPick } from "@shared/schema";
import { legChipLabel, spreadLabels } from "@shared/formatPick";
import { canBuyPoints, impliedPointsMoved, lineForBet, MAX_POINTS_MOVE, POINTS_STEP } from "@shared/buyPoints";

export { canBuyPoints, MAX_POINTS_MOVE, POINTS_STEP };

export type SelectedLeg = {
  gameId: number;
  betType: string;
  pick: string;
  line?: string;
  playerName?: string | null;
  propType?: string | null;
};

export { lineForBet as getLineForBet };

/** Reverse-engineers how many points a stored leg's line was moved by,
 * comparing it against the game's own current market line — there's no
 * dedicated "points bought" column, so this is derived on read rather than
 * tracked as separate state. Only meaningful right after pick time, since a
 * game's market line can itself drift afterward; good enough for showing
 * the slider's position while a pick is still being actively edited. */
export function derivePointsMoved(game: Game, betType: string, pick: string, storedLine: string | null | undefined): number {
  const raw = impliedPointsMoved(betType, pick, game, storedLine);
  return Math.min(MAX_POINTS_MOVE, Math.max(-MAX_POINTS_MOVE, raw));
}

/** The away side of a game's home spread, signed: "-7" -> "+7", "+3" -> "-3". */
export function awaySpreadDisplay(spread: string | null | undefined): string | null {
  return spreadLabels({ spread }).away;
}

/** The home side, signed: an unsigned "3" reads "+3". */
export function homeSpreadDisplay(spread: string | null | undefined): string | null {
  return spreadLabels({ spread }).home;
}

/** A selected pick as it reads on the bet slip and a game's selection strip
 * — "Colts (Spread -3.5)", "Over 47.5 (Total)". Same wording as the web
 * app's "Your Parlay" chips. The leg's own stored line wins over the game's
 * current market line: they can differ (points bought, or the market
 * drifted since the pick), and the stored value is what was actually taken. */
export function shortLegLabel(leg: SelectedLeg, game: Game | undefined): string {
  if (leg.betType !== "player_prop" && !game) return "Pick";
  return legChipLabel(
    { betType: leg.betType, pick: leg.pick, line: leg.line ?? null, playerName: leg.playerName, propType: leg.propType ?? null },
    game,
  );
}

/** Compact tile label for an NFL player name: "P. Mahomes" instead of
 * "Patrick Mahomes" — same first-initial + last-name treatment as
 * memberShortName in mobile/src/app/leagues/[id]/index.tsx, applied here to
 * player names shown on "favorite player" stat tiles. */
export function abbreviatePlayerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const initial = parts[0].replace(/\./g, "").charAt(0);
  if (!initial) return fullName;
  return `${initial}. ${parts.slice(1).join(" ")}`;
}

export function isGamePast(game: Game): boolean {
  if (game.isFinished) return true;
  if (!game.gameTime) return false;
  return new Date(game.gameTime) < new Date();
}

/** Who has a market, and which side they took: the other side is the one
 * their pick rules out ("Voided by"). */
export type TakenMarket = { by: string; betType: string; pick: string };
export type TakenMarkets = { spread?: TakenMarket; moneyline?: TakenMarket; total?: TakenMarket };

/** Per-game map of who (if anyone) already has each market on that game in
 * this parlay. One bet per market per parlay: once a member has the spread,
 * the moneyline or the total ('over' and 'under' are one market), nobody
 * else can take either side of it (shared/weekParlays.ts). */
export function takenMarketsByGame(takenPicks: TakenPick[] | undefined): Map<number, TakenMarkets> {
  const byGame = new Map<number, TakenMarkets>();
  for (const t of takenPicks ?? []) {
    if (t.gameId == null) continue;
    const market = t.betType === "over" || t.betType === "under" ? "total" : t.betType;
    if (market !== "spread" && market !== "moneyline" && market !== "total") continue;
    const entry = byGame.get(t.gameId) ?? {};
    entry[market] = { by: t.takenBy.mobile, betType: t.betType, pick: t.pick };
    byGame.set(t.gameId, entry);
  }
  return byGame;
}

/** Moneyline + Spread on the same game are highly correlated bets — if the
 * OTHER member's already-taken picks include the other one of that pair for
 * this game, name who has it so the caller can confirm before adding. */
export function correlatedMarketWarning(
  takenPicks: TakenPick[] | undefined,
  gameId: number,
  betType: string,
): string | null {
  if (betType !== "moneyline" && betType !== "spread") return null;
  const otherType = betType === "moneyline" ? "spread" : "moneyline";
  const conflict = (takenPicks ?? []).find((t) => t.gameId === gameId && t.betType === otherType);
  return conflict ? conflict.takenBy.mobile : null;
}

export function webLeagueSettingsUrl(leagueId: number, apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/$/, "");
  return `${base}/leagues/${leagueId}/settings`;
}
