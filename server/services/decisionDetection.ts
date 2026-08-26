/**
 * Timestamped-settlement work: mid-game decision detection.
 *
 * For legs whose leg-level result is already confirmed (win OR loss), find
 * the specific play where the outcome became fixed — an over hitting in the
 * 3rd quarter, a spread pick's opponent becoming unable to realistically
 * come back — rather than defaulting to the game's final whistle. This
 * matters beyond just display: "who busted first" in a losing parlay
 * (client/src/lib/parlayLoser.ts's getBustedLeg) is decided by comparing
 * legs' decidedAt, so a losing leg without its own decidedAt silently falls
 * back to the coarser, batch-stamped games.finishedAt — which several legs
 * finished in the same score-sync run can share, producing arbitrary
 * tie-breaks instead of the real chronological loser.
 *
 * Two detection tiers, both implemented here — each bet type/result
 * combination below is handled by whichever tier actually has a
 * deterministic or defensible early-decision point for it. The other half of
 * each pair (over LOSS, under WIN's precise "not yet" moment for exact, and
 * player-prop losses) doesn't have one — a moving stat/total can't be ruled
 * out as "never reaching the line" except via the same generous elimination
 * bound already used below, or can't be ruled out at all — so those stay at
 * 'final' confidence, resolved only once the game ends:
 *  - 'exact'     — a fixed line that only moves in one direction, so
 *                  first-crossing is unambiguous:
 *                    · over WIN / under LOSS — the total permanently exceeds
 *                      the line the instant it exceeds it, for both sides of
 *                      that same event. See detectExactDecisionMoments.
 *  - 'heuristic' — no fixed crossing point (a score margin, or the room left
 *                  under a total, can climb and fall all game), so instead
 *                  we find the first play after which a side's cushion
 *                  permanently exceeds a conservative "opponent's maximum
 *                  realistic comeback" bound, computed from time remaining
 *                  and possession pace:
 *                    · spread/moneyline WIN or LOSS — a pick's own cushion
 *                      (win) or its opponent's mirror-image cushion (loss,
 *                      same bound, opposite side) permanently clearing zero.
 *                    · under WIN / over LOSS — the room left under the total
 *                      permanently exceeding the max realistic combined
 *                      scoring left, for both sides of that same event.
 *                  See detectHeuristicDecisionMoments and the constants
 *                  below.
 */

import { storage } from "../storage";
import { logger } from "../logger";
import { getPlaysByGame, parseGameId, type PbpRow } from "./playByPlay";
import { abbrevToShort } from "./nflverse";

export interface DecisionInfo {
  decidedAt: Date;
  decidedPlayDesc: string;
  decidedQuarter: string;
  decidedClock: string;
  decidedConfidence: "exact" | "heuristic";
}

function toDecisionInfo(play: PbpRow, confidence: "exact" | "heuristic" = "exact"): DecisionInfo | null {
  if (!play.time_of_day) return null;
  const decidedAt = new Date(play.time_of_day);
  if (isNaN(decidedAt.getTime())) return null;
  return {
    decidedAt,
    decidedPlayDesc: play.desc ?? "",
    decidedQuarter: play.qtr ? `Q${play.qtr}` : "",
    decidedClock: play.time ?? "",
    decidedConfidence: confidence,
  };
}

/** Walk a game's plays in order; return the first play where the combined score exceeds the line. */
export function findTotalsOverDecision(plays: PbpRow[], line: number): DecisionInfo | null {
  for (const play of plays) {
    const total = (parseInt(play.total_home_score, 10) || 0) + (parseInt(play.total_away_score, 10) || 0);
    if (total > line) return toDecisionInfo(play);
  }
  return null;
}

type PropStatKey =
  | "rushingYards" | "rushingTds" | "carries"
  | "receivingYards" | "receivingTds" | "receptions"
  | "passingYards" | "passingTds" | "attempts" | "completions" | "interceptions";

/** Same prop-type → stat mapping as propEnrichment.ts's numeric props. */
const PROP_TYPE_TO_STAT: Partial<Record<string, PropStatKey>> = {
  rush_yards:       "rushingYards",
  rush_attempts:    "carries",
  rec_yards:        "receivingYards",
  receptions:       "receptions",
  pass_yards:       "passingYards",
  pass_tds:         "passingTds",
  pass_attempts:    "attempts",
  pass_completions: "completions",
  interceptions:    "interceptions",
};

