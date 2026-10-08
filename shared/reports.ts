/**
 * Reports: canned extracts of a league's data. Each one comes out as a
 * Dataset (so it can be downloaded as CSV, JSON, XML or Markdown), a few
 * bars for the graphic view, and a short text version for the group chat.
 *
 * The builders here are pure: the server gathers the rows
 * (server/services/reports.ts) and web and mobile draw what comes back.
 */
import type { Dataset, DatasetValue } from "./dataExport";
import { standingsText } from "./standingsExport";

export const REPORT_IDS = ["standings_season", "standings_all_time", "loser_report", "allocation"] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export function isReportId(value: unknown): value is ReportId {
  return (REPORT_IDS as readonly unknown[]).includes(value);
}

export type ReportCatalogEntry = { id: ReportId; title: string; description: string };

/** The reports on offer. `loserLabel` is the league's word ("Asshole", "Jerry", …). */
export function reportCatalog(loserLabel: string): ReportCatalogEntry[] {
  return [
    { id: "standings_season", title: "League Standings · Current Year", description: "Every member's record, win rate and power score this season." },
    { id: "standings_all_time", title: "League Standings · All Time", description: "The same standings across every season on record." },
    { id: "loser_report", title: `${loserLabel} Report`, description: `Who was the ${loserLabel} each week this season, and the bet that did it.` },
    { id: "allocation", title: "Allocation Report", description: "How the league's bets break out by bet type, and how each type has done." },
  ];
}

export type ReportBar = {
  label: string;
  /** Bar length, against `max`. */
  value: number;
  /** What's printed at the end of the bar ("75%", "3"). */
  display: string;
};

export type Report = {
  id: ReportId;
  dataset: Dataset;
  /** The graphic view: one horizontal bar per entry. */
  chart: { title: string; max: number; bars: ReportBar[] };
  /** The group-chat version. */
  text: string;
};

export type StandingsInput = {
  username: string;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  powerScore: number;
  participationRate: number;
  bar: number;
};

/** Best win rate first; more wins breaks a tie. */
function rankStandings(rows: StandingsInput[]): StandingsInput[] {
  return [...rows].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.username.localeCompare(b.username));
}

export function buildStandingsReport(input: {
  id: "standings_season" | "standings_all_time";
  leagueName: string;
  /** "Current Year" or "All Time". */
  scopeLabel: string;
  season?: number | null;
  standings: StandingsInput[];
  now?: Date;
}): Report {
  const ranked = rankStandings(input.standings);
  return {
    id: input.id,
    dataset: {
      name: input.id === "standings_season" ? "league_standings_current_year" : "league_standings_all_time",
      title: `${input.leagueName} standings · ${input.scopeLabel}`,
      description: "One row per league member, ranked by win rate. Records count individual bets (parlay legs), not whole parlays.",
      generatedAt: (input.now ?? new Date()).toISOString(),
      scope: { league: input.leagueName, scope: input.scopeLabel, season: input.season ?? null },
      columns: [
        { key: "rank", label: "Rank", type: "number", description: "Position by win rate, best first." },
        { key: "member", label: "Member", type: "string", description: "League member." },
        { key: "wins", label: "Wins", type: "number", description: "Bets won." },
        { key: "losses", label: "Losses", type: "number", description: "Bets lost." },
        { key: "pushes", label: "Pushes", type: "number", description: "Bets that pushed (tied the line). Not counted in win rate." },
        { key: "win_rate_pct", label: "Win %", type: "number", description: "Wins as a percentage of wins plus losses." },
        { key: "participation_pct", label: "Participation %", type: "number", description: "Share of eligible weeks the member had a bet in." },
        { key: "power_score", label: "Power Score", type: "number", description: "Average of each decided bet's win value weighted by its odds: longer odds won count for more." },
        { key: "bar", label: "BAR", type: "number", description: "Bets Above Replacement: power score times participation, minus the league average of the same." },
      ],
      rows: ranked.map((r, i) => ({
        rank: i + 1,
        member: r.username,
        wins: r.wins,
        losses: r.losses,
        pushes: r.pushes ?? 0,
        win_rate_pct: Number(r.winRate.toFixed(1)),
        participation_pct: Math.round((r.participationRate ?? 0) * 100),
        power_score: Number((r.powerScore ?? 0).toFixed(2)),
        bar: Number((r.bar ?? 0).toFixed(2)),
      })),
    },
    chart: {
      title: "Win %",
      max: 100,
      bars: ranked.map((r) => ({ label: r.username, value: r.winRate, display: `${Math.round(r.winRate)}%` })),
    },
    text: standingsText({ leagueName: input.leagueName, scopeLabel: input.scopeLabel, rows: ranked }),
  };
}

