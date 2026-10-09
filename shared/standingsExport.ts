/**
 * League standings as a file (web) or a text message (mobile). The file takes
 * the rows in the order the grid shows them; the text is always ranked by
 * win rate.
 */

export type StandingsExportRow = {
  username: string;
  wins: number;
  losses: number;
  pushes?: number | null;
  winRate: number;
  powerScore?: number | null;
  participationRate?: number | null;
  bar?: number | null;
};

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function standingsCsv(rows: StandingsExportRow[]): string {
  const header = ["rank", "member", "wins", "losses", "pushes", "win_rate_pct", "participation_pct", "power_score", "bar"];
  const lines = rows.map((r, i) => [
    i + 1,
    r.username,
    r.wins,
    r.losses,
    r.pushes ?? 0,
    r.winRate.toFixed(1),
    ((r.participationRate ?? 0) * 100).toFixed(0),
    (r.powerScore ?? 0).toFixed(2),
    (r.bar ?? 0).toFixed(2),
  ]);
  return [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n");
}

/**
 * Plain text for the group chat, always ranked by win rate (more wins breaks
 * a tie), whatever order the rows arrive in:
 *
 *   🏆 The Boys · Current Year
 *   1. Marty: 12-4 (75%)
 */
export function standingsText(input: {
  leagueName: string;
  scopeLabel: string;
  rows: StandingsExportRow[];
}): string {
  const ranked = [...input.rows].sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || a.username.localeCompare(b.username));
  return [
    `🏆 ${input.leagueName} · ${input.scopeLabel}`,
    ...ranked.map((r, i) => `${i + 1}. ${r.username}: ${r.wins}-${r.losses} (${Math.round(r.winRate)}%)`),
  ].join("\n");
}
