/**
 * When the active NFL week is over and the next one should take its place.
 * Pure rules, kept apart from the job that applies them
 * (server/jobs/week-rollover-queue.ts).
 */

/** How long after a week's last kickoff the week counts as over even if a
 * game was never marked finished: a postponed or cancelled game, or a score
 * that didn't sync, would otherwise hold the week open forever. A game runs
 * about 3.5 hours, so 6 puts a Monday-night week over by Tuesday morning ET. */
export const ROLLOVER_GRACE_HOURS = 6;

/** A new season's Week 1 opens this many days before its first kickoff. Its
 * schedule is published months earlier (May); until this window the app
 * stays on last season's final week. */
export const NEW_SEASON_LEAD_DAYS = 14;

type RolloverGame = { isFinished: boolean | null; gameTime: Date | string | null };

export type WeekOverDecision = {
  over: boolean;
  reason: string;
  /** Games not marked finished when the week was called over on the clock. */
  unfinished: number;
};

export function isWeekOver(games: RolloverGame[], now: Date): WeekOverDecision {
  if (games.length === 0) return { over: false, reason: "Active week has no games yet", unfinished: 0 };
  const unfinished = games.filter((g) => !g.isFinished).length;
  if (unfinished === 0) return { over: true, reason: "Every game is finished", unfinished: 0 };

  const kickoffs = games.filter((g) => g.gameTime).map((g) => new Date(g.gameTime!).getTime());
  if (kickoffs.length === 0) {
    return { over: false, reason: "Active week's games aren't finished and none has a kickoff time", unfinished };
  }
  const cutoff = Math.max(...kickoffs) + ROLLOVER_GRACE_HOURS * 3600_000;
  if (now.getTime() >= cutoff) {
    return { over: true, reason: `${ROLLOVER_GRACE_HOURS}h past the week's last kickoff`, unfinished };
  }
  return { over: false, reason: "Active week's games aren't all finished yet", unfinished };
}

/** Whether a new season's Week 1 should open yet, given its first kickoff. */
export function isNewSeasonOpen(firstKickoff: Date, now: Date): boolean {
  return now.getTime() >= firstKickoff.getTime() - NEW_SEASON_LEAD_DAYS * 86_400_000;
}
