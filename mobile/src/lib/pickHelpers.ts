import type { Game, TakenPick } from "@shared/schema";
import { adjustedLine, adjustedOdds, formatAmericanOdds, canBuyPoints, impliedPointsMoved, MAX_POINTS_MOVE, POINTS_STEP } from "@shared/buyPoints";

export { canBuyPoints, MAX_POINTS_MOVE, POINTS_STEP };

export type SelectedLeg = {
  gameId: number;
  betType: string;
  pick: string;
  line?: string;
};

/** Same line formatting as web LeagueDetail.getLineForBet. `pointsMoved`
 * (0 by default, no behavior change for a plain pick) applies the points-
 * slider adjustment — a safer line at worse odds — to Spread/Over/Under;
 * moneyline has no line to move and ignores it. */
export function getLineForBet(game: Game, betType: string, pick: string, pointsMoved = 0): string | undefined {
  if (betType === "spread") {
    const rawLine =
      pick === "home"
        ? game.spread
        : game.spread
          ? game.spread.startsWith("-")
            ? `+${game.spread.slice(1)}`
            : `-${game.spread.slice(1)}`
          : null;
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

/** Reverse-engineers how many points a stored leg's line was bought by,
 * comparing it against the game's own current market line — there's no
 * dedicated "points bought" column, so this is derived on read rather than
 * tracked as separate state. Only meaningful right after pick time, since a
 * game's market line can itself drift afterward; good enough for showing
 * the slider's position while a pick is still being actively edited. */
export function derivePointsMoved(game: Game, betType: string, pick: string, storedLine: string | null | undefined): number {
  const raw = impliedPointsMoved(betType, pick, game, storedLine);
  return Math.min(MAX_POINTS_MOVE, Math.max(0, raw));
}

export function awaySpreadDisplay(spread: string | null | undefined): string | null {
  if (!spread) return null;
  return `+${spread.replace(/^[+-]/, "")}`;
}

export function shortLegLabel(leg: SelectedLeg, game: Game | undefined): string {
  if (!game) return "Pick";
  // Prefer the leg's own stored line over the game's current market line —
  // they can differ (points bought, or the market line simply drifted since
  // the pick was made), and the stored value is what was actually taken.
  const storedLine = leg.line != null ? parseFloat(leg.line) : NaN;
  const hasStoredLine = !Number.isNaN(storedLine);
  if (leg.betType === "spread") {
    const line = hasStoredLine
      ? storedLine > 0 ? `+${storedLine}` : `${storedLine}`
      : leg.pick === "home" ? game.spread : awaySpreadDisplay(game.spread);
    const team = leg.pick === "home" ? game.homeTeam : game.awayTeam;
    return `${team} ${line ?? ""}`.trim();
  }
  if (leg.betType === "moneyline") {
    const team = leg.pick === "home" ? game.homeTeam : game.awayTeam;
    const odds = leg.pick === "home" ? game.moneylineHome : game.moneylineAway;
    return odds ? `${team} ML (${odds})` : `${team} ML`;
  }
  if (leg.betType === "over" || leg.betType === "under") {
    const prefix = leg.betType === "over" ? "O" : "U";
    const total = hasStoredLine ? storedLine : game.overUnder;
    return `${prefix} ${total ?? ""}`.trim();
  }
  return `${leg.pick}`;
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

/** Per-game map of who (if anyone) already has the Spread / Total market on
 * that game — 'over' and 'under' are grouped as one "total" market, matching
 * the server's cross-user exclusivity (server/storage.ts exclusivityKey). */
export function takenMarketsByGame(takenPicks: TakenPick[] | undefined): Map<number, { spread?: string; total?: string }> {
  const byGame = new Map<number, { spread?: string; total?: string }>();
  for (const t of takenPicks ?? []) {
    if (t.gameId == null) continue;
    if (t.betType !== "spread" && t.betType !== "over" && t.betType !== "under") continue;
    const entry = byGame.get(t.gameId) ?? {};
    if (t.betType === "spread") entry.spread = t.takenBy.mobile;
    else entry.total = t.takenBy.mobile;
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
