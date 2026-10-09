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

export const REPORT_IDS = ["standings_season", "standings_all_time", "loser_report", "allocation", "disputes", "suss"] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export function isReportId(value: unknown): value is ReportId {
  return (REPORT_IDS as readonly unknown[]).includes(value);
}

export type ReportCatalogEntry = { id: ReportId; title: string; description: string };

/** The reports on offer. `loserLabel` is the league's word ("Asshole", "Jerry", …). */
export function reportCatalog(loserLabel: string): ReportCatalogEntry[] {
  return [
    { id: "standings_season", title: "League Standings · Current Year", description: "Every member's record and win rate this season." },
    { id: "standings_all_time", title: "League Standings · All Time", description: "The same standings across every season on record." },
    { id: "loser_report", title: `${loserLabel} Report`, description: `Who was the ${loserLabel} each week this season, and the bet that did it.` },
    { id: "allocation", title: "Allocation Report", description: "How the league's bets break out by bet type, and how each type has done." },
    { id: "disputes", title: "Disputes Report", description: "Every dispute raised: the bet, the week it touched, and how it was ruled." },
    { id: "suss", title: "The Suss Report", description: "How suss the league finds each pick in the open parlay." },
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
  powerScore?: number;
  participationRate?: number;
  bar?: number;
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
      ],
      rows: ranked.map((r, i) => ({
        rank: i + 1,
        member: r.username,
        wins: r.wins,
        losses: r.losses,
        pushes: r.pushes ?? 0,
        win_rate_pct: Number(r.winRate.toFixed(1)),
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
        w.loserName ? `Wk ${w.weekNumber}: ${w.loserName}${w.pick ? ` - ${w.pick}` : ""}` : `Wk ${w.weekNumber}: nobody (${outcomeNote(w.parlayStatus)})`),
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

export type DisputeInput = {
  id: number;
  raisedAt: Date | string;
  raisedBy: string;
  /** Whose bet it was. */
  betOwner: string;
  /** The bet in its short text form. */
  bet: string;
  season: number | null;
  weekNumber: number | null;
  weekLabel: string | null;
  /** 'result_wrong' | 'entered_incorrectly' */
  reasonType: string;
  justification: string;
  /** 'open' | 'resolved' | 'dismissed' */
  status: string;
  resolvedBy: string | null;
  resolvedAt: Date | string | null;
  notes: string | null;
};

const DISPUTE_REASONS: Record<string, string> = {
  result_wrong: "Result is wrong",
  entered_incorrectly: "Bet entered incorrectly",
};
/** How a dispute was ruled, in the words the report uses. */
export function disputeRuling(status: string): string {
  return status === "resolved" ? "Upheld" : status === "dismissed" ? "Dismissed" : "Open";
}

export function buildDisputesReport(input: { leagueName: string; disputes: DisputeInput[]; now?: Date }): Report {
  const disputes = [...input.disputes].sort((a, b) => new Date(b.raisedAt).getTime() - new Date(a.raisedAt).getTime());
  const count = (ruling: string) => disputes.filter((d) => disputeRuling(d.status) === ruling).length;
  const rulings = ["Upheld", "Dismissed", "Open"].map((r) => ({ ruling: r, n: count(r) }));
  const title = `${input.leagueName} · Disputes Report`;
  const iso = (t: Date | string | null) => (t ? new Date(t).toISOString() : null);
  const week = (d: DisputeInput) => (d.weekNumber != null ? `Wk ${d.weekNumber}${d.season ? ` ${d.season}` : ""}` : d.weekLabel ?? "Week unknown");

  return {
    id: "disputes",
    dataset: {
      name: "disputes",
      title,
      description: "One row per dispute raised in the league, newest first. A member disputes one of their own bets; the ruling is Upheld (the bet was corrected), Dismissed (no change) or Open (not ruled on yet).",
      generatedAt: (input.now ?? new Date()).toISOString(),
      scope: { league: input.leagueName, total_disputes: disputes.length },
      columns: [
        { key: "dispute_id", label: "Dispute ID", type: "number", description: "The dispute's id." },
        { key: "raised_at", label: "Raised At", type: "datetime", description: "When the dispute was filed." },
        { key: "raised_by", label: "Raised By", type: "string", description: "The member who filed it." },
        { key: "season", label: "Season", type: "number", description: "NFL season of the game week the bet was in." },
        { key: "week", label: "Week", type: "number", description: "NFL week number the bet was in." },
        { key: "bet_owner", label: "Bet Owner", type: "string", description: "The member whose bet was disputed." },
        { key: "bet", label: "Bet", type: "string", description: "The disputed bet." },
        { key: "reason", label: "Reason", type: "string", description: "What the dispute was about: the result is wrong, or the bet was entered incorrectly." },
        { key: "details", label: "Details", type: "string", description: "The member's own explanation." },
        { key: "ruling", label: "Ruling", type: "string", description: "Upheld, Dismissed or Open." },
        { key: "ruled_by", label: "Ruled By", type: "string", description: "Who made the ruling." },
        { key: "ruled_at", label: "Ruled At", type: "datetime", description: "When the ruling was made." },
        { key: "ruling_notes", label: "Ruling Notes", type: "string", description: "The note left with the ruling." },
      ],
      rows: disputes.map((d): Record<string, DatasetValue> => ({
        dispute_id: d.id,
        raised_at: iso(d.raisedAt),
        raised_by: d.raisedBy,
        season: d.season,
        week: d.weekNumber,
        bet_owner: d.betOwner,
        bet: d.bet,
        reason: DISPUTE_REASONS[d.reasonType] ?? d.reasonType,
        details: d.justification,
        ruling: disputeRuling(d.status),
        ruled_by: d.resolvedBy,
        ruled_at: iso(d.resolvedAt),
        ruling_notes: d.notes,
      })),
    },
    chart: {
      title: "Disputes by ruling",
      max: Math.max(1, ...rulings.map((r) => r.n)),
      bars: rulings.map((r) => ({ label: r.ruling, value: r.n, display: String(r.n) })),
    },
    text: [
      `⚖️ ${title}`,
      disputes.length === 0
        ? "No disputes on record."
        : `${disputes.length} raised: ${rulings.map((r) => `${r.n} ${r.ruling.toLowerCase()}`).join(", ")}`,
      ...disputes.map((d) =>
        `${week(d)}: ${d.betOwner} - ${d.bet} · ${DISPUTE_REASONS[d.reasonType] ?? d.reasonType} · ${disputeRuling(d.status)}` +
        (d.notes?.trim() ? ` - ${d.notes.trim()}` : "")),
    ].join("\n"),
  };
}

export type SussInput = {
  parlayId: number;
  weekLabel: string;
  legs: { owner: string; bet: string; votes: number; voters: number }[];
};

/** Open parlays only: each pick and the share of the league that finds it suss. */
export function buildSussReport(input: { leagueName: string; parlays: SussInput[]; now?: Date }): Report {
  const rows = input.parlays.flatMap((p) =>
    p.legs.map((l) => ({ ...l, parlayId: p.parlayId, weekLabel: p.weekLabel, pct: l.voters > 0 ? Math.round((l.votes / l.voters) * 100) : 0 })),
  ).sort((a, b) => b.pct - a.pct || a.owner.localeCompare(b.owner));
  const title = `${input.leagueName} · The Suss Report`;
  return {
    id: "suss",
    dataset: {
      name: "suss_report",
      title,
      description: "One row per pick in an open parlay, most suss first. Suss % is the share of the other league members who down-voted the pick. Votes are anonymous: only the count is kept in this report.",
      generatedAt: (input.now ?? new Date()).toISOString(),
      scope: { league: input.leagueName, open_parlays: input.parlays.length },
      columns: [
        { key: "week", label: "Week", type: "string", description: "The week the open parlay is for." },
        { key: "parlay_id", label: "Parlay ID", type: "number", description: "The open parlay the pick is in." },
        { key: "member", label: "Member", type: "string", description: "Whose pick it is." },
        { key: "bet", label: "Bet", type: "string", description: "The pick." },
        { key: "down_votes", label: "Down Votes", type: "number", description: "How many members down-voted it." },
        { key: "possible_votes", label: "Possible Votes", type: "number", description: "League members other than the pick's owner, who can't vote on their own pick." },
        { key: "suss_pct", label: "Suss %", type: "number", description: "Down votes as a percentage of possible votes." },
      ],
      rows: rows.map((r) => ({
        week: r.weekLabel,
        parlay_id: r.parlayId,
        member: r.owner,
        bet: r.bet,
        down_votes: r.votes,
        possible_votes: r.voters,
        suss_pct: r.pct,
      })),
    },
    chart: {
      title: "Suss %",
      max: 100,
      bars: rows.map((r) => ({ label: `${r.owner} - ${r.bet}`, value: r.pct, display: `${r.pct}%` })),
    },
    text: [
      `🌡️ ${title}`,
      rows.length === 0 ? "No picks in an open parlay right now." : null,
      ...rows.map((r) => `${r.owner} - ${r.bet}: ${r.pct}% suss`),
    ].filter((l): l is string => l != null).join("\n"),
  };
}
