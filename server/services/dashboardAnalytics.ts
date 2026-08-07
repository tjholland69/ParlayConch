import { db } from "../db";
import { parlayLegs, parlays, weeks, leagueMembers, games, players } from "@shared/schema";
import { eq, and, or, inArray, sql, isNotNull, ilike, exists, gte, lte } from "drizzle-orm";

export interface UserSummary {
  leagueCount: number;
  parlaysPlaced: number;
  legsPlaced: number;
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
      legsPlaced: sql<number>`count(*)`,
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
    legsPlaced: Number(row?.legsPlaced ?? 0),
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
  /** That week's own (non-cumulative) win rate — powers the week-over-week view. */
  myWeekWinRate: number | null;
  indexWeekWinRate: number | null;
}

export interface WinRateSeriesOptions {
  /** Leagues to scope to. Empty/undefined = all leagues the requesting user belongs to. */
  leagueIds?: number[];
  /** Whose legs aggregate into the index line. Empty/undefined = everyone except the requesting user. */
  memberUserIds?: string[];
  /** parlayLegs.betType values to include. Empty/undefined = all. */
  betTypes?: string[];
  /** parlayLegs.propType values to include. Empty/undefined = all. */
  propTypes?: string[];
  /** Case-insensitive substring match on parlayLegs.playerName. */
  playerName?: string;
  /** Team abbreviation/name — matched against the leg's game (home/away) or the prop player's team. */
  teamName?: string;
  /** Inclusive date range on the leg's parlay.createdAt — the "Performance Over Time" date filter. */
  startDate?: Date;
  endDate?: Date;
}

/**
 * Lower-level win-rate time series. Both the "my" line and the "index" line are
 * filtered by the same league/bet-type/prop/player/team scope, so a custom index
 * narrows the user's own bets too. Only `memberUserIds` distinguishes the two:
 * it restricts *who* aggregates into the index line.
 */
export async function computeWinRateSeries(
  userId: string,
  opts: WinRateSeriesOptions = {}
): Promise<{ points: WinRateTimeSeriesPoint[] }> {
  const { leagueIds, memberUserIds, betTypes, propTypes, playerName, teamName, startDate, endDate } = opts;

  let scopeLeagueIds: number[];

  if (leagueIds && leagueIds.length > 0) {
    scopeLeagueIds = leagueIds;
  } else {
    const memberships = await db
      .select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userId));
    scopeLeagueIds = memberships.map((m) => m.leagueId);
  }

  if (scopeLeagueIds.length === 0) return { points: [] };

  const conditions = [inArray(parlays.leagueId, scopeLeagueIds), isNotNull(parlayLegs.result)];

  if (betTypes && betTypes.length > 0) {
    conditions.push(inArray(parlayLegs.betType, betTypes));
  }
  if (propTypes && propTypes.length > 0) {
    conditions.push(inArray(parlayLegs.propType, propTypes));
  }
  if (playerName && playerName.trim()) {
    conditions.push(ilike(parlayLegs.playerName, `%${playerName.trim()}%`));
  }
  if (startDate) {
    conditions.push(gte(parlays.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(parlays.createdAt, endDate));
  }

  // Team filtering has no column on parlayLegs: a game-tied leg matches through
  // games.homeTeam/awayTeam, and a player-prop leg without a gameId matches
  // through the players table on playerName. Expressed as EXISTS subqueries
  // rather than joins so a duplicated player name can't fan out (double-count) rows.
  if (teamName && teamName.trim()) {
    const team = teamName.trim();
    conditions.push(
      or(
        exists(
          db
            .select({ one: sql`1` })
            .from(games)
            .where(
              and(
                eq(games.id, parlayLegs.gameId),
                or(ilike(games.homeTeam, team), ilike(games.awayTeam, team))
              )
            )
        ),
        exists(
          db
            .select({ one: sql`1` })
            .from(players)
            .where(and(eq(players.name, parlayLegs.playerName), ilike(players.team, team)))
        )
      )!
    );
  }

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
    .where(and(...conditions));

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

  // When memberUserIds is supplied the index line is exactly those members
  // (the requesting user included, if they named themselves); otherwise it keeps
  // today's behavior of "everyone else in scope".
  const indexMembers = memberUserIds && memberUserIds.length > 0 ? new Set(memberUserIds) : null;

  for (const row of rows) {
    if (row.result !== "win" && row.result !== "loss") continue;

    const isMine = row.userId === userId;
    const inIndex = indexMembers ? indexMembers.has(row.userId) : !isMine;

    const tally = (bucket: Map<number, { win: number; loss: number }>) => {
      const entry = bucket.get(row.weekId) ?? { win: 0, loss: 0 };
      if (row.result === "win") entry.win++;
      else entry.loss++;
      bucket.set(row.weekId, entry);
    };

    if (isMine) tally(myByWeek);
    if (inIndex) tally(othersByWeek);
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

    const myWeekTotal = mine ? mine.win + mine.loss : 0;
    const otherWeekTotal = others ? others.win + others.loss : 0;

    return {
      weekLabel: weekOrder.get(weekId)!.label,
      myWinRate: myTotal > 0 ? (myCumWin / myTotal) * 100 : null,
      indexWinRate: otherTotal > 0 ? (otherCumWin / otherTotal) * 100 : null,
      myWeekWinRate: myWeekTotal > 0 ? (mine!.win / myWeekTotal) * 100 : null,
      indexWeekWinRate: otherWeekTotal > 0 ? (others!.win / otherWeekTotal) * 100 : null,
    };
  });

  return { points };
}

