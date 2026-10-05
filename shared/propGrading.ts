/**
 * Grades a numeric over/under player prop. A prop line reads as "this many
 * or more": landing exactly on the line wins the over and loses the under,
 * so a player prop never pushes. Game totals and spreads still push on the
 * number (server/services/enrichment.ts).
 */
export function gradePropOverUnder(actual: number, line: number, pick: string): "win" | "loss" | null {
  if (pick === "over") return actual >= line ? "win" : "loss";
  if (pick === "under") return actual < line ? "win" : "loss";
  return null;
}
