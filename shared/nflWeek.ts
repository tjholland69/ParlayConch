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