export type LoserWeekInput = {
  weekNumber: number;
  weekLabel: string;
  parlayId: number;
  /** Null for a parlay that didn't lose (won, or still to be decided). */
  loserName: string | null;
  /** The bet that busted it, in its short text form. */
  pick: string | null;
  /** 'loss', 'win', or the open status the parlay is in. */
  parlayStatus: string | null;
};

const outcomeNote = (status: string | null) =>
  status === "win" ? "parlay won" : status === "loss" ? "lost" : "not decided yet";

export function buildLoserReport(input: {
  leagueName: string;
  season: number;
  /** The league's word for the member who busts the parlay. */
  loserLabel: string;
  emoji?: string | null;
  weeks: LoserWeekInput[];
  now?: Date;
}): Report {
  const weeks = [...input.weeks].sort((a, b) => a.weekNumber - b.weekNumber || a.parlayId - b.parlayId);
  const tally = new Map<string, number>();
  for (const w of weeks) if (w.loserName) tally.set(w.loserName, (tally.get(w.loserName) ?? 0) + 1);
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const emoji = input.emoji || "🚨";
  const title = `${input.leagueName} · ${input.season} ${input.loserLabel} Report`;

  return {
    id: "loser_report",
    dataset: {
      name: "weekly_loser_report",
      title,
      description: `One row per parlay this season. The "${input.loserLabel}" is the member whose bet was the first to lose in a losing parlay. A week whose parlay won, or isn't decided yet, has no ${input.loserLabel}.`,
      generatedAt: (input.now ?? new Date()).toISOString(),
      scope: { league: input.leagueName, season: input.season, label: input.loserLabel },
      columns: [
        { key: "week", label: "Week", type: "number", description: "NFL week number." },
        { key: "week_label", label: "Week Label", type: "string", description: "The week's name in the app." },
        { key: "parlay_id", label: "Parlay ID", type: "number", description: "The parlay the row is about. A league can run more than one a week." },
        { key: "parlay_result", label: "Parlay Result", type: "string", description: "loss, win, or the status of a parlay that isn't decided yet." },
        { key: "member", label: input.loserLabel, type: "string", description: "The member whose bet busted the parlay first. Empty unless the parlay lost." },
        { key: "bet", label: "Bet", type: "string", description: "The losing bet that busted it." },
      ],
      rows: weeks.map((w) => ({
        week: w.weekNumber,
        week_label: w.weekLabel,
        parlay_id: w.parlayId,
        parlay_result: w.parlayStatus,
        member: w.loserName,
        bet: w.pick,
      })),
    },
    chart: {
      title: `Times named ${input.loserLabel}`,
      max: Math.max(1, ...ranked.map(([, n]) => n)),
      bars: ranked.map(([name, n]) => ({ label: name, value: n, display: String(n) })),
    },
    text: [
      `${emoji} ${title} ${emoji}`,
      ...weeks.map((w) =>
        w.loserName ? `Wk ${w.weekNumber}: ${w.loserName}${w.pick ? ` (${w.pick})` : ""}` : `Wk ${w.weekNumber}: nobody (${outcomeNote(w.parlayStatus)})`),
      ...(ranked.length > 0 ? ["", `Tally: ${ranked.map(([name, n]) => `${name} ${n}`).join(", ")}`] : []),
    ].join("\n"),
  };
}

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Player Prop",
};
const BET_TYPE_ORDER = ["spread", "moneyline", "over", "under", "player_prop"];

