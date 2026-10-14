/**
 * Grading for game bets (moneyline, spread, totals) from a final score.
 * Pure, and shared by every path that settles a pick: the live results
 * tick, the bulk enrichment pass and the Data Editor's regrade.
 */

type GradedGame = {
  homeScore?: number | null;
  awayScore?: number | null;
  spread?: string | null;
  overUnder?: string | null;
  moneylineHome?: string | null;
  moneylineAway?: string | null;
};

export type GameLegResult = "win" | "loss" | "push";

/**
 * The number in a stored line. A leg's line is display text, so the number
 * can sit behind a side letter and ahead of a price: "U54.5 (-105)",
 * "o47", "-3.5 (-110)", "+3", "PK". Null when there's no number to read.
 */
export function lineNumber(line: string | null | undefined): number | null {
  if (line == null) return null;
  const text = String(line).trim().replace(/½/g, ".5").replace(/−/g, "-");
  if (/^(pk|pick'?em|even)\b/i.test(text)) return 0;
  const match = /^(?:[ou]\s*)?([+-]?\d+(?:\.\d+)?|[+-]?\.\d+)/i.exec(text);
  if (!match) return null;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : null;
}

/** game.spread is the home team's spread; an away pick takes the other side of it. */
export function pickSideSpread(pick: string, homeSpread: string | null | undefined): string | null {
  if (!homeSpread) return null;
  if (pick !== "away") return homeSpread;
  const n = lineNumber(homeSpread);
  return n === null ? homeSpread : String(-n);
}

/** The game's own line for a bet, as a fallback for a leg that has none. */
export function deriveApproximateLine(betType: string, pick: string, game: GradedGame): string | null {
  if (betType === "spread") return pickSideSpread(pick, game.spread);
  if (betType === "moneyline") return pick === "home" ? (game.moneylineHome ?? null) : (game.moneylineAway ?? null);
  if (betType === "over" || betType === "under") return game.overUnder ?? null;
  return null;
}

/**
 * `line` is the line to grade against: the leg's own (what the bettor took)
 * when known. The game's current spread or total is only a fallback, since
 * it can drift from what was actually bet.
 *
 * Returns null when the score isn't in, or when a spread or total has no
 * readable line. An unreadable line is never a push.
 */
export function calculateLegResult(betType: string, pick: string, game: GradedGame, line?: string | null): GameLegResult | null {
  const { homeScore, awayScore } = game;
  if (homeScore == null || awayScore == null) return null;
  const scoreDiff = homeScore - awayScore;

  if (betType === "moneyline") {
    if (pick === "home") return scoreDiff > 0 ? "win" : scoreDiff < 0 ? "loss" : "push";
    if (pick === "away") return scoreDiff < 0 ? "win" : scoreDiff > 0 ? "loss" : "push";
    return null;
  }
  if (betType === "spread") {
    if (pick !== "home" && pick !== "away") return null;
    // A leg's own line is from the picked team's side ("BUF +3.5" is stored as
    // +3.5 on an away pick), while game.spread is always the home team's.
    // Put both on the picked team's side before grading.
    const spread = lineNumber(line) ?? lineNumber(pickSideSpread(pick, game.spread));
    if (spread === null) return null;
    const adj = (pick === "away" ? -scoreDiff : scoreDiff) + spread;
    return adj > 0 ? "win" : adj < 0 ? "loss" : "push";
  }
  if (betType === "over" || betType === "under") {
    const total = homeScore + awayScore;
    const ou = lineNumber(line) ?? lineNumber(game.overUnder);
    if (ou === null || ou === 0) return null;
    if (total === ou) return "push";
    return (total > ou) === (betType === "over") ? "win" : "loss";
  }
  return null;
}
