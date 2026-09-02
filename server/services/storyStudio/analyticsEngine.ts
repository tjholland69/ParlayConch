import { db } from "../../db";
import { parlayLegs, parlays, weeks, games, leagues, leagueMembers, users } from "@shared/db-schema";
import { eq, and } from "drizzle-orm";
import type { AnalyticsReport, WeeklyMemberStanding } from "@shared/schema";

// Deterministic weekly analytics for one league+week. No AI, no prose —
// every number here must be traceable back to a raw query. Story Studio's
// generation layer is only ever allowed to read from an AnalyticsReport,
// never compute stats itself.

type LegRow = {
  userId: string;
  result: string | null;
  betType: string;
  pick: string;
  spread: string | null;
  moneylineHome: string | null;
  moneylineAway: string | null;
};

function parseNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** True if the picked side was the betting favorite; null if not determinable (e.g. totals, props). */
function isFavoritePick(leg: LegRow): boolean | null {
  if (leg.betType === "spread") {
    const homeSpread = parseNum(leg.spread);
    if (homeSpread == null) return null;
    const homeIsFavorite = homeSpread < 0;
    return leg.pick === "home" ? homeIsFavorite : !homeIsFavorite;
  }
  if (leg.betType === "moneyline") {
    const home = parseNum(leg.moneylineHome);
    const away = parseNum(leg.moneylineAway);
    if (home == null || away == null) return null;
    const homeIsFavorite = home < away;
    return leg.pick === "home" ? homeIsFavorite : !homeIsFavorite;
  }
  return null;
}

async function fetchLegsForWeek(leagueId: number, weekId: number): Promise<LegRow[]> {
  const rows = await db
    .select({
      userId: parlayLegs.userId,
      result: parlayLegs.result,
      betType: parlayLegs.betType,
      pick: parlayLegs.pick,
      spread: games.spread,
      moneylineHome: games.moneylineHome,
      moneylineAway: games.moneylineAway,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));
  return rows;
}

function computeFavoriteRate(legs: LegRow[]): number | null {
  const decided = legs
    .map(isFavoritePick)
    .filter((v): v is boolean => v !== null);
  if (decided.length === 0) return null;
  return (decided.filter(Boolean).length / decided.length) * 100;
}

/** Ordered ascending (oldest first) weeks up to and including `weekId` that this league actually has parlay legs in. */
async function orderedLeagueWeeks(leagueId: number, weekId: number): Promise<{ weekId: number; season: number; weekNumber: number }[]> {
  const rows = await db
    .selectDistinct({ weekId: weeks.id, season: weeks.season, weekNumber: weeks.weekNumber })
    .from(parlays)
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(eq(parlays.leagueId, leagueId));

  const target = rows.find((r) => r.weekId === weekId);
  if (!target) {
    const [w] = await db.select().from(weeks).where(eq(weeks.id, weekId));
    if (!w) return [];
    return [{ weekId: w.id, season: w.season, weekNumber: w.weekNumber }];
  }

  return rows
    .filter((r) => r.season < target.season || (r.season === target.season && r.weekNumber <= target.weekNumber))
    .sort((a, b) => a.season - b.season || a.weekNumber - b.weekNumber);
}

/** Consecutive win/loss streak for a member, ending at (and including) `weekId`, based on majority result per week. */
function computeStreak(weeklyResults: { win: number; loss: number }[]): { kind: "win" | "loss"; length: number } | null {
  let streak: { kind: "win" | "loss"; length: number } | null = null;
  for (let i = weeklyResults.length - 1; i >= 0; i--) {
    const { win, loss } = weeklyResults[i];
    if (win === 0 && loss === 0) break; // no decided legs that week — streak breaks (not extends)
    const kind: "win" | "loss" = win >= loss ? "win" : "loss";
    if (!streak) {
      streak = { kind, length: 1 };
    } else if (streak.kind === kind) {
      streak.length++;
    } else {
      break;
    }
  }
  return streak;
}

export async function getWeeklyAnalyticsReport(leagueId: number, weekId: number): Promise<AnalyticsReport> {
  const [league] = await db.select().from(leagues).where(eq(leagues.id, leagueId));
  const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));
  if (!league || !week) throw new Error("League or week not found");

  const members = await db
    .select({ userId: leagueMembers.userId, firstName: users.firstName, email: users.email })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId));

  const weekLegs = await fetchLegsForWeek(leagueId, weekId);

  const decidedWeekLegs = weekLegs.filter((l) => l.result === "win" || l.result === "loss");
  const leagueWinRate = decidedWeekLegs.length > 0
    ? (decidedWeekLegs.filter((l) => l.result === "win").length / decidedWeekLegs.length) * 100
    : null;

  const favoritePickRate = computeFavoriteRate(weekLegs);
  const underdogPickRate = favoritePickRate == null ? null : 100 - favoritePickRate;

  // Trailing 4-week league average favorite rate (weeks strictly before the target week).
  const orderedWeeks = await orderedLeagueWeeks(leagueId, weekId);
  const priorWeekIds = orderedWeeks.filter((w) => w.weekId !== weekId).slice(-4).map((w) => w.weekId);
  let trailingFavoritePickRate: number | null = null;
  if (priorWeekIds.length > 0) {
    const priorLegsByWeek = await Promise.all(priorWeekIds.map((wid) => fetchLegsForWeek(leagueId, wid)));
    const rates = priorLegsByWeek.map(computeFavoriteRate).filter((r): r is number => r !== null);
    trailingFavoritePickRate = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  }

  // Per-member weekly results across all league weeks up to target, for streaks + this week's standing.
  const allWeeksLegs = await Promise.all(
    orderedWeeks.map(async (w) => ({ weekId: w.weekId, legs: await fetchLegsForWeek(leagueId, w.weekId) }))
  );

  const standings: WeeklyMemberStanding[] = members.map((m) => {
    const displayName = m.firstName || m.email || "Member";
    const perWeek = allWeeksLegs.map(({ legs }) => {
      const mine = legs.filter((l) => l.userId === m.userId && (l.result === "win" || l.result === "loss"));
      return { win: mine.filter((l) => l.result === "win").length, loss: mine.filter((l) => l.result === "loss").length };
    });

    const thisWeek = decidedWeekLegs.filter((l) => l.userId === m.userId);
    const wins = thisWeek.filter((l) => l.result === "win").length;
    const losses = thisWeek.filter((l) => l.result === "loss").length;
    const pushes = weekLegs.filter((l) => l.userId === m.userId && l.result === "push").length;
    const total = wins + losses;

    return {
      userId: m.userId,
      displayName,
      wins,
      losses,
      pushes,
      winRate: total > 0 ? (wins / total) * 100 : null,
      currentStreak: computeStreak(perWeek),
    };
  });

  const ranked = standings
    .filter((s) => s.winRate !== null)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));

  const pickDistribution: Record<string, number> = {};
  for (const leg of weekLegs) {
    pickDistribution[leg.betType] = (pickDistribution[leg.betType] ?? 0) + 1;
  }

  return {
    leagueId,
    leagueName: league.name,
    weekId,
    weekLabel: week.label,
    totalLegsDecided: decidedWeekLegs.length,
    leagueWinRate,
    favoritePickRate,
    underdogPickRate,
    trailingFavoritePickRate,
    standings,
    bestPerformer: ranked[0] ?? null,
    worstPerformer: ranked.length > 0 ? ranked[ranked.length - 1] : null,
    pickDistribution,
  };
}