const TD_SCORER_PROPS = new Set(["anytime_td", "first_td", "last_td", "rec_tds", "rush_tds"]);

/** This play's contribution to a given player's running stat total, or 0 if the play doesn't involve them for this stat. */
function playDelta(play: PbpRow, playerId: string, statKey: PropStatKey): number {
  switch (statKey) {
    case "rushingYards":
      return play.rusher_player_id === playerId ? (parseInt(play.rushing_yards, 10) || 0) : 0;
    case "carries":
      return play.rusher_player_id === playerId && play.rush_attempt === "1" ? 1 : 0;
    case "rushingTds":
      return play.rusher_player_id === playerId && play.rush_touchdown === "1" ? 1 : 0;
    case "receivingYards":
      return play.receiver_player_id === playerId ? (parseInt(play.receiving_yards, 10) || 0) : 0;
    case "receptions":
      return play.receiver_player_id === playerId && play.complete_pass === "1" ? 1 : 0;
    case "receivingTds":
      return play.receiver_player_id === playerId && play.pass_touchdown === "1" ? 1 : 0;
    case "passingYards":
      return play.passer_player_id === playerId ? (parseInt(play.passing_yards, 10) || 0) : 0;
    case "passingTds":
      return play.passer_player_id === playerId && play.pass_touchdown === "1" ? 1 : 0;
    case "attempts":
      return play.passer_player_id === playerId && play.pass_attempt === "1" ? 1 : 0;
    case "completions":
      return play.passer_player_id === playerId && play.complete_pass === "1" ? 1 : 0;
    case "interceptions":
      return play.passer_player_id === playerId && play.interception === "1" ? 1 : 0;
    default:
      return 0;
  }
}

/** Walk a game's plays in order, accumulating a player's stat; return the first play where it exceeds the line. */
export function findNumericPropDecision(plays: PbpRow[], playerId: string, statKey: PropStatKey, line: number): DecisionInfo | null {
  let cumulative = 0;
  for (const play of plays) {
    cumulative += playDelta(play, playerId, statKey);
    if (cumulative > line) return toDecisionInfo(play);
  }
  return null;
}

/** Walk a game's plays in order; return the first play where the player scores any TD (for anytime/first/last/rush/rec TD 'yes' picks). */
export function findTdScorerDecision(plays: PbpRow[], playerId: string, propType: string): DecisionInfo | null {
  for (const play of plays) {
    const scored =
      propType === "rush_tds" ? (play.rusher_player_id === playerId && play.rush_touchdown === "1")
      : propType === "rec_tds" ? (play.receiver_player_id === playerId && play.pass_touchdown === "1")
      : (
          (play.rusher_player_id === playerId && play.rush_touchdown === "1") ||
          (play.receiver_player_id === playerId && play.pass_touchdown === "1")
        );
    if (scored) return toDecisionInfo(play);
  }
  return null;
}

/** Find a game's play list by (season, week, home/away short team names), matching nflverse abbreviations to our short names. */
function findGamePlays(playsByGame: Map<string, PbpRow[]>, season: number, week: number, homeShort: string, awayShort: string): PbpRow[] | null {
  for (const [gameId, plays] of playsByGame) {
    const parsed = parseGameId(gameId);
    if (!parsed) continue;
    if (parsed.season !== season || parsed.week !== week) continue;
    if (abbrevToShort(parsed.homeAbbrev) === homeShort && abbrevToShort(parsed.awayAbbrev) === awayShort) {
      return plays;
    }
  }
  return null;
}

