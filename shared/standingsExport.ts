/**
 * League standings as a file (web) or a text message (mobile). Both take the
 * rows already in the order the grid shows them, so an export always matches
 * whatever the member sorted by.
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
 * Plain text for the group chat:
 *
 *   🏆 The Boys · Current Year
 *   Sorted by Win %
 *   1. Marty: 12-4 (75%) · Pwr 1.42 · Part 100%
 */
export function standingsText(input: {
  leagueName: string;
  scopeLabel: string;
  /** The column the grid is sorted by, when it isn't the default order. */
  sortLabel?: string | null;
  rows: StandingsExportRow[];
}): string {
  return [
    `🏆 ${input.leagueName} · ${input.scopeLabel}`,
    ...(input.sortLabel ? [`Sorted by ${input.sortLabel}`] : []),
    ...input.rows.map((r, i) =>
      `${i + 1}. ${r.username}: ${r.wins}-${r.losses} (${Math.round(r.winRate)}%)` +
      ` · Pwr ${(r.powerScore ?? 0).toFixed(2)}` +
      ` · Part ${Math.round((r.participationRate ?? 0) * 100)}%`,
    ),
  ].join("\n");
}
