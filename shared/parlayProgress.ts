/**
 * Where a parlay stands once games start. Shared by the server (which
 * enforces the rules) and both clients (which label them).
 */

type GameLike = { gameTime?: Date | string | null; isFinished?: boolean | null };

/** A game is live or over: it's marked final, or its kickoff has passed. */
export function hasGameStarted(game: GameLike | null | undefined, now: Date = new Date()): boolean {
  if (!game) return false;
  if (game.isFinished) return true;
  return game.gameTime ? new Date(game.gameTime) <= now : false;
}

const OPEN_STATUSES = new Set(["pending", "approved", "sent", "placed"]);

/** An open parlay with at least one game underway: picks can no longer change. */
export function isParlayInProgress(
  parlay: { status?: string | null; legs?: { game?: GameLike | null }[] | null },
  now: Date = new Date(),
): boolean {
  if (!OPEN_STATUSES.has(parlay.status ?? "")) return false;
  return (parlay.legs ?? []).some((leg) => hasGameStarted(leg.game, now));
}

/** "2/3 (67%)" plus "(2 Pending)" while legs are still to settle. */
export function legTally(legs: { result?: string | null }[]): {
  wins: number;
  resolved: number;
  pending: number;
  pct: number | null;
  label: string;
} {
  const wins = legs.filter((l) => l.result === "win").length;
  const resolved = legs.filter((l) => l.result === "win" || l.result === "loss" || l.result === "push").length;
  const pending = legs.length - resolved;
  const pct = resolved > 0 ? Math.round((wins / resolved) * 100) : null;
  const label = [
    `${wins}/${resolved}`,
    pct !== null ? `(${pct}%)` : null,
    pending > 0 ? `(${pending} Pending)` : null,
  ].filter(Boolean).join(" ");
  return { wins, resolved, pending, pct, label };
}