// ─── Heuristic "mathematically eliminated" detection (spread/moneyline/under) ─
//
// Conservative, tunable constants. Both are deliberately generous toward the
// *opponent* (i.e. biased to decide LATE rather than risk ever contradicting
// the real final result):
//   - MAX_POINTS_PER_POSSESSION: the most points a single realistic
//     possession can produce (TD + 2pt try).
//   - AVG_SECONDS_PER_POSSESSION: how long a possession takes on average:
//     conservatively short, so the estimated possession *count* remaining
//     is generously high.
//   - BUFFER_POSSESSIONS: one extra possession of slack on top of the pace
//     estimate, so a slightly-faster-than-modeled two-minute drill doesn't
//     produce a false "eliminated" call.
//
// Should be validated against a batch of completed games (the heuristic's
// implied result must always match the real final result) before this is
// trusted without the 'heuristic' confidence caveat surfaced in the UI.
const MAX_POINTS_PER_POSSESSION = 8;
const AVG_SECONDS_PER_POSSESSION = 150;
const BUFFER_POSSESSIONS = 1;

function possessionsRemaining(gameSecondsRemaining: number): number {
  return Math.ceil(gameSecondsRemaining / AVG_SECONDS_PER_POSSESSION);
}

/**
 * Walk a game's plays in order and find the first play after which
 * `cushion(play)` — the pick's margin minus the opponent's maximum
 * realistic comeback — stays positive all the way to the end of the game.
 * Scanning backward from the end avoids treating an early, later-reversed
 * lead as a false decision point.
 */
export function findEliminationDecision(plays: PbpRow[], cushion: (play: PbpRow) => number | null): DecisionInfo | null {
  let lastUnsafeIndex = -1;
  for (let i = 0; i < plays.length; i++) {
    const c = cushion(plays[i]);
    if (c === null) continue;
    if (c <= 0) lastUnsafeIndex = i;
  }
  const decidedIndex = lastUnsafeIndex + 1;
  if (decidedIndex >= plays.length) return null; // never became safe by our bound — stay at 'final'
  return toDecisionInfo(plays[decidedIndex], "heuristic");
}

/** Cushion for a moneyline pick: how far the pick's team is ahead, minus the opponent's max realistic comeback. */
export function moneylineCushion(play: PbpRow, pickHome: boolean): number | null {
  const secondsRemaining = parseInt(play.game_seconds_remaining, 10);
  if (isNaN(secondsRemaining)) return null;
  const homeScore = parseInt(play.total_home_score, 10) || 0;
  const awayScore = parseInt(play.total_away_score, 10) || 0;
  const margin = pickHome ? homeScore - awayScore : awayScore - homeScore;
  const opponentPossessions = Math.ceil(possessionsRemaining(secondsRemaining) / 2) + BUFFER_POSSESSIONS;
  const opponentComeback = opponentPossessions * MAX_POINTS_PER_POSSESSION;
  return margin - opponentComeback;
}

/** Cushion for a spread pick, same shape as moneyline but against the adjusted (line-inclusive) margin. */
export function spreadCushion(play: PbpRow, pickHome: boolean, spread: number): number | null {
  const secondsRemaining = parseInt(play.game_seconds_remaining, 10);
  if (isNaN(secondsRemaining)) return null;
  const homeScore = parseInt(play.total_home_score, 10) || 0;
  const awayScore = parseInt(play.total_away_score, 10) || 0;
  const scoreDiff = homeScore - awayScore;
  // adjustedMargin > 0 means the pick is currently covering.
  const adjustedMargin = pickHome ? scoreDiff + spread : -(scoreDiff + spread);
  const opponentPossessions = Math.ceil(possessionsRemaining(secondsRemaining) / 2) + BUFFER_POSSESSIONS;
  const opponentComeback = opponentPossessions * MAX_POINTS_PER_POSSESSION;
  return adjustedMargin - opponentComeback;
}

/** Cushion for an under pick: how much room is left below the total line, minus the max realistic combined scoring left. */
export function underCushion(play: PbpRow, ouLine: number): number | null {
  const secondsRemaining = parseInt(play.game_seconds_remaining, 10);
  if (isNaN(secondsRemaining)) return null;
  const currentTotal = (parseInt(play.total_home_score, 10) || 0) + (parseInt(play.total_away_score, 10) || 0);
  const roomLeft = ouLine - currentTotal;
  const combinedComeback = (possessionsRemaining(secondsRemaining) + BUFFER_POSSESSIONS) * MAX_POINTS_PER_POSSESSION;
  return roomLeft - combinedComeback;
}

