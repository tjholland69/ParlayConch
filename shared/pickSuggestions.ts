/**
 * Suggested picks: bets still open in the week's parlay that the member's
 * own record, or the league's, says have been worth making. Pure scoring,
 * shared by the server (which stores every suggestion it shows) and tests.
 *
 * A suggestion needs a winning record behind it over at least
 * MIN_SAMPLE decided picks. With no history there are no suggestions:
 * nothing is padded in to fill the list.
 */
import { lineForBet } from "./buyPoints";
import { betMarket } from "./multiBetValidation";
import { hasGameStarted } from "./parlayProgress";

export const SUGGESTION_REASONS = ["own_team", "league_team", "own_angle", "league_angle"] as const;
export type SuggestionReason = (typeof SUGGESTION_REASONS)[number];

/** Decided picks a record needs before it's worth quoting. */
export const MIN_SAMPLE = 3;
export const MAX_SUGGESTIONS = 5;
const MAX_PER_GAME = 2;

/** A graded game pick from the league's past, already tied to its game. */
export type HistoryLeg = {
  userId: string;
  betType: string;
  pick: string;
  line?: string | null;
  odds?: string | null;
  result: string | null;
  homeTeam: string;
  awayTeam: string;
};

export type SuggestionGame = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  spread?: string | null;
  spreadOdds?: string | null;
  overUnder?: string | null;
  overOdds?: string | null;
  underOdds?: string | null;
  moneylineHome?: string | null;
  moneylineAway?: string | null;
  gameTime?: Date | string | null;
  isFinished?: boolean | null;
};

export type PickSuggestion = {
  gameId: number;
  betType: string;
  pick: string;
  line: string | null;
  odds: string | null;
  reason: SuggestionReason;
  detail: string;
  rank: number;
};

type Angle = { key: string; label: string };

/** The team a spread or moneyline pick backs. */
function teamBacked(leg: { betType: string; pick: string; homeTeam: string; awayTeam: string }): string | null {
  if (leg.betType !== "spread" && leg.betType !== "moneyline") return null;
  return leg.pick === "home" ? leg.homeTeam : leg.pick === "away" ? leg.awayTeam : null;
}

/**
 * The kind of bet, beyond its type: overs, unders, and for a spread or
 * moneyline whether it backed the favorite or the underdog (read off the
 * sign of the line, or the moneyline price). Null when that can't be told.
 */
export function betAngle(leg: { betType: string; line?: string | null; odds?: string | null }): Angle | null {
  if (leg.betType === "over") return { key: "over", label: "overs" };
  if (leg.betType === "under") return { key: "under", label: "unders" };
  if (leg.betType !== "spread" && leg.betType !== "moneyline") return null;
  const n = parseFloat(leg.line ?? "") || parseFloat(leg.odds ?? "");
  if (!Number.isFinite(n) || n === 0) return null;
  const side = n < 0 ? "favorites" : "underdogs";
  return { key: `${leg.betType}:${side}`, label: `${leg.betType} ${side}` };
}

/** "-110" out of "-3.5 (-110)"; a moneyline's line is already its price. */
export function oddsFromLine(betType: string, line: string | null | undefined): string | null {
  if (!line) return null;
  if (betType === "moneyline") return line;
  return /\(([^)]+)\)/.exec(line)?.[1] ?? null;
}

type Tally = { wins: number; losses: number };
const tally = (map: Map<string, Tally>, key: string, win: boolean) => {
  const t = map.get(key) ?? { wins: 0, losses: 0 };
  if (win) t.wins++; else t.losses++;
  map.set(key, t);
};

/** Win rate pulled toward 50% so 3-0 doesn't outrank 14-3. */
const strength = (t: Tally) => (t.wins + 2) / (t.wins + t.losses + 4);
const worthQuoting = (t: Tally | undefined): t is Tally => !!t && t.wins + t.losses >= MIN_SAMPLE && t.wins > t.losses;

// A record about this exact team says more than one about a kind of bet,
// and the member's own says more than the league's.
const SPECIFICITY: Record<SuggestionReason, number> = { own_team: 0.03, league_team: 0.02, own_angle: 0.01, league_angle: 0 };

