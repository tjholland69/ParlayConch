/**
 * Builds human-readable "why did this leg win/lose" text for parlay legs.
 *
 * Pure functions over already-fetched data — no DB/Node dependencies — so
 * this module is safe to import from server (to compute the persisted
 * `resultDetail` at grading time), web, and mobile (both as a fallback for
 * legs graded before this feature existed, or never auto-enriched).
 *
 * Prop-type coverage intentionally mirrors server/services/propEnrichment.ts's
 * PROP_TYPE_TO_STAT / TD_SCORER_PROPS — a prop type that service can't resolve
 * a result for also can't be justified here.
 */
import type { Game, ParlayLeg, PlayerWeekStat } from "./schema";

export interface JustificationInputs {
  leg: Pick<ParlayLeg, "betType" | "pick" | "line" | "propType" | "playerName" | "result">;
  game?: Game | null;
  stat?: PlayerWeekStat | null;
}

type StatKey =
  | "rushingYards" | "rushingTds" | "carries"
  | "receivingYards" | "receivingTds" | "receptions"
  | "passingYards" | "passingTds" | "attempts" | "completions" | "interceptions"
  | "defSacks" | "fantasyPoints";

/** Mirrors propEnrichment.ts's PROP_TYPE_TO_STAT — keep these two in sync. */
const PROP_TYPE_TO_STAT: Partial<Record<string, StatKey>> = {
  rush_yards:       "rushingYards",
  rush_attempts:    "carries",
  rec_yards:        "receivingYards",
  receptions:       "receptions",
  pass_yards:       "passingYards",
  pass_tds:         "passingTds",
  pass_attempts:    "attempts",
  pass_completions: "completions",
  interceptions:    "interceptions",
  sacks:            "defSacks",
  kicking_pts:      "fantasyPoints", // best available proxy — see propEnrichment.ts
};

/** Mirrors propEnrichment.ts's TD_SCORER_PROPS. */
const TD_SCORER_PROPS = new Set(["anytime_td", "first_td", "last_td", "rec_tds", "rush_tds"]);

const plural = (n: number, word: string, pluralWord = `${word}s`) => (n === 1 ? word : pluralWord);

/** Phrase builders for numeric over/under props, keyed by propType. */
const STAT_PHRASE: Partial<Record<string, (actual: number) => string>> = {
  rush_yards:        (a) => `Rushed for ${a} yds`,
  rush_attempts:      (a) => `Carried the ball ${a} ${plural(a, "time")}`,
  rec_yards:          (a) => `Caught for ${a} yds`,
  receptions:         (a) => `Hauled in ${a} ${plural(a, "reception")}`,
  pass_yards:         (a) => `Passed for ${a} yds`,
  pass_tds:           (a) => `Threw ${a} passing ${plural(a, "TD")}`,
  pass_attempts:      (a) => `Attempted ${a} ${plural(a, "pass", "passes")}`,
  pass_completions:   (a) => `Completed ${a} ${plural(a, "pass", "passes")}`,
  interceptions:      (a) => `Threw ${a} ${plural(a, "interception")}`,
  sacks:              (a) => `Recorded ${a} ${plural(a, "sack")}`,
  kicking_pts:        (a) => `Recorded ${a} kicking fantasy pts`,
  all_purpose_yards:  (a) => `Totaled ${a} all-purpose yds`,
  tackles:            (a) => `Recorded ${a} ${plural(a, "tackle")}`,
};

function computeActual(propType: string, stat: PlayerWeekStat): number | null {
  if (propType === "all_purpose_yards") {
    if (stat.rushingYards == null && stat.receivingYards == null) return null;
    return (stat.rushingYards ?? 0) + (stat.receivingYards ?? 0);
  }
  if (propType === "tackles") {
    if (stat.defTacklesSolo == null && stat.defTacklesWithAssist == null) return null;
    return (stat.defTacklesSolo ?? 0) + (stat.defTacklesWithAssist ?? 0);
  }
  const statKey = PROP_TYPE_TO_STAT[propType];
  if (!statKey) return null;
  const val = stat[statKey] as number | null | undefined;
  return val == null ? null : val;
}

function buildTdScorerDetail(propType: string, pick: string, stat: PlayerWeekStat): string | null {
  let tds: number;
  let label: string;
  if (propType === "rush_tds") { tds = stat.rushingTds ?? 0; label = "a rushing TD"; }
  else if (propType === "rec_tds") { tds = stat.receivingTds ?? 0; label = "a receiving TD"; }
  else { tds = (stat.rushingTds ?? 0) + (stat.receivingTds ?? 0) + (stat.passingTds ?? 0); label = "a TD"; }

  const scored = tds > 0;
  if (pick !== "yes" && pick !== "no") return null;
  return scored ? `Scored ${label}` : `Did not score ${label}`;
}

function buildPropDetail(
  leg: Pick<ParlayLeg, "propType" | "pick" | "line">,
  stat: PlayerWeekStat | null | undefined
): string | null {
  if (!leg.propType || !stat) return null;
  const propType = leg.propType;
  const pick = (leg.pick ?? "").toLowerCase();

  if (TD_SCORER_PROPS.has(propType)) {
    return buildTdScorerDetail(propType, pick, stat);
  }

  const actual = computeActual(propType, stat);
  if (actual == null) return null;
  const phrase = STAT_PHRASE[propType]?.(actual);
  if (!phrase) return null;

  if ((pick === "over" || pick === "under") && leg.line) {
    return `${phrase} (needed ${pick} ${leg.line})`;
  }
  return phrase;
}

function buildGameDetail(game: Game | null | undefined): string | null {
  if (!game || game.homeScore == null || game.awayScore == null) return null;
  return `Final: ${game.awayTeam} ${game.awayScore} @ ${game.homeTeam} ${game.homeScore}`;
}

/** Server-side: builds the string to persist as resultDetail at grading time. */
export function buildResultDetail(input: JustificationInputs): string | null {
  const { leg, game, stat } = input;
  if (leg.betType === "player_prop") {
    return buildPropDetail(leg, stat ?? null);
  }
  return buildGameDetail(game ?? null);
}

/**
 * Client-side fallback for legs missing a stored resultDetail — only
 * derivable for score-based bets, since `game` is already included in every
 * parlay-list API response. Returns null for player_prop (no stat data rides
 * along on the wire).
 */
export function deriveResultDetailFromGame(
  leg: Pick<ParlayLeg, "betType" | "pick" | "line">,
  game: Game | null | undefined
): string | null {
  if (leg.betType === "player_prop") return null;
  return buildGameDetail(game);
}

/**
 * Full fallback chain used by both web and mobile display components:
 * stored value -> derived from game -> generic message.
 */
export function resolveResultDetail(
  leg: { resultDetail?: string | null; betType: string; pick: string; line: string | null; result?: string | null },
  game: Game | null | undefined
): string {
  if (leg.resultDetail) return leg.resultDetail;
  const derived = deriveResultDetailFromGame(leg, game);
  if (derived) return derived;
  return "No detail available";
}