/**
 * Dashboard performance series — the requesting user vs. the combined win rate of
 * every other member of the scoped league(s). Thin wrapper over
 * `computeWinRateSeries` with no bet-type/member/prop/player/team narrowing.
 */
export async function getWinRateTimeSeries(
  userId: string,
  leagueId?: number,
  dateRange?: { startDate?: Date; endDate?: Date }
): Promise<{ points: WinRateTimeSeriesPoint[] }> {
  return computeWinRateSeries(userId, {
    leagueIds: leagueId ? [leagueId] : undefined,
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
  });
}

export interface WeeklyWinRatePoint {
  weekLabel: string;
  winRate: number;
}

/**
 * Per-league, per-week (non-cumulative) win rate for the requesting user's own
 * legs, from league inception to date. Weeks with no decided legs are omitted
 * rather than zeroed, so a quiet week doesn't read as a loss streak — mirrors
 * a GitHub-style activity line for each "My Leagues" tile.
 */
export async function getLeagueWeeklyWinRates(
  userId: string,
  leagueIds: number[]
): Promise<Record<number, WeeklyWinRatePoint[]>> {
  if (leagueIds.length === 0) return {};

  const rows = await db
    .select({
      leagueId: parlays.leagueId,
      result: parlayLegs.result,
      weekId: weeks.id,
      season: weeks.season,
      weekNumber: weeks.weekNumber,
      weekLabel: weeks.label,
    })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(
      and(
        inArray(parlays.leagueId, leagueIds),
        eq(parlayLegs.userId, userId),
        isNotNull(parlayLegs.result)
      )
    );

  type WeekMeta = { season: number; weekNumber: number; label: string };
  const weekMetaByLeague = new Map<number, Map<number, WeekMeta>>();
  const tallyByLeague = new Map<number, Map<number, { win: number; loss: number }>>();

  for (const row of rows) {
    if (row.result !== "win" && row.result !== "loss") continue;

    if (!weekMetaByLeague.has(row.leagueId)) weekMetaByLeague.set(row.leagueId, new Map());
    const weekMeta = weekMetaByLeague.get(row.leagueId)!;
    if (!weekMeta.has(row.weekId)) {
      weekMeta.set(row.weekId, { season: row.season, weekNumber: row.weekNumber, label: row.weekLabel });
    }

    if (!tallyByLeague.has(row.leagueId)) tallyByLeague.set(row.leagueId, new Map());
    const tally = tallyByLeague.get(row.leagueId)!;
    const entry = tally.get(row.weekId) ?? { win: 0, loss: 0 };
    if (row.result === "win") entry.win++;
    else entry.loss++;
    tally.set(row.weekId, entry);
  }

  const result: Record<number, WeeklyWinRatePoint[]> = {};
  for (const leagueId of leagueIds) {
    const weekMeta = weekMetaByLeague.get(leagueId);
    const tally = tallyByLeague.get(leagueId);
    if (!weekMeta || !tally) {
      result[leagueId] = [];
      continue;
    }

    const orderedWeekIds = Array.from(weekMeta.entries())
      .sort(([, a], [, b]) => a.season - b.season || a.weekNumber - b.weekNumber)
      .map(([weekId]) => weekId);

    result[leagueId] = orderedWeekIds.map((weekId) => {
      const { win, loss } = tally.get(weekId)!;
      const total = win + loss;
      return { weekLabel: weekMeta.get(weekId)!.label, winRate: (win / total) * 100 };
    });
  }

  return result;
}
