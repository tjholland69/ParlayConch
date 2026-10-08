import { getSlate } from "./slate";
import type { Dataset, DatasetColumn } from "./dataExport";

/** One parlay leg with the parlay, week, league and game details an export needs. */
export type LegExportRow = {
  legId: number;
  parlayId: number;
  league: string;
  season: number;
  week: number;
  parlayStatus: string | null;
  betOwner: string;
  betType: string;
  awayTeam: string | null;
  homeTeam: string | null;
  playerName: string | null;
  propType: string | null;
  pick: string;
  line: string | null;
  odds: string | null;
  oddsSource: string | null;
  gameSegment: string | null;
  result: string | null;
  resultDetail: string | null;
  kickoff: Date | string | null;
  decidedAt: Date | string | null;
  notes: string | null;
};

type LegColumn = DatasetColumn & { value: (r: LegExportRow) => string | number | null };

const COLUMNS: LegColumn[] = [
  { key: "leg_id", label: "Leg ID", type: "number", description: "Unique id of this bet (one leg of a parlay).", value: r => r.legId },
  { key: "parlay_id", label: "Parlay ID", type: "number", description: "The parlay this leg belongs to. Legs sharing a parlay_id win or lose together.", value: r => r.parlayId },
  { key: "league", label: "League", type: "string", description: "League name.", value: r => r.league },
  { key: "season", label: "Season", type: "number", description: "NFL season year.", value: r => r.season },
  { key: "week", label: "Week", type: "number", description: "NFL week number within the season.", value: r => r.week },
  { key: "parlay_status", label: "Parlay Status", type: "string", description: "Where the whole parlay stands: draft, pending, approved, sent, placed, win, loss, rejected or void. A parlay never pushes.", value: r => r.parlayStatus },
  { key: "bet_owner", label: "Bet Owner", type: "string", description: "The member who made this pick.", value: r => r.betOwner },
  { key: "bet_type", label: "Bet Type", type: "string", description: "spread, moneyline, over, under (game totals) or player_prop.", value: r => r.betType },
  { key: "matchup", label: "Matchup", type: "string", description: "Away team @ home team. Empty for a prop with no game linked.", value: r => (r.awayTeam && r.homeTeam ? `${r.awayTeam} @ ${r.homeTeam}` : null) },
  { key: "player", label: "Player", type: "string", description: "Player a prop bet is on. Empty for game bets.", value: r => r.playerName },
  { key: "prop_type", label: "Prop Type", type: "string", description: "Stat a prop bet is on, e.g. rush_yards, receptions, anytime_td. Empty for game bets.", value: r => r.propType },
  { key: "pick", label: "Pick", type: "string", description: "The side taken: a team name, over/under, or yes/no for a scorer prop.", value: r => pickText(r) },
  { key: "line", label: "Line", type: "string", description: "The number the bet was taken at: point spread, total, or prop line.", value: r => r.line },
  { key: "odds", label: "Odds", type: "string", description: "American odds at the time of the pick, e.g. -110 or +150.", value: r => r.odds },
  { key: "odds_source", label: "Odds Source", type: "string", description: "Sportsbook the line and odds came from.", value: r => r.oddsSource },
  { key: "game_segment", label: "Game Segment", type: "string", description: "Part of the game the bet covers, e.g. First Half. Empty means the full game.", value: r => r.gameSegment },
  { key: "result", label: "Result", type: "string", description: "win, loss or push. Empty while the bet is undecided. A push drops the leg from the parlay without losing it.", value: r => r.result },
  { key: "result_detail", label: "Result Detail", type: "string", description: "Why the bet was graded that way, e.g. the final score or stat line.", value: r => r.resultDetail },
  { key: "game_date_et", label: "Game Date (ET)", type: "string", description: "Kickoff date, US Eastern time, MM/DD/YYYY.", value: r => eastern(r.kickoff, { year: "numeric", month: "2-digit", day: "2-digit" }) },
  { key: "kickoff_et", label: "Kickoff (ET)", type: "string", description: "Kickoff time, US Eastern time.", value: r => eastern(r.kickoff, { hour: "numeric", minute: "2-digit" }) },
  { key: "slate", label: "Slate", type: "string", description: "Broadcast window of the game: Morning, Early Slate, Afternoon Slate or Primetime.", value: r => (r.kickoff ? getSlate(r.kickoff) : null) },
  { key: "decided_at_utc", label: "Decided At (UTC)", type: "datetime", description: "When the bet's outcome became fixed, ISO 8601 UTC. Can be before the game ended.", value: r => (r.decidedAt ? new Date(r.decidedAt).toISOString() : null) },
  { key: "notes", label: "Notes", type: "string", description: "Free-text note on the bet.", value: r => r.notes },
];

/** "home"/"away" mean nothing outside the app, so name the team taken. */
function pickText(r: LegExportRow): string {
  if (r.pick === "home" && r.homeTeam) return r.homeTeam;
  if (r.pick === "away" && r.awayTeam) return r.awayTeam;
  return r.pick;
}

function eastern(value: Date | string | null, options: Intl.DateTimeFormatOptions): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", ...options });
}

function escapeCell(value: string | number | null): string {
  let s = value == null ? "" : String(value);
  // A cell starting with = + - @ runs as a formula in Excel/Sheets. Lines and
  // odds legitimately start with + or -, so only guard non-numeric text.
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Newest week first, then by parlay and leg. */
function sortLegRows(rows: LegExportRow[]): LegExportRow[] {
  return [...rows].sort((a, b) =>
    (b.season - a.season) || (b.week - a.week) || (a.parlayId - b.parlayId) || (a.legId - b.legId));
}

/** Bet history as a Dataset, for the JSON, XML and Markdown exports. */
export function legsDataset(rows: LegExportRow[], scope: Dataset["scope"] = {}, now: Date = new Date()): Dataset {
  return {
    name: "bet_history",
    title: "Parlay.Conch bet history",
    description: "One row per bet. A parlay is a league's shared ticket for an NFL week: each member adds one bet (a leg), and every leg has to win for the parlay to win.",
    generatedAt: now.toISOString(),
    scope,
    columns: COLUMNS.map(({ value: _value, ...column }) => column),
    rows: sortLegRows(rows).map(r => Object.fromEntries(COLUMNS.map(c => [c.key, c.value(r)]))),
  };
}

/** Bet-history export: one row per parlay leg, newest week first. */
export function legsToCsv(rows: LegExportRow[]): string {
  const sorted = sortLegRows(rows);
  const lines = [COLUMNS.map(c => c.key), ...sorted.map(r => COLUMNS.map(c => escapeCell(c.value(r))))];
  // The BOM makes Excel read the file as UTF-8 (player names with accents).
  return "﻿" + lines.map(l => l.join(",")).join("\r\n") + "\r\n";
}
