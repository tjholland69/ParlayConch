import { getSlate } from "./slate";

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

const COLUMNS: { header: string; value: (r: LegExportRow) => string | number | null }[] = [
  { header: "leg_id", value: r => r.legId },
  { header: "parlay_id", value: r => r.parlayId },
  { header: "league", value: r => r.league },
  { header: "season", value: r => r.season },
  { header: "week", value: r => r.week },
  { header: "parlay_status", value: r => r.parlayStatus },
  { header: "bet_owner", value: r => r.betOwner },
  { header: "bet_type", value: r => r.betType },
  { header: "matchup", value: r => (r.awayTeam && r.homeTeam ? `${r.awayTeam} @ ${r.homeTeam}` : null) },
  { header: "player", value: r => r.playerName },
  { header: "prop_type", value: r => r.propType },
  { header: "pick", value: r => pickText(r) },
  { header: "line", value: r => r.line },
  { header: "odds", value: r => r.odds },
  { header: "odds_source", value: r => r.oddsSource },
  { header: "game_segment", value: r => r.gameSegment },
  { header: "result", value: r => r.result },
  { header: "result_detail", value: r => r.resultDetail },
  { header: "game_date_et", value: r => eastern(r.kickoff, { year: "numeric", month: "2-digit", day: "2-digit" }) },
  { header: "kickoff_et", value: r => eastern(r.kickoff, { hour: "numeric", minute: "2-digit" }) },
  { header: "slate", value: r => (r.kickoff ? getSlate(r.kickoff) : null) },
  { header: "decided_at_utc", value: r => (r.decidedAt ? new Date(r.decidedAt).toISOString() : null) },
  { header: "notes", value: r => r.notes },
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

/** Bet-history export: one row per parlay leg, newest week first. */
export function legsToCsv(rows: LegExportRow[]): string {
  const sorted = [...rows].sort((a, b) =>
    (b.season - a.season) || (b.week - a.week) || (a.parlayId - b.parlayId) || (a.legId - b.legId));
  const lines = [COLUMNS.map(c => c.header), ...sorted.map(r => COLUMNS.map(c => escapeCell(c.value(r))))];
  // The BOM makes Excel read the file as UTF-8 (player names with accents).
  return "﻿" + lines.map(l => l.join(",")).join("\r\n") + "\r\n";
}
