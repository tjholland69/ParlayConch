/**
 * Approximate the NFL calendar window for a season/week. Not exact schedule
 * data — anchored on Week 1 opening the Thursday after Labor Day (the first
 * Monday in September), with each later week 7 days on.
 *
 * `start` is the Monday before that week's Thursday opener. `end` is the
 * Wednesday (00:00 UTC) after its Monday night game, which covers the whole
 * Thursday → Monday slate (including a Friday/Saturday international game)
 * but stops a day short of the next week's Thursday opener. The window used
 * to run 13 days, which let next week's games get filed under this one.
 */
export function estimateWeekDateRange(season: number, weekNumber: number): { start: Date; end: Date } {
  const laborDay = new Date(Date.UTC(season, 8, 1)); // Sept 1, UTC
  while (laborDay.getUTCDay() !== 1) laborDay.setUTCDate(laborDay.getUTCDate() + 1);
  const week1Thursday = new Date(laborDay);
  week1Thursday.setUTCDate(laborDay.getUTCDate() + 3); // Monday -> Thursday

  const start = new Date(week1Thursday);
  start.setUTCDate(week1Thursday.getUTCDate() + (weekNumber - 1) * 7 - 3); // Monday before kickoff
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 9); // Wednesday after Monday night

  return { start, end };
}

/** "Week 4 2026": the week and its season, without the year a week's label may already carry. */
export function weekYearLabel(week: { label: string; season: number; weekNumber?: number | null }): string {
  // The week's own name, so a playoff round stays "Wild Card"; the week
  // number only stands in when the label is nothing but a year.
  const stripped = week.label.replace(/\b(19|20)\d{2}\b/g, "").replace(/\s+/g, " ").trim();
  const name = stripped || (week.weekNumber != null ? `Week ${week.weekNumber}` : "Week");
  return `${name} ${week.season}`;
}

/**
 * The second line of a leg row: "Week 4 2026 - Patriots @ Bills - 1:05pm EDT".
 * `kickoff` is the time already formatted (kickoffTimeLabel).
 */
export function legContextLine(
  week: { label: string; season: number; weekNumber?: number | null } | null | undefined,
  game: { awayTeam?: string | null; homeTeam?: string | null } | null | undefined,
  kickoff: string | null,
): string {
  return [
    week ? weekYearLabel(week) : null,
    game?.awayTeam && game?.homeTeam ? `${game.awayTeam} @ ${game.homeTeam}` : null,
    kickoff,
  ].filter(Boolean).join(" - ");
}
