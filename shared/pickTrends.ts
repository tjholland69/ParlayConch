/**
 * Pick trends: a member's (and their league's) win-loss record sliced by
 * the kind of bet. "You're 7-2 betting running backs", "You're 2-6 on
 * unders". Built only from graded picks already in the league.
 *
 * Every pick is filed under each angle it fits (see legAngles), so adding a
 * new way to slice the record is one more entry there. Player props are
 * sliced by the player's position, the stat, the side and the player.
 */
import { betAngle } from "./pickSuggestions";
import { PLAYER_PROP_TYPES } from "./schema";

/** Decided picks an angle needs before its record is worth showing. */
export const TREND_MIN_SAMPLE = 3;

export type TrendLeg = {
  userId: string;
  betType: string;
  pick: string;
  line?: string | null;
  odds?: string | null;
  result: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
  playerName?: string | null;
  propType?: string | null;
  /** The prop's player's position as the players table has it ("RB"). */
  position?: string | null;
};

export type PickTrend = {
  key: string;
  /** Reads after "You're 7-2 " / "The league is 7-2 ": "betting running backs". */
  phrase: string;
  wins: number;
  losses: number;
  /** A winning record, or a losing one. Even records aren't trends. */
  hot: boolean;
};

const POSITION_LABELS: Record<string, { key: string; label: string }> = {
  QB: { key: "QB", label: "quarterbacks" },
  RB: { key: "RB", label: "running backs" }, FB: { key: "RB", label: "running backs" }, HB: { key: "RB", label: "running backs" },
  WR: { key: "WR", label: "wide receivers" },
  TE: { key: "TE", label: "tight ends" },
  K: { key: "K", label: "kickers" }, PK: { key: "K", label: "kickers" },
};
const DEFENSE = new Set(["DE", "DT", "DL", "NT", "LB", "OLB", "ILB", "MLB", "CB", "S", "SS", "FS", "SAF", "DB", "EDGE"]);

/** "running backs" for RB/FB/HB, and so on. Null for a position nobody bets props on. */
export function positionTrendGroup(position: string | null | undefined): { key: string; label: string } | null {
  const pos = position?.trim().toUpperCase();
  if (!pos) return null;
  if (DEFENSE.has(pos)) return { key: "DEF", label: "defenders" };
  return POSITION_LABELS[pos] ?? null;
}

type Angle = { key: string; phrase: string };

/** Every way this pick can be sliced. */
export function legAngles(leg: TrendLeg): Angle[] {
  const angles: Angle[] = [];
  if (leg.betType === "player_prop") {
    angles.push({ key: "type:player_prop", phrase: "on player props" });
    const position = positionTrendGroup(leg.position);
    if (position) angles.push({ key: `position:${position.key}`, phrase: `betting ${position.label}` });
    const stat = PLAYER_PROP_TYPES.find((p) => p.value === leg.propType)?.label;
    if (stat) angles.push({ key: `stat:${leg.propType}`, phrase: `on ${stat} props` });
    if (leg.pick === "over" || leg.pick === "under") angles.push({ key: `prop-side:${leg.pick}`, phrase: `on prop ${leg.pick}s` });
    const player = leg.playerName?.trim();
    if (player) angles.push({ key: `player:${player.toLowerCase()}`, phrase: `betting ${player}` });
    return angles;
  }
  const kind = betAngle(leg);
  if (kind) angles.push({ key: `kind:${kind.key}`, phrase: `on ${kind.label}` });
  if (leg.betType === "spread" || leg.betType === "moneyline") {
    angles.push({ key: `type:${leg.betType}`, phrase: `on ${leg.betType} bets` });
    const team = leg.pick === "home" ? leg.homeTeam : leg.pick === "away" ? leg.awayTeam : null;
    if (team) angles.push({ key: `team:${team}`, phrase: `picking the ${team}` });
  }
  return angles;
}

/** How far a record sits from a coin flip, pulled toward it for small samples. */
const lean = (t: { wins: number; losses: number }) => Math.abs((t.wins + 2) / (t.wins + t.losses + 4) - 0.5);

function trendsFor(legs: TrendLeg[], limit: number): PickTrend[] {
  const tallies = new Map<string, PickTrend>();
  for (const leg of legs) {
    if (leg.result !== "win" && leg.result !== "loss") continue;
    for (const angle of legAngles(leg)) {
      const t = tallies.get(angle.key) ?? { key: angle.key, phrase: angle.phrase, wins: 0, losses: 0, hot: false };
      if (leg.result === "win") t.wins++; else t.losses++;
      tallies.set(angle.key, t);
    }
  }
  return [...tallies.values()]
    .filter((t) => t.wins + t.losses >= TREND_MIN_SAMPLE && t.wins !== t.losses)
    .map((t) => ({ ...t, hot: t.wins > t.losses }))
    .sort((a, b) => lean(b) - lean(a) || (b.wins + b.losses) - (a.wins + a.losses) || a.key.localeCompare(b.key))
    .slice(0, limit);
}

/**
 * The strongest trends, hot and cold, for one member and for the league as
 * a whole (the member's picks included).
 */
export function buildPickTrends(input: { userId: string; history: TrendLeg[]; limit?: number }): { you: PickTrend[]; league: PickTrend[] } {
  const limit = input.limit ?? 6;
  return {
    you: trendsFor(input.history.filter((l) => l.userId === input.userId), limit),
    league: trendsFor(input.history, limit),
  };
}

/** "You're 7-2 betting running backs". */
export function trendSentence(trend: PickTrend, who: "you" | "league"): string {
  return `${who === "you" ? "You're" : "The league is"} ${trend.wins}-${trend.losses} ${trend.phrase}`;
}