// Shared across detectExactDecisionMoments and detectHeuristicDecisionMoments
// so a season fetched by one isn't re-fetched by the other in the same run.
const seasonPlaysCache = new Map<number, Map<string, PbpRow[]> | null>();
const SEASON_PLAYS_CACHE_MAX = 2;

function trimSeasonPlaysCache() {
  while (seasonPlaysCache.size > SEASON_PLAYS_CACHE_MAX) {
    const oldest = seasonPlaysCache.keys().next().value;
    if (oldest === undefined) break;
    seasonPlaysCache.delete(oldest);
  }
}

async function playsForSeason(season: number): Promise<Map<string, PbpRow[]> | null> {
  if (seasonPlaysCache.has(season)) return seasonPlaysCache.get(season)!;
  let plays: Map<string, PbpRow[]> | null;
  try {
    plays = await getPlaysByGame(season);
  } catch (err) {
    logger.warn({ err, season }, "[decision-detection] Could not fetch play-by-play; skipping season");
    plays = null;
  }
  seasonPlaysCache.set(season, plays);
  trimSeasonPlaysCache();
  return plays;
}

export interface DecisionDetectionResult {
  overDecided: number;
  overNoPlayData: number;
  propDecided: number;
  propNoPlayData: number;
  propNoPlayerMatch: number;
}

/**
 * Scan every leg with a fixed, one-directional line and decidedAt still
 * unset — won 'over' legs, lost 'under' legs (the exact same real-world
 * event: the total permanently exceeding the line), and won player-prop
 * legs — and, where play-by-play data lets us pin down the exact play, fill
 * in decidedAt/decidedPlayDesc/decidedQuarter/decidedClock with 'exact'
 * confidence. Best-effort per season: a season without a published pbp file
 * is skipped rather than failing the whole run.
 */
export async function detectExactDecisionMoments(leagueId?: number): Promise<DecisionDetectionResult> {
  const result: DecisionDetectionResult = {
    overDecided: 0, overNoPlayData: 0,
    propDecided: 0, propNoPlayData: 0, propNoPlayerMatch: 0,
  };

  // ── Totals legs (over WIN and under LOSS both = total crossed the line) ──
  const overLegs = await storage.getGameLegsPendingDecision(
    [{ betType: "over", result: "win" }, { betType: "under", result: "loss" }],
    leagueId,
  );
  for (const leg of overLegs) {
    const line = parseFloat(leg.line ?? "");
    if (isNaN(line)) { result.overNoPlayData++; continue; }

    const playsByGame = await playsForSeason(leg.season);
    if (!playsByGame) { result.overNoPlayData++; continue; }

    const plays = findGamePlays(playsByGame, leg.season, leg.weekNumber, leg.game.homeTeam, leg.game.awayTeam);
    if (!plays) { result.overNoPlayData++; continue; }

    const decision = findTotalsOverDecision(plays, line);
    if (!decision) { result.overNoPlayData++; continue; }

    await storage.setLegDecision(leg.id, decision);
    result.overDecided++;
  }

  // ── Player-prop legs ────────────────────────────────────────────────────
  const propLegs = await storage.getWonPropLegsPendingDecision(leagueId);
  for (const leg of propLegs) {
    if (!leg.playerName || !leg.propType) { result.propNoPlayerMatch++; continue; }

    const stat = await storage.getPlayerStatByName(leg.playerName, leg.season, leg.weekNumber);
    if (!stat || !stat.player.nflverseId || !stat.player.team) { result.propNoPlayerMatch++; continue; }

    const playsByGame = await playsForSeason(leg.season);
    if (!playsByGame) { result.propNoPlayData++; continue; }

    // We only know the player's team, not which specific game — search this
    // week's games for one where the player's team plays either side.
    const teamShort = abbrevToShort(stat.player.team);
    let plays: PbpRow[] | null = null;
    for (const [gameId, gamePlays] of playsByGame) {
      const parsed = parseGameId(gameId);
      if (!parsed || parsed.season !== leg.season || parsed.week !== leg.weekNumber) continue;
      if (abbrevToShort(parsed.homeAbbrev) === teamShort || abbrevToShort(parsed.awayAbbrev) === teamShort) {
        plays = gamePlays;
        break;
      }
    }
    if (!plays) { result.propNoPlayData++; continue; }

    const playerId = stat.player.nflverseId;
    const pick = (leg.pick ?? "").toLowerCase();
    let decision: DecisionInfo | null = null;

    if (TD_SCORER_PROPS.has(leg.propType)) {
      if (pick === "yes") decision = findTdScorerDecision(plays, playerId, leg.propType);
    } else {
      const statKey = PROP_TYPE_TO_STAT[leg.propType];
      const line = parseFloat(leg.line ?? "");
      if (statKey && pick === "over" && !isNaN(line)) {
        decision = findNumericPropDecision(plays, playerId, statKey, line);
      }
    }

    if (!decision) { result.propNoPlayData++; continue; }

    await storage.setLegDecision(leg.id, decision);
    result.propDecided++;
  }

  return result;
}

