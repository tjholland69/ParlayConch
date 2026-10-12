/**
 * Suggested picks for a member in a week's parlay. Works them out from the
 * league's graded picks (shared/pickSuggestions.ts) and stores every one it
 * shows in pick_suggestions, so a suggestion the member passed on is still
 * on record next to the ones they took.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { games, parlayLegs, parlays, pickSuggestions, players } from "@shared/db-schema";
import { betMarket } from "@shared/multiBetValidation";
import { buildPickSuggestions, type PickSuggestion } from "@shared/pickSuggestions";
import { buildPickTrends, type PickTrend } from "@shared/pickTrends";

export type StoredPickSuggestion = PickSuggestion & { id: number };

export async function suggestPicks(userId: string, leagueId: number, weekId: number, parlayId?: number): Promise<StoredPickSuggestion[]> {
  const [weekGames, history, taken] = await Promise.all([
    db.select().from(games).where(eq(games.weekId, weekId)),
    // Full-game spread, moneyline and total picks that won or lost. Props
    // and part-game bets have no line on the slate to suggest against.
    db.select({
      userId: parlayLegs.userId,
      betType: parlayLegs.betType,
      pick: parlayLegs.pick,
      line: parlayLegs.line,
      odds: parlayLegs.odds,
      result: parlayLegs.result,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
    })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .where(and(
        eq(parlays.leagueId, leagueId),
        inArray(parlayLegs.betType, ["spread", "moneyline", "over", "under"]),
        inArray(parlayLegs.result, ["win", "loss"]),
        isNotNull(parlayLegs.gameId),
        isNull(parlayLegs.gameSegment),
      )),
    // Without a parlay there's nothing taken yet. Asking for the whole week
    // would also count picks in parlays already submitted.
    parlayId != null ? storage.getTakenPicksForWeek(leagueId, weekId, userId, parlayId) : Promise.resolve([]),
  ]);

  const takenMarkets = taken
    .map((t) => betMarket({ ...t, userId: "" })?.market)
    .filter((m): m is string => !!m);
  const suggestions = buildPickSuggestions({ userId, games: weekGames, history, takenMarkets });
  if (suggestions.length === 0) return [];

  const rows = await db.insert(pickSuggestions)
    .values(suggestions.map((s) => ({ ...s, leagueId, weekId, userId })))
    .onConflictDoUpdate({
      target: [pickSuggestions.leagueId, pickSuggestions.weekId, pickSuggestions.userId, pickSuggestions.gameId, pickSuggestions.betType, pickSuggestions.pick],
      set: {
        line: sql`excluded.line`,
        odds: sql`excluded.odds`,
        reason: sql`excluded.reason`,
        detail: sql`excluded.detail`,
        rank: sql`excluded.rank`,
        updatedAt: new Date(),
      },
    })
    .returning({ id: pickSuggestions.id, gameId: pickSuggestions.gameId, betType: pickSuggestions.betType, pick: pickSuggestions.pick });

  const idFor = (s: PickSuggestion) => rows.find((r) => r.gameId === s.gameId && r.betType === s.betType && r.pick === s.pick)!.id;
  return suggestions.map((s) => ({ ...s, id: idFor(s) }));
}

/**
 * The member's and the league's records by kind of bet, player props
 * included (shared/pickTrends.ts). A prop's position comes from the player
 * its leg is linked to (parlay_legs.player_id).
 */
export async function leaguePickTrends(userId: string, leagueId: number): Promise<{ you: PickTrend[]; league: PickTrend[] }> {
  const history = await db.select({
    userId: parlayLegs.userId,
    betType: parlayLegs.betType,
    pick: parlayLegs.pick,
    line: parlayLegs.line,
    odds: parlayLegs.odds,
    result: parlayLegs.result,
    playerName: parlayLegs.playerName,
    propType: parlayLegs.propType,
    homeTeam: games.homeTeam,
    awayTeam: games.awayTeam,
    position: players.position,
  })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .leftJoin(players, eq(parlayLegs.playerId, players.id))
    .where(and(eq(parlays.leagueId, leagueId), inArray(parlayLegs.result, ["win", "loss"]), isNull(parlayLegs.gameSegment)));
  return buildPickTrends({ userId, history });
}
