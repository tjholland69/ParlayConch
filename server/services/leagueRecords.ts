import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import { leagueMembers, parlays, parlayLegs, games } from "@shared/schema";
import { parseAmericanOdds } from "@shared/powerScore";

export type LeagueRecordEntry = {
  key: string;
  label: string;
  /** Formatted value to display, e.g. "+650" or "Chiefs (14 picks)". */
  value: string;
  /** Member who holds this record — resolved to a display name client-side
   * (the client already has member data loaded); null for a league-wide
   * aggregate that isn't attributed to one member (favorite team/player/bet type). */
  holderUserId: string | null;
};

const BET_TYPE_LABELS: Record<string, string> = {
  spread: "Spread",
  moneyline: "Moneyline",
  over: "Over",
  under: "Under",
  player_prop: "Player Prop",
};

/** American odds → decimal multiplier, for comparing/combining bets of any sign. */
function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

/** Decimal multiplier → American odds string, for display. */
function decimalToAmericanLabel(decimal: number): string {
  if (decimal >= 2) {
    const american = Math.round((decimal - 1) * 100);
    return `+${american}`;
  }
  const american = Math.round(-100 / (decimal - 1));
  return String(american);
}

function topEntry<T extends string>(counts: Record<T, number>): { key: T; count: number } | null {
  let best: { key: T; count: number } | null = null;
  for (const key in counts) {
    const count = counts[key];
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

/**
 * League-wide "best of" records — highest odds, most parlay losses, longest
 * streaks, and favorite team/player/bet type across every member. Structured
 * as an extensible list (rather than a fixed object shape) so new records can
 * be appended later without changing the response shape.
 */
export async function getLeagueRecords(leagueId: number): Promise<LeagueRecordEntry[]> {
  const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
  const memberIds = members.map(m => m.userId);
  if (memberIds.length === 0) return [];

  const rows = await db
    .select({
      leg: parlayLegs,
      parlayId: parlays.id,
      parlayUserId: parlays.userId,
      parlayStatus: parlays.status,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      gameFinishedAt: games.finishedAt,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(and(eq(parlays.leagueId, leagueId), inArray(parlayLegs.userId, memberIds)));

  if (rows.length === 0) return [];

  const records: LeagueRecordEntry[] = [];

  // ── Highest single-leg odds (biggest underdog single bet) ──────────────
  let bestLeg: { decimal: number; american: number; userId: string } | null = null;
  for (const r of rows) {
    const american = parseAmericanOdds(r.leg.odds);
    if (american == null) continue;
    const decimal = americanToDecimal(american);
    if (!bestLeg || decimal > bestLeg.decimal) bestLeg = { decimal, american, userId: r.leg.userId };
  }
  if (bestLeg) {
    records.push({
      key: "highestSingleLegOdds",
      label: "Highest Single-Leg Odds",
      value: bestLeg.american > 0 ? `+${bestLeg.american}` : String(bestLeg.american),
      holderUserId: bestLeg.userId,
    });
  }

  // ── Highest total parlay odds (combined across every leg in a parlay) ──
  const legsByParlay = new Map<number, typeof rows>();
  for (const r of rows) {
    const arr = legsByParlay.get(r.parlayId);
    if (arr) arr.push(r); else legsByParlay.set(r.parlayId, [r]);
  }
  let bestParlay: { decimal: number; userId: string | null } | null = null;
  for (const [, legs] of legsByParlay) {
    let combined = 1;
    let any = false;
    for (const r of legs) {
      const american = parseAmericanOdds(r.leg.odds);
      if (american == null) continue;
      combined *= americanToDecimal(american);
      any = true;
    }
    if (!any) continue;
    if (!bestParlay || combined > bestParlay.decimal) bestParlay = { decimal: combined, userId: legs[0].parlayUserId };
  }
  if (bestParlay) {
    records.push({
      key: "highestParlayOdds",
      label: "Highest Total Parlay Odds",
      value: `${bestParlay.decimal.toFixed(1)}x (${decimalToAmericanLabel(bestParlay.decimal)})`,
      holderUserId: bestParlay.userId,
    });
  }

  // ── Most Parlay Losses ("who busts the most") ───────────────────────────
  // For each losing parlay, attribute the bust to whichever leg was decided
  // earliest among that parlay's losing legs — same rule as the per-tile
  // "Parlay Loser" badge (client/src/lib/parlayLoser.ts), just aggregated.
  const loserCounts = new Map<string, number>();
  for (const [, legs] of legsByParlay) {
    if (legs[0].parlayStatus !== "loss") continue;
    const busted = legs.filter(r => r.leg.result === "loss");
    if (busted.length === 0) continue;
    const decidedTime = (r: (typeof rows)[number]) => {
      if (r.leg.decidedAt) return new Date(r.leg.decidedAt).getTime();
      if (r.gameFinishedAt) return new Date(r.gameFinishedAt).getTime();
      return Infinity;
    };
    const bustedLeg = [...busted].sort((a, b) => decidedTime(a) - decidedTime(b) || a.leg.id - b.leg.id)[0];
    loserCounts.set(bustedLeg.leg.userId, (loserCounts.get(bustedLeg.leg.userId) ?? 0) + 1);
  }
  const topLoser = topEntry(Object.fromEntries(loserCounts) as Record<string, number>);
  if (topLoser) {
    records.push({
      key: "mostParlayLosses",
      label: "Most Parlay Losses (Parlay Loser)",
      value: `${topLoser.count} time${topLoser.count !== 1 ? "s" : ""}`,
      holderUserId: topLoser.key,
    });
  }

  // ── Longest win / loss streak per user, at the leg level ───────────────
  const legsByUser = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.leg.result !== "win" && r.leg.result !== "loss") continue;
    const arr = legsByUser.get(r.leg.userId);
    if (arr) arr.push(r); else legsByUser.set(r.leg.userId, [r]);
  }
  let bestWinStreak: { count: number; userId: string } | null = null;
  let bestLossStreak: { count: number; userId: string } | null = null;
  for (const [userId, legs] of legsByUser) {
    const ordered = [...legs].sort((a, b) => {
      const at = a.leg.decidedAt ? new Date(a.leg.decidedAt).getTime() : (a.gameFinishedAt ? new Date(a.gameFinishedAt).getTime() : 0);
      const bt = b.leg.decidedAt ? new Date(b.leg.decidedAt).getTime() : (b.gameFinishedAt ? new Date(b.gameFinishedAt).getTime() : 0);
      return at - bt || a.leg.id - b.leg.id;
    });
    let curResult: "win" | "loss" | null = null;
    let curLen = 0;
    let maxWin = 0;
    let maxLoss = 0;
    for (const r of ordered) {
      const result = r.leg.result as "win" | "loss";
      if (result === curResult) curLen++;
      else { curResult = result; curLen = 1; }
      if (curResult === "win") maxWin = Math.max(maxWin, curLen);
      else maxLoss = Math.max(maxLoss, curLen);
    }
    if (maxWin > 0 && (!bestWinStreak || maxWin > bestWinStreak.count)) bestWinStreak = { count: maxWin, userId };
    if (maxLoss > 0 && (!bestLossStreak || maxLoss > bestLossStreak.count)) bestLossStreak = { count: maxLoss, userId };
  }
  if (bestWinStreak) {
    records.push({
      key: "longestWinStreak",
      label: "Longest Win Streak",
      value: `${bestWinStreak.count} leg${bestWinStreak.count !== 1 ? "s" : ""}`,
      holderUserId: bestWinStreak.userId,
    });
  }
  if (bestLossStreak) {
    records.push({
      key: "longestLossStreak",
      label: "Longest Loss Streak",
      value: `${bestLossStreak.count} leg${bestLossStreak.count !== 1 ? "s" : ""}`,
      holderUserId: bestLossStreak.userId,
    });
  }

  // ── Favorite team to bet, across every member ───────────────────────────
  const teamCounts: Record<string, number> = {};
  for (const r of rows) {
    if ((r.leg.betType === "spread" || r.leg.betType === "moneyline") && r.homeTeam && r.awayTeam) {
      const team = r.leg.pick === "home" ? r.homeTeam : r.leg.pick === "away" ? r.awayTeam : null;
      if (team) teamCounts[team] = (teamCounts[team] ?? 0) + 1;
    }
  }
  const topTeam = topEntry(teamCounts);
  if (topTeam) {
    records.push({
      key: "favoriteTeam",
      label: "League Favorite Team",
      value: `${topTeam.key} (${topTeam.count} pick${topTeam.count !== 1 ? "s" : ""})`,
      holderUserId: null,
    });
  }

  // ── Favorite player to bet props on, across every member ───────────────
  const playerCounts: Record<string, number> = {};
  for (const r of rows) {
    if (r.leg.betType === "player_prop" && r.leg.playerName) {
      playerCounts[r.leg.playerName] = (playerCounts[r.leg.playerName] ?? 0) + 1;
    }
  }
  const topPlayer = topEntry(playerCounts);
  if (topPlayer) {
    records.push({
      key: "favoritePlayer",
      label: "League Favorite Prop Player",
      value: `${topPlayer.key} (${topPlayer.count} pick${topPlayer.count !== 1 ? "s" : ""})`,
      holderUserId: null,
    });
  }

  // ── Favorite bet type, across every member ──────────────────────────────
  const betTypeCounts: Record<string, number> = {};
  for (const r of rows) {
    betTypeCounts[r.leg.betType] = (betTypeCounts[r.leg.betType] ?? 0) + 1;
  }
  const topBetType = topEntry(betTypeCounts);
  if (topBetType) {
    records.push({
      key: "favoriteBetType",
      label: "League Favorite Bet Type",
      value: `${BET_TYPE_LABELS[topBetType.key] ?? topBetType.key} (${topBetType.count} pick${topBetType.count !== 1 ? "s" : ""})`,
      holderUserId: null,
    });
  }

  return records;
}
