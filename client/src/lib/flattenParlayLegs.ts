import type { ParlayWithLegs } from "@shared/schema";
import { getDisplayName, shortId } from "@/lib/displayName";
import { legLabel } from "@/lib/legLabel";
import { formatPickLabel } from "@/lib/formatPick";
import { getSlate } from "@shared/slate";

export type FlatParlayLegRow = {
  parlayId: number;
  legId: number;
  season: number;
  weekLabel: string;
  member: string;
  legOwner: string;
  status: string;
  betType: string;
  matchup: string;
  pick: string;
  line: string;
  odds: string;
  oddsSource: string;
  result: string;
  gameTime: string | null;
  slate: string | null;
  /** When this leg's outcome was actually decided — see parlayLegs.decidedAt. More
   * precise than gameTime for "when did this settle" sorting/display. */
  decidedAt: string | null;
};

/** Unrolls parlays into one row per parlay_leg, carrying parent parlay fields onto each row. */
export function flattenParlayLegs(parlays: ParlayWithLegs[]): FlatParlayLegRow[] {
  const rows: FlatParlayLegRow[] = [];
  for (const parlay of parlays) {
    const member = getDisplayName(parlay.user, `User #${shortId(parlay.userId)}`);
    for (const leg of parlay.legs) {
      rows.push({
        parlayId: parlay.id,
        legId: leg.id,
        season: parlay.week?.season ?? 0,
        weekLabel: parlay.week?.label ?? "—",
        member,
        legOwner: leg.user ? getDisplayName(leg.user, `User #${shortId(leg.userId)}`) : "Unknown",
        status: parlay.status ?? "pending",
        betType: leg.betType === "player_prop" ? "Prop" : (leg.betType ?? "").toUpperCase() || "—",
        matchup: legLabel(leg),
        pick: formatPickLabel(leg),
        line: leg.line || "—",
        odds: leg.odds || "—",
        oddsSource: leg.oddsSource || "—",
        result: leg.result ? leg.result.charAt(0).toUpperCase() + leg.result.slice(1) : "—",
        gameTime: leg.game?.gameTime ? String(leg.game.gameTime) : null,
        slate: leg.game?.gameTime ? getSlate(new Date(leg.game.gameTime)) : null,
        decidedAt: leg.decidedAt ? String(leg.decidedAt) : null,
      });
    }
  }
  return rows;
}