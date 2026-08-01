import { db } from "../db";
import { parlayLegs, parlays, weeks, leagueMembers } from "@shared/schema";
import { eq, and, inArray, sql, isNotNull } from "drizzle-orm";

export interface UserSummary {
  leagueCount: number;
  parlaysPlaced: number;
  legWins: number;
  legLosses: number;
  legWinRate: number;
}

export async function getUserSummary(userId: string): Promise<UserSummary> {
  const [{ leagueCount }] = await db
    .select({ leagueCount: sql<number>`count(*)` })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, userId));

  const [row] = await db
    .select({
      parlaysPlaced: sql<number>`count(distinct ${parlayLegs.parlayId})`,
      legWins: sql<number>`count(*) filter (where ${parlayLegs.result} = 'win')`,
      legLosses: sql<number>`count(*) filter (where ${parlayLegs.result} = 'loss')`,
    })
    .from(parlayLegs)
    .where(eq(parlayLegs.userId, userId));

  const legWins = Number(row?.legWins ?? 0);
  const legLosses = Number(row?.legLosses ?? 0);
  const totalDecided = legWins + legLosses;

  return {
    leagueCount: Number(leagueCount ?? 0),
    parlaysPlaced: Number(row?.parlaysPlaced ?? 0),
    legWins,
    legLosses,
    legWinRate: totalDecided > 0 ? (legWins / totalDecided) * 100 : 0,
  };
}

export interface UserPatterns {
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  topBetType: { type: string; count: number } | null;
  favoritePlayer: { name: string; count: number } | null;
  favoriteDay: { day: string; count: number } | null;
  favoriteTimeOfDay: { label: string; count: number } | null;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function timeOfDayBucket(hour: number): string {
  if (hour >= 5 && hour <= 11) return "Morning";
  if (hour >= 12 && hour <= 16) return "Afternoon";
  if (hour >= 17 && hour <= 20) return "Evening";
  return "Night";
}

function topEntry<T extends string>(counts: Record<T, number>): { key: T; count: number } | null {
  let best: { key: T; count: number } | null = null;
  for (const key in counts) {
    const count = counts[key];
    if (!best || count > best.count) best = { key, count };
  }
  return best;
}

export async function getUserPatterns(userId: string): Promise<UserPatterns> {
  const rows = await db
    .select({
      result: parlayLegs.result,
      betType: parlayLegs.betType,
      playerName: parlayLegs.playerName,
      createdAt: parlays.createdAt,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .where(eq(parlayLegs.userId, userId));

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  const betTypeCounts: Record<string, number> = {};
  const playerCounts: Record<string, number> = {};
  const dayCounts: Record<string, number> = {};
  const timeCounts: Record<string, number> = {};

  for (const row of rows) {
    if (row.result === "win") wins++;
    else if (row.result === "loss") losses++;
    else if (row.result === "push") pushes++;

    betTypeCounts[row.betType] = (betTypeCounts[row.betType] ?? 0) + 1;

    if (row.betType === "player_prop" && row.playerName) {
      playerCounts[row.playerName] = (playerCounts[row.playerName] ?? 0) + 1;
    }

    if (row.createdAt) {
      const date = new Date(row.createdAt);
      const day = DAY_NAMES[date.getDay()];
      dayCounts[day] = (dayCounts[day] ?? 0) + 1;
      const bucket = timeOfDayBucket(date.getHours());
      timeCounts[bucket] = (timeCounts[bucket] ?? 0) + 1;
    }
  }

  const totalDecided = wins + losses;
  const topBetType = topEntry(betTypeCounts);
  const favoritePlayer = topEntry(playerCounts);
  const favoriteDay = topEntry(dayCounts);
  const favoriteTimeOfDay = topEntry(timeCounts);

  return {
    wins,
    losses,
    pushes,
    winRate: totalDecided > 0 ? (wins / totalDecided) * 100 : 0,
    topBetType: topBetType ? { type: topBetType.key, count: topBetType.count } : null,
    favoritePlayer: favoritePlayer ? { name: favoritePlayer.key, count: favoritePlayer.count } : null,
    favoriteDay: favoriteDay ? { day: favoriteDay.key, count: favoriteDay.count } : null,
    favoriteTimeOfDay: favoriteTimeOfDay ? { label: favoriteTimeOfDay.key, count: favoriteTimeOfDay.count } : null,
  };
}

export interface WinRateTimeSeriesPoint {
  weekLabel: string;
  myWinRate: number | null;
  indexWinRate: number | null;
}

export async function getWinRateTimeSeries(
  userId: string,
  leagueId?: number
): Promise<{ points: WinRateTimeSeriesPoint[] }> {
  let scopeLeagueIds: number[];

  if (leagueId) {
    scopeLeagueIds = [leagueId];
  } else {
    const memberships = await db
      .select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userId));
    scopeLeagueIds = memberships.map((m) => m.leagueId);
  }

  if (scopeLeagueIds.length === 0) return { points: [] };

  const rows = await db
    .select({
      userId: parlayLegs.userId,
      result: parlayLegs.result,
      weekId: weeks.id,
      season: weeks.season,
      weekNumber: weeks.weekNumber,
      weekLabel: weeks.label,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(and(inArray(parlays.leagueId, scopeLeagueIds), isNotNull(parlayLegs.result)));

  const weekOrder = new Map<number, { season: number; weekNumber: number; label: string }>();
  for (const row of rows) {
    if (!weekOrder.has(row.weekId)) {
      weekOrder.set(row.weekId, { season: row.season, weekNumber: row.weekNumber, label: row.weekLabel });
    }
  }

  const orderedWeekIds = Array.from(weekOrder.entries())
    .sort(([, a], [, b]) => a.season - b.season || a.weekNumber - b.weekNumber)
    .map(([weekId]) => weekId);

  const myByWeek = new Map<number, { win: number; loss: number }>();
  const othersByWeek = new Map<number, { win: number; loss: number }>();

  for (const row of rows) {
    if (row.result !== "win" && row.result !== "loss") continue;
    const bucket = row.userId === userId ? myByWeek : othersByWeek;
    const entry = bucket.get(row.weekId) ?? { win: 0, loss: 0 };
    if (row.result === "win") entry.win++;
    else entry.loss++;
    bucket.set(row.weekId, entry);
  }

  let myCumWin = 0;
  let myCumLoss = 0;
  let otherCumWin = 0;
  let otherCumLoss = 0;

  const points: WinRateTimeSeriesPoint[] = orderedWeekIds.map((weekId) => {
    const mine = myByWeek.get(weekId);
    if (mine) {
      myCumWin += mine.win;
      myCumLoss += mine.loss;
    }
    const others = othersByWeek.get(weekId);
    if (others) {
      otherCumWin += others.win;
      otherCumLoss += others.loss;
    }

    const myTotal = myCumWin + myCumLoss;
    const otherTotal = otherCumWin + otherCumLoss;

    return {
      weekLabel: weekOrder.get(weekId)!.label,
      myWinRate: myTotal > 0 ? (myCumWin / myTotal) * 100 : null,
      indexWinRate: otherTotal > 0 ? (otherCumWin / otherTotal) * 100 : null,
    };
  });

  return { points };
}