export function buildAllocationReport(input: {
  leagueName: string;
  scopeLabel: string;
  season?: number | null;
  legs: { betType: string; result: string | null }[];
  now?: Date;
}): Report {
  const byType = new Map<string, { bets: number; wins: number; losses: number; pushes: number; pending: number }>();
  for (const leg of input.legs) {
    const row = byType.get(leg.betType) ?? { bets: 0, wins: 0, losses: 0, pushes: 0, pending: 0 };
    row.bets++;
    if (leg.result === "win") row.wins++;
    else if (leg.result === "loss") row.losses++;
    else if (leg.result === "push") row.pushes++;
    else row.pending++;
    byType.set(leg.betType, row);
  }
  const total = input.legs.length;
  const types = [...byType.keys()].sort((a, b) => {
    const ai = BET_TYPE_ORDER.indexOf(a);
    const bi = BET_TYPE_ORDER.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b);
  });
  const rows = types.map((type) => {
    const r = byType.get(type)!;
    const decided = r.wins + r.losses;
    return {
      type,
      label: BET_TYPE_LABELS[type] ?? type,
      ...r,
      sharePct: total > 0 ? (r.bets / total) * 100 : 0,
      winRatePct: decided > 0 ? (r.wins / decided) * 100 : null,
    };
  });
  const title = `${input.leagueName} · Allocation · ${input.scopeLabel}`;

  return {
    id: "allocation",
    dataset: {
      name: "bet_type_allocation",
      title,
      description: "One row per bet type: how many of the league's bets were of that type, and how those bets did.",
      generatedAt: (input.now ?? new Date()).toISOString(),
      scope: { league: input.leagueName, scope: input.scopeLabel, season: input.season ?? null, total_bets: total },
      columns: [
        { key: "bet_type", label: "Bet Type", type: "string", description: "spread, moneyline, over, under (game totals) or player_prop." },
        { key: "bets", label: "Bets", type: "number", description: "Number of bets of this type." },
        { key: "share_pct", label: "Share %", type: "number", description: "This type's share of all bets." },
        { key: "wins", label: "Wins", type: "number", description: "Bets of this type that won." },
        { key: "losses", label: "Losses", type: "number", description: "Bets of this type that lost." },
        { key: "pushes", label: "Pushes", type: "number", description: "Bets of this type that pushed." },
        { key: "pending", label: "Pending", type: "number", description: "Bets of this type not decided yet." },
        { key: "win_rate_pct", label: "Win %", type: "number", description: "Wins as a percentage of wins plus losses. Empty with nothing decided." },
      ],
      rows: rows.map((r): Record<string, DatasetValue> => ({
        bet_type: r.type,
        bets: r.bets,
        share_pct: Number(r.sharePct.toFixed(1)),
        wins: r.wins,
        losses: r.losses,
        pushes: r.pushes,
        pending: r.pending,
        win_rate_pct: r.winRatePct == null ? null : Number(r.winRatePct.toFixed(1)),
      })),
    },
    chart: {
      title: "Share of bets",
      max: 100,
      bars: rows.map((r) => ({ label: r.label, value: r.sharePct, display: `${Math.round(r.sharePct)}%` })),
    },
    text: [
      `📊 ${title}`,
      `${total} bet${total === 1 ? "" : "s"}`,
      ...rows.map((r) =>
        `${r.label}: ${r.bets} (${Math.round(r.sharePct)}%) · ${r.wins}-${r.losses}` +
        (r.winRatePct == null ? "" : ` (${Math.round(r.winRatePct)}%)`)),
    ].join("\n"),
  };
}
