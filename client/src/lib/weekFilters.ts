import type { Week } from "@shared/schema";

/** Weeks at or before the current (isActive) week, oldest first isn't
 * assumed — caller sorts. If no week is currently active (e.g. between
 * seasons), returns every week unfiltered rather than guessing a cutoff. */
export function upToCurrentWeek(weeks: Week[]): Week[] {
  const active = weeks.find(w => w.isActive);
  if (!active) return weeks;
  return weeks.filter(w => w.season < active.season || (w.season === active.season && w.weekNumber <= active.weekNumber));
}
