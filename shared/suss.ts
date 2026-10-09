/**
 * "The Suss Meter": how suss the league finds a pick in an open parlay.
 * Members down-vote picks they don't like, anonymously, and never their own.
 * Shared by the server (which counts) and both clients (which draw the meter).
 */

/** Down votes on one pick. `voters` is everyone who could vote on it (every
 * member but its owner); `mine` is whether the viewer down-voted it. */
export type SussTally = { votes: number; voters: number; mine: boolean };

/**
 * How full the meter is:
 *   0  half the league or fewer: no meter at all
 *   1  more than half, up to 75%: the first third, in red
 *   2  more than 75%: two thirds, heating up
 *   3  everyone but the pick's owner: bursting full, and the owner is
 *      nudged to rethink it
 */
export type SussLevel = 0 | 1 | 2 | 3;

export function sussLevel(tally: Pick<SussTally, "votes" | "voters"> | null | undefined): SussLevel {
  if (!tally || tally.voters <= 0 || tally.votes <= 0) return 0;
  if (tally.votes >= tally.voters) return 3;
  const share = tally.votes / tally.voters;
  if (share <= 0.5) return 0;
  return share <= 0.75 ? 1 : 2;
}

export function sussPct(tally: Pick<SussTally, "votes" | "voters"> | null | undefined): number {
  return tally && tally.voters > 0 ? Math.round((Math.min(tally.votes, tally.voters) / tally.voters) * 100) : 0;
}

/** What the meter says for someone reading it aloud. */
export function sussLabel(tally: Pick<SussTally, "votes" | "voters"> | null | undefined): string {
  const level = sussLevel(tally);
  if (level === 0) return "";
  return level === 3 ? "Suss Meter is full: the whole league doubts this pick" : `Suss Meter: ${sussPct(tally)}% of the league doubts this pick`;
}

export const SUSS_FULL_PROMPT = "The Suss Meter is bursting. Everyone else in the league doubts this pick. Want to change it?";
