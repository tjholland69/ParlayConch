import {
  buildUserStat,
  computeWinRate,
  countParlayOutcomes,
  isDecidedParlayStatus,
  normalizeOutcomeCounts,
} from "../../shared/statsAggregation";

export type StatsAggregationRule = {
  id: string;
  description: string;
  parlays: ReadonlyArray<{ status: string | null }>;
  expected: { wins: number; losses: number; pushes: number; winRate: number };
};

export const STATS_AGGREGATION_RULES: StatsAggregationRule[] = [
  {
    id: "stats.all-decided",
    description: "Counts win/loss/push only",
    parlays: [
      { status: "win" },
      { status: "win" },
      { status: "loss" },
      { status: "push" },
    ],
    expected: { wins: 2, losses: 1, pushes: 1, winRate: (2 / 3) * 100 },
  },
  {
    id: "stats.excludes-null-status",
    description: "Null status parlays excluded from standings",
    parlays: [{ status: "win" }, { status: null }, { status: null }],
    expected: { wins: 1, losses: 0, pushes: 0, winRate: 100 },
  },
  {
    id: "stats.excludes-pending",
    description: "Pending/approved parlays excluded from standings",
    parlays: [
      { status: "win" },
      { status: "pending" },
      { status: "approved" },
      { status: "rejected" },
    ],
    expected: { wins: 1, losses: 0, pushes: 0, winRate: 100 },
  },
  {
    id: "stats.empty-string-status",
    description: "Empty string status treated as undecided",
    parlays: [{ status: "win" }, { status: "" }],
    expected: { wins: 1, losses: 0, pushes: 0, winRate: 100 },
  },
  {
    id: "stats.no-decided",
    description: "Zero decided parlays yields 0% win rate",
    parlays: [{ status: null }, { status: "pending" }],
    expected: { wins: 0, losses: 0, pushes: 0, winRate: 0 },
  },
  {
    id: "stats.pushes-excluded-from-winRate-denominator",
    description: "Win rate uses wins / (wins + losses), pushes excluded",
    parlays: [{ status: "win" }, { status: "push" }, { status: "push" }],
    expected: { wins: 1, losses: 0, pushes: 2, winRate: 100 },
  },
];

export const IS_DECIDED_STATUS_RULES: {
  id: string;
  status: string | null | undefined;
  expected: boolean;
}[] = [
  { id: "decided.win", status: "win", expected: true },
  { id: "decided.loss", status: "loss", expected: true },
  { id: "decided.push", status: "push", expected: true },
  { id: "decided.null", status: null, expected: false },
  { id: "decided.undefined", status: undefined, expected: false },
  { id: "decided.pending", status: "pending", expected: false },
  { id: "decided.empty", status: "", expected: false },
];

export function applyStatsAggregationRule(rule: StatsAggregationRule) {
  const counts = countParlayOutcomes(rule.parlays);
  return { ...counts, winRate: computeWinRate(counts) };
}

export const NORMALIZE_OUTCOME_COUNTS_RULES = [
  {
    id: "normalize.sql-strings",
    raw: { wins: "2", losses: "1", pushes: "0" },
    expected: { wins: 2, losses: 1, pushes: 0 },
  },
  {
    id: "normalize.sql-numbers",
    raw: { wins: 0, losses: 0, pushes: 3 },
    expected: { wins: 0, losses: 0, pushes: 3 },
  },
] as const;

export const BUILD_USER_STAT_RULES = [
  {
    id: "buildUserStat.displayName-from-settings",
    identity: {
      userId: "u1",
      firstName: "First",
      email: "a@b.com",
      profileImageUrl: null,
      settings: { displayName: "Display", region: "US" },
    },
    counts: { wins: 2, losses: 1, pushes: 0 },
    expected: {
      userId: "u1",
      username: "Display",
      profileImageUrl: null,
      wins: 2,
      losses: 1,
      pushes: 0,
      winRate: (2 / 3) * 100,
      region: "US",
    },
  },
  {
    id: "buildUserStat.fallback-username",
    identity: {
      userId: "u2",
      firstName: null,
      email: null,
      profileImageUrl: null,
      settings: null,
    },
    counts: { wins: 0, losses: 0, pushes: 0 },
    expected: {
      userId: "u2",
      username: "Unknown",
      profileImageUrl: null,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      region: null,
    },
  },
] as const;
