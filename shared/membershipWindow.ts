/**
 * When a member was in a league, and when a week or a parlay "happened".
 * A member only owes a pick (and only shows as Void) for parlays that fell
 * inside their membership window, so both halves have to be real dates:
 * a parlay entered long after the fact (an import, a historical entry)
 * happened when its games kicked off, not when its row was typed in.
 */

type DateLike = Date | string | number | null | undefined;
const ms = (d: DateLike): number | null => {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Was this member in the league at `at`? No date to check against: yes. */
export function wasMemberAt(member: { startDate?: DateLike; endDate?: DateLike }, at: DateLike): boolean {
  const t = ms(at);
  if (t == null) return true;
  const start = ms(member.startDate);
  const end = ms(member.endDate);
  return (start == null || start <= t) && (end == null || t <= end);
}

/**
 * When something happened: the earliest kickoff among its games, else the
 * time it was entered. Null with neither.
 */
export function happenedAt(kickoffs: DateLike[], enteredAt: DateLike): number | null {
  const times = kickoffs.map(ms).filter((t): t is number => t != null);
  return times.length > 0 ? Math.min(...times) : ms(enteredAt);
}

/** When a parlay happened: its earliest leg's kickoff, else when it was entered. */
export function parlayHappenedAt(parlay: { createdAt?: DateLike }, legs: { game?: { gameTime?: DateLike } | null }[]): number | null {
  return happenedAt(legs.map((l) => l.game?.gameTime), parlay.createdAt);
}