export function buildPickSuggestions(input: {
  userId: string;
  games: SuggestionGame[];
  history: HistoryLeg[];
  /** Markets (betMarket().market) another member already has in the parlay. */
  takenMarkets?: Iterable<string>;
  limit?: number;
  now?: Date;
}): PickSuggestion[] {
  const { userId, games, history, now = new Date() } = input;
  const taken = new Set(input.takenMarkets ?? []);

  const own = { team: new Map<string, Tally>(), angle: new Map<string, Tally>() };
  const league = { team: new Map<string, Tally>(), angle: new Map<string, Tally>() };
  for (const leg of history) {
    if (leg.result !== "win" && leg.result !== "loss") continue;
    const win = leg.result === "win";
    const team = teamBacked(leg);
    const angle = betAngle(leg);
    for (const book of leg.userId === userId ? [own, league] : [league]) {
      if (team) tally(book.team, team, win);
      if (angle) tally(book.angle, angle.key, win);
    }
  }

  type Scored = PickSuggestion & { score: number; market: string; angleKey: string | null; kickoff: number };
  const scored: Scored[] = [];
  for (const game of games) {
    if (game.isFinished || hasGameStarted(game, now)) continue;
    for (const [betType, pick] of [["spread", "home"], ["spread", "away"], ["moneyline", "home"], ["moneyline", "away"], ["over", "over"], ["under", "under"]] as const) {
      const market = betMarket({ gameId: game.id, betType, pick, userId })?.market;
      const line = lineForBet(game, betType, pick) ?? null;
      if (!market || taken.has(market) || !line) continue;
      const team = teamBacked({ betType, pick, homeTeam: game.homeTeam, awayTeam: game.awayTeam });
      const angle = betAngle({ betType, line });
      const record = (t: Tally) => `${t.wins}-${t.losses}`;
      const options: { reason: SuggestionReason; t: Tally | undefined; detail: (t: Tally) => string }[] = [
        { reason: "own_team", t: team ? own.team.get(team) : undefined, detail: (t) => `You're ${record(t)} picking the ${team}` },
        { reason: "league_team", t: team ? league.team.get(team) : undefined, detail: (t) => `The league is ${record(t)} picking the ${team}` },
        { reason: "own_angle", t: angle ? own.angle.get(angle.key) : undefined, detail: (t) => `You're ${record(t)} on ${angle!.label}` },
        { reason: "league_angle", t: angle ? league.angle.get(angle.key) : undefined, detail: (t) => `The league is ${record(t)} on ${angle!.label}` },
      ];
      let best: { reason: SuggestionReason; detail: string; score: number } | null = null;
      for (const o of options) {
        if (!worthQuoting(o.t)) continue;
        const score = strength(o.t) + SPECIFICITY[o.reason];
        if (!best || score > best.score) best = { reason: o.reason, detail: o.detail(o.t), score };
      }
      if (!best) continue;
      scored.push({
        gameId: game.id, betType, pick, line, odds: oddsFromLine(betType, line),
        reason: best.reason, detail: best.detail, rank: 0, score: best.score, market,
        angleKey: angle?.key ?? null,
        kickoff: game.gameTime ? new Date(game.gameTime).getTime() : Number.MAX_SAFE_INTEGER,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.kickoff - b.kickoff || a.gameId - b.gameId);
  const out: PickSuggestion[] = [];
  const markets = new Set<string>();
  const perGame = new Map<number, number>();
  const angleReasons = new Set<string>();
  for (const s of scored) {
    if (out.length >= (input.limit ?? MAX_SUGGESTIONS)) break;
    // One side of a market, a couple of bets a game, and a "you're good at
    // overs" style reason only once: it's true of every game on the slate.
    if (markets.has(s.market) || (perGame.get(s.gameId) ?? 0) >= MAX_PER_GAME) continue;
    const angleReason = s.reason === "own_angle" || s.reason === "league_angle" ? `${s.reason}:${s.angleKey}` : null;
    if (angleReason && angleReasons.has(angleReason)) continue;
    markets.add(s.market);
    perGame.set(s.gameId, (perGame.get(s.gameId) ?? 0) + 1);
    if (angleReason) angleReasons.add(angleReason);
    const { score: _s, market: _m, angleKey: _a, kickoff: _k, ...suggestion } = s;
    out.push({ ...suggestion, rank: out.length + 1 });
  }
  return out;
}