export interface HeuristicDetectionResult {
  spreadMoneylineDecided: number;
  underDecided: number;
  noPlayData: number;
}

/**
 * Scan every spread/moneyline WIN-or-LOSS leg and every under-WIN /
 * over-LOSS leg with decidedAt still unset and, where the "mathematically
 * eliminated" heuristic finds a permanent-safety point, fill in decidedAt/...
 * with 'heuristic' confidence. A LOSS is detected via the exact same
 * cushion, just evaluated for the opposite side of the pick — the point
 * where the opponent (or, for totals, the room left under the line) is
 * permanently safe is precisely the point the original pick is permanently
 * eliminated. See the module docstring and the elimination-cushion functions
 * above for the method and its caveats — this is a probabilistic estimate,
 * not a guarantee, and should be treated with lower trust in the UI than
 * 'exact' decisions.
 */
export async function detectHeuristicDecisionMoments(leagueId?: number): Promise<HeuristicDetectionResult> {
  const result: HeuristicDetectionResult = { spreadMoneylineDecided: 0, underDecided: 0, noPlayData: 0 };

  const legs = await storage.getGameLegsPendingDecision(
    [
      { betType: "moneyline", result: "win" }, { betType: "moneyline", result: "loss" },
      { betType: "spread", result: "win" }, { betType: "spread", result: "loss" },
      { betType: "under", result: "win" },
      { betType: "over", result: "loss" },
    ],
    leagueId,
  );
  for (const leg of legs) {
    const playsByGame = await playsForSeason(leg.season);
    if (!playsByGame) { result.noPlayData++; continue; }

    const plays = findGamePlays(playsByGame, leg.season, leg.weekNumber, leg.game.homeTeam, leg.game.awayTeam);
    if (!plays) { result.noPlayData++; continue; }

    const pick = (leg.pick ?? "").toLowerCase();
    const isLoss = leg.result === "loss";
    let decision: DecisionInfo | null = null;

    if (leg.betType === "moneyline") {
      if (pick === "home" || pick === "away") {
        // A pick's loss is exactly the point its opponent's own cushion
        // (same generous comeback bound) permanently clears zero.
        const pickHome = isLoss ? pick !== "home" : pick === "home";
        decision = findEliminationDecision(plays, (play) => moneylineCushion(play, pickHome));
      }
    } else if (leg.betType === "spread") {
      const spread = parseFloat(leg.game.spread ?? "");
      if ((pick === "home" || pick === "away") && !isNaN(spread)) {
        const pickHome = isLoss ? pick !== "home" : pick === "home";
        decision = findEliminationDecision(plays, (play) => spreadCushion(play, pickHome, spread));
      }
    } else if (leg.betType === "under" || leg.betType === "over") {
      // under-WIN and over-LOSS are the same real-world event: the combined
      // score becomes permanently unable to reach the total line.
      const line = parseFloat(leg.line ?? "");
      if (!isNaN(line)) {
        decision = findEliminationDecision(plays, (play) => underCushion(play, line));
      }
    }

    if (!decision) { result.noPlayData++; continue; }

    await storage.setLegDecision(leg.id, decision);
    if (leg.betType === "under" || leg.betType === "over") result.underDecided++;
    else result.spreadMoneylineDecided++;
  }

  return result;
}
