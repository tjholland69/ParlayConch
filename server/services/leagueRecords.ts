import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import { leagueMembers, parlays, parlayLegs, games, weeks, leagues } from "@shared/schema";
import { parseAmericanOdds } from "@shared/powerScore";

/** Mirrors LOSER_LABEL_TEXT in client/src/components/ParlayRollupCard.tsx —
 * kept in sync by hand since one is server-only and the other client-only. */
const LOSER_LABEL_TEXT: Record<string, string> = {
  parlay_loser: "Parlay Loser",
  asshole: "Asshole",
  jerry: "Jerry",
  dud: "Dud",
  doofus: "Doofus",
};

export type LeagueRecordEntry = {
  key: string;
  /** Accolade description, e.g. "Highest Single-Leg Odds" — always present. */
  label: string;
  /** Flavor title shown above the description, e.g. "Biggest Swing". Tiles
   * without a fun name yet (highestParlayOdds, favoriteBetType) omit this and
   * just render `label` on its own. */
  title?: string | null;
  /** Formatted value to display, e.g. "+650" or "Chiefs (14 picks)". */
  value: string;
  /** Member who holds this record — resolved to a display name client-side
   * (the client already has member data loaded); null for a league-wide
   * aggregate that isn't attributed to one member (favorite team/player/bet type). */
  holderUserId: string | null;
  /** Smaller/secondary text shown alongside `value` (e.g. gross pick count
   * behind a percentage). Purely cosmetic — not needed for computation. */
  detail?: string | null;
  /** The league's overall record (all members combined) betting this team/player. */
  winLoss?: { wins: number; losses: number } | null;
  /** NFL week context for a record tied to one specific bet. */
  week?: { season: number; weekNumber: number; label: string } | null;
  /** Start/end of a streak, as ISO timestamps. */
  dateRange?: { start: string; end: string } | null;
  /** Deep-link target for a record tied to one specific bet. */
  link?: { leagueId: number; parlayId: number } | null;
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

  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  const loserLabelText = LOSER_LABEL_TEXT[league?.loserLabel ?? "parlay_loser"] ?? LOSER_LABEL_TEXT.parlay_loser;

  const rows = await db
    .select({
      leg: parlayLegs,
      parlayId: parlays.id,
      parlayUserId: parlays.userId,
      parlayStatus: parlays.status,
      parlayWeekId: parlays.weekId,
      homeTeam: games.homeTeam,
      awayTeam: games.awayTeam,
      gameFinishedAt: games.finishedAt,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(and(eq(parlays.leagueId, leagueId), inArray(parlayLegs.userId, memberIds)));

  if (rows.length === 0) return [];

  type Row = (typeof rows)[number];

  const legTime = (r: Row): number => {
    if (r.leg.decidedAt) return new Date(r.leg.decidedAt).getTime();
    if (r.gameFinishedAt) return new Date(r.gameFinishedAt).getTime();
    return 0;
  };

  // Every week referenced by any row, fetched once and reused by whichever
  // records end up needing "NFL week X, <season>" context.
  const weekIds = [...new Set(rows.map(r => r.parlayWeekId))];
  const allWeeks = weekIds.length ? await db.select().from(weeks).where(inArray(weeks.id, weekIds)) : [];
  const weekById = new Map(allWeeks.map(w => [w.id, w]));
  const weekContext = (weekId: number) => {
    const w = weekById.get(weekId);
    return w ? { season: w.season, weekNumber: w.weekNumber, label: w.label } : null;
  };

  const records: LeagueRecordEntry[] = [];

  // ── Highest single-leg odds (biggest underdog single bet), and — tracked in
  // the same pass — the highest single-leg odds among legs that actually WON. ──
  let bestLeg: { decimal: number; american: number; userId: string; weekId: number; parlayId: number } | null = null;
  let bestWinningLeg: { decimal: number; american: number; userId: string; weekId: number; parlayId: number; decidedAt: number } | null = null;
  for (const r of rows) {
    const american = parseAmericanOdds(r.leg.odds);
    if (american == null) continue;
    const decimal = americanToDecimal(american);
    if (!bestLeg || decimal > bestLeg.decimal) {
      bestLeg = { decimal, american, userId: r.leg.userId, weekId: r.parlayWeekId, parlayId: r.parlayId };
    }
    if (r.leg.result === "win" && (!bestWinningLeg || decimal > bestWinningLeg.decimal)) {
      bestWinningLeg = { decimal, american, userId: r.leg.userId, weekId: r.parlayWeekId, parlayId: r.parlayId, decidedAt: legTime(r) };
    }
  }
  if (bestLeg) {
    records.push({
      key: "highestSingleLegOdds",
      title: "Biggest Swing",
      label: "Highest Single-Leg Odds",
      value: bestLeg.american > 0 ? `+${bestLeg.american}` : String(bestLeg.american),
      holderUserId: bestLeg.userId,
      week: weekContext(bestLeg.weekId),
      link: { leagueId, parlayId: bestLeg.parlayId },
    });
  }
  // Placed second on the grid, right after the tile it's a variant of.
  if (bestWinningLeg) {
    records.push({
      key: "highestSingleLegOddsWon",
      title: "Biggest Hit",
      label: "Highest Single-Leg Odds (Won)",
      value: bestWinningLeg.american > 0 ? `+${bestWinningLeg.american}` : String(bestWinningLeg.american),
      holderUserId: bestWinningLeg.userId,
      week: weekContext(bestWinningLeg.weekId),
      dateRange: bestWinningLeg.decidedAt ? { start: new Date(bestWinningLeg.decidedAt).toISOString(), end: new Date(bestWinningLeg.decidedAt).toISOString() } : null,
      link: { leagueId, parlayId: bestWinningLeg.parlayId },
    });
  }

  // ── Highest total parlay odds (combined across every leg in a parlay) ──
  const legsByParlay = new Map<number, Row[]>();
  for (const r of rows) {
    const arr = legsByParlay.get(r.parlayId);
    if (arr) arr.push(r); else legsByParlay.set(r.parlayId, [r]);
  }
  let bestParlay: { decimal: number; userId: string | null; weekId: number; parlayId: number } | null = null;
  for (const [parlayId, legs] of legsByParlay) {
    let combined = 1;
    let any = false;
    for (const r of legs) {
      const american = parseAmericanOdds(r.leg.odds);
      if (american == null) continue;
      combined *= americanToDecimal(american);
      any = true;
    }
    if (!any) continue;
    if (!bestParlay || combined > bestParlay.decimal) {
      bestParlay = { decimal: combined, userId: legs[0].parlayUserId, weekId: legs[0].parlayWeekId, parlayId };
    }
  }
  if (bestParlay) {
    records.push({
      key: "highestParlayOdds",
      label: "Highest Total Parlay Odds",
      value: `${bestParlay.decimal.toFixed(1)}x (${decimalToAmericanLabel(bestParlay.decimal)})`,
      holderUserId: bestParlay.userId,
      week: weekContext(bestParlay.weekId),
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
    const decidedTime = (r: Row) => {
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
      title: `King ${loserLabelText}`,
      label: "Most Times Breaking the Parlay",
      value: `${topLoser.count} time${topLoser.count !== 1 ? "s" : ""}`,
      holderUserId: topLoser.key,
    });
  }

  // ── The Juiceman: highest average odds among a member's WON legs. Unlike
  // highestSingleLegOddsWon (their single best win), this rewards someone who
  // consistently cashes plus-money underdogs rather than one lucky hit. ──
  const juiceSums = new Map<string, { totalDecimal: number; count: number }>();
  for (const r of rows) {
    if (r.leg.result !== "win") continue;
    const american = parseAmericanOdds(r.leg.odds);
    if (american == null) continue;
    const cur = juiceSums.get(r.leg.userId) ?? { totalDecimal: 0, count: 0 };
    cur.totalDecimal += americanToDecimal(american);
    cur.count += 1;
    juiceSums.set(r.leg.userId, cur);
  }
  let juiceman: { userId: string; avgDecimal: number; count: number } | null = null;
  for (const [userId, sum] of juiceSums) {
    const avgDecimal = sum.totalDecimal / sum.count;
    if (!juiceman || avgDecimal > juiceman.avgDecimal) {
      juiceman = { userId, avgDecimal, count: sum.count };
    }
  }
  if (juiceman) {
    records.push({
      key: "juiceman",
      title: "The Juiceman",
      label: "Highest Average Bet Odds",
      value: decimalToAmericanLabel(juiceman.avgDecimal),
      detail: `avg over ${juiceman.count} win${juiceman.count !== 1 ? "s" : ""}`,
      holderUserId: juiceman.userId,
    });
  }

  // ── Longest win / loss streak per user, at the leg level ───────────────
  const legsByUser = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.leg.result !== "win" && r.leg.result !== "loss") continue;
    const arr = legsByUser.get(r.leg.userId);
    if (arr) arr.push(r); else legsByUser.set(r.leg.userId, [r]);
  }
  let bestWinStreak: { count: number; userId: string; start: number; end: number } | null = null;
  let bestLossStreak: { count: number; userId: string; start: number; end: number } | null = null;
  for (const [userId, legs] of legsByUser) {
    const ordered = [...legs].sort((a, b) => legTime(a) - legTime(b) || a.leg.id - b.leg.id);
    let curResult: "win" | "loss" | null = null;
    let curLen = 0;
    let curStart = 0;
    let maxWin = 0;
    let maxLoss = 0;
    let maxWinStart = 0;
    let maxWinEnd = 0;
    let maxLossStart = 0;
    let maxLossEnd = 0;
    for (const r of ordered) {
      const result = r.leg.result as "win" | "loss";
      const t = legTime(r);
      if (result === curResult) curLen++;
      else { curResult = result; curLen = 1; curStart = t; }
      if (curResult === "win") {
        if (curLen > maxWin) { maxWin = curLen; maxWinStart = curStart; maxWinEnd = t; }
      } else {
        if (curLen > maxLoss) { maxLoss = curLen; maxLossStart = curStart; maxLossEnd = t; }
      }
    }
    if (maxWin > 0 && (!bestWinStreak || maxWin > bestWinStreak.count)) {
      bestWinStreak = { count: maxWin, userId, start: maxWinStart, end: maxWinEnd };
    }
    if (maxLoss > 0 && (!bestLossStreak || maxLoss > bestLossStreak.count)) {
      bestLossStreak = { count: maxLoss, userId, start: maxLossStart, end: maxLossEnd };
    }
  }
  if (bestWinStreak) {
    records.push({
      key: "longestWinStreak",
      title: "The Whale",
      label: "Longest Win Streak",
      value: `${bestWinStreak.count} leg${bestWinStreak.count !== 1 ? "s" : ""}`,
      holderUserId: bestWinStreak.userId,
      dateRange: bestWinStreak.start && bestWinStreak.end
        ? { start: new Date(bestWinStreak.start).toISOString(), end: new Date(bestWinStreak.end).toISOString() }
        : null,
    });
  }
  if (bestLossStreak) {
    records.push({
      key: "longestLossStreak",
      title: "Celibacy Rocks!",
      label: "Longest Losing Streak",
      value: `${bestLossStreak.count} leg${bestLossStreak.count !== 1 ? "s" : ""}`,
      holderUserId: bestLossStreak.userId,
      dateRange: bestLossStreak.start && bestLossStreak.end
        ? { start: new Date(bestLossStreak.start).toISOString(), end: new Date(bestLossStreak.end).toISOString() }
        : null,
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
    let teamWins = 0, teamLosses = 0;
    for (const r of rows) {
      if ((r.leg.betType === "spread" || r.leg.betType === "moneyline") && r.homeTeam && r.awayTeam) {
        const team = r.leg.pick === "home" ? r.homeTeam : r.leg.pick === "away" ? r.awayTeam : null;
        if (team !== topTeam.key) continue;
        if (r.leg.result === "win") teamWins++;
        else if (r.leg.result === "loss") teamLosses++;
      }
    }
    records.push({
      key: "favoriteTeam",
      title: "Only Stans",
      label: "League Favorite Team",
      value: `${topTeam.key} (${topTeam.count} pick${topTeam.count !== 1 ? "s" : ""})`,
      holderUserId: null,
      winLoss: teamWins + teamLosses > 0 ? { wins: teamWins, losses: teamLosses } : null,
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
    let playerWins = 0, playerLosses = 0;
    for (const r of rows) {
      if (r.leg.betType === "player_prop" && r.leg.playerName === topPlayer.key) {
        if (r.leg.result === "win") playerWins++;
        else if (r.leg.result === "loss") playerLosses++;
      }
    }
    records.push({
      key: "favoritePlayer",
      title: "Play the Hits",
      label: "",
      value: `${topPlayer.key} (${topPlayer.count} pick${topPlayer.count !== 1 ? "s" : ""})`,
      holderUserId: null,
      winLoss: playerWins + playerLosses > 0 ? { wins: playerWins, losses: playerLosses } : null,
    });
  }

  // ── Favorite bet type, across every member ──────────────────────────────
  const betTypeCounts: Record<string, number> = {};
  for (const r of rows) {
    betTypeCounts[r.leg.betType] = (betTypeCounts[r.leg.betType] ?? 0) + 1;
  }
  const topBetType = topEntry(betTypeCounts);
  if (topBetType) {
    const pct = (topBetType.count / rows.length) * 100;
    records.push({
      key: "favoriteBetType",
      label: "League Favorite Bet Type",
      value: `${BET_TYPE_LABELS[topBetType.key] ?? topBetType.key} (${pct.toFixed(1)}%)`,
      holderUserId: null,
      detail: `${topBetType.count} pick${topBetType.count !== 1 ? "s" : ""}`,
    });
  }

  return records;
}
