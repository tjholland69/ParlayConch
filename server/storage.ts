import { db } from "./db";
import {
  weeks, games, bets, users, leagues, leagueMembers, parlays, parlayLegs, importBatches, notifications, leagueWeekLocks,
  players, playerWeekStats, customIndexes, customIndexShares, storyReports, storySections,
  type CustomIndex, type CustomIndexWithAccess, type InsertCustomIndex, type UpdateCustomIndex,
  type StoryReport, type StoryReportWithSections, type InsertStoryReport, type UpdateStoryReport,
  type StorySection, type StorySectionKind,
  type Week, type Game, type Bet, type InsertBet, type League, type LeagueMember,
  type Parlay, type ParlayLeg, type InsertLeague, type InsertParlay, type InsertParlayLeg,
  type GameWithBet, type BetHistoryItem, type UserStat, type LeagueWithMembers, type ParlayWithLegs,
  type ParlayLegWithParlayContext,
  type ImportBatch, type InsertImportBatch, type ImportParlayLeg,
  type LieutenantPermissions, type LeagueMemberWithUser,
  type Notification, type LeagueNotificationSettings,
  type LeagueWeekLock, type WeekLockStatus,
  type Player, type PlayerWeekStat, type InsertPlayer, type InsertPlayerWeekStat,
  type ActiveWeekStatus, type LeagueDataStats, type PopularPick,
} from "@shared/schema";
import { eq, and, desc, inArray, sql, ilike, not, isNull } from "drizzle-orm";
import { publishLeagueEvent, publishUserEvent } from "./realtime-bus";

function emitLeague(leagueId: number, weekId: number | undefined, kind: string) {
  void publishLeagueEvent(leagueId, kind, weekId).catch((e) =>
    console.error("[realtime]", e),
  );
}

function emitUser(userId: string, kind: string) {
  void publishUserEvent(userId, kind).catch((e) => console.error("[realtime]", e));
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export interface IStorage {
  // Weeks
  getWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(week: any): Promise<Week>;
  setActiveWeek(weekId: number): Promise<void>;

  // Games
  getGamesByWeek(weekId: number, userId?: string): Promise<GameWithBet[]>;
  createGame(game: any): Promise<Game>;
  getGame(id: number): Promise<Game | undefined>;

  // Bets (legacy)
  createBet(userId: string, bet: InsertBet): Promise<Bet>;
  getBetHistory(userId: string): Promise<BetHistoryItem[]>;
  
  // Stats
  getStats(): Promise<UserStat[]>;
  getLeagueStats(leagueId: number, weekIds?: number[]): Promise<UserStat[]>;

  // Leagues
  createLeague(userId: string, league: InsertLeague): Promise<League>;
  getLeague(id: number): Promise<League | undefined>;
  getUserLeagues(userId: string): Promise<LeagueWithMembers[]>;
  joinLeague(userId: string, inviteCode: string): Promise<LeagueMember | null>;
  getLeagueMembers(leagueId: number): Promise<LeagueMember[]>;
  getLeagueMembersWithUsers(leagueId: number): Promise<LeagueMemberWithUser[]>;
  isSuperUser(userId: string): Promise<boolean>;
  isLeagueAdmin(leagueId: number, userId: string): Promise<boolean>;
  isLeagueLieutenant(leagueId: number, userId: string): Promise<boolean>;
  updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay' | 'insightsEnabled' | 'loserLabel'>>): Promise<League>;
  updateLieutenantPermissions(leagueId: number, permissions: LieutenantPermissions): Promise<League>;
  setMemberRole(leagueId: number, userId: string, role: string): Promise<LeagueMember>;
  getLieutenants(leagueId: number): Promise<LeagueMemberWithUser[]>;
  removeLeagueMember(leagueId: number, userId: string): Promise<void>;
  transferLeagueAdmin(leagueId: number, fromUserId: string, toUserId: string): Promise<void>;

  // Parlays
  getParlay(id: number): Promise<Parlay | undefined>;
  createParlay(userId: string, parlay: InsertParlay, legs: Omit<InsertParlayLeg, "parlayId" | "userId">[]): Promise<Parlay>;
  getUserParlayForWeek(userId: string, leagueId: number, weekId: number): Promise<ParlayWithLegs | null>;
  getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]>;
  getAllLeagueParlays(leagueId: number): Promise<ParlayWithLegs[]>;
  approveParlay(parlayId: number, adminId: string): Promise<Parlay>;
  rejectParlay(parlayId: number, adminId: string): Promise<Parlay>;
  getUserParlayHistory(userId: string, leagueId?: number): Promise<ParlayWithLegs[]>;
  getUserLegHistory(userId: string, leagueId?: number): Promise<ParlayLegWithParlayContext[]>;
  updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string | null; notes?: string | null }[] }): Promise<Parlay>;
  deleteParlay(parlayId: number): Promise<void>;
  deleteParlayLeg(legId: number): Promise<void>;
  updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>>): Promise<ParlayLeg>;
  bulkUpdateParlayLegs(legIds: number[], field: keyof Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>, value: string | null): Promise<ParlayLeg[]>;
  addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'> & { userId: string }): Promise<ParlayLeg>;
  mergeParlays(leagueId: number, targetParlayId: number, sourceParlayIds: number[]): Promise<void>;
  splitParlayLegs(leagueId: number, parlayId: number, legIds: number[]): Promise<Parlay>;
  createHistoricalParlay(userId: string, leagueId: number, weekId: number, legs: Array<{ betType: string; pick: string; line?: string | null; odds?: string | null; result?: string | null; playerName?: string | null; propType?: string | null; gameSegment?: string | null; notes?: string | null }>): Promise<Parlay>;

  // Parlay status rollup
  rollupParlayStatus(parlayId: number): Promise<void>;
  rollupLeagueParlayStatuses(leagueId?: number, recomputeTerminal?: boolean): Promise<{ updated: number; skipped: number }>;

  // Imports
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;
  createImportedParlay(userId: string, parlay: InsertParlay, legs: ImportParlayLeg[], batchId: number, status: string): Promise<Parlay>;
  getLeagueImportHistory(leagueId: number): Promise<ImportBatch[]>;
  getLeagueMemberByEmail(leagueId: number, email: string): Promise<LeagueMember | null>;
  getUserByEmail(email: string): Promise<typeof users.$inferSelect | null>;
  addMemberToLeague(leagueId: number, userId: string): Promise<LeagueMember>;

  // Demo flags
  setUserDemoFlag(userId: string, isDemo: boolean): Promise<void>;
  setLeagueDemoFlag(leagueId: number, isDemo: boolean): Promise<void>;
  setLeagueDemoWeekData(leagueId: number, useDemoWeekData: boolean): Promise<void>;

  // User settings
  updateUserSettings(userId: string, settings: Record<string, unknown>): Promise<void>;

  // Notifications
  getNotifications(userId: string): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  markNotificationRead(id: number, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;
  createNotification(data: { userId: string; leagueId?: number; type: string; title: string; message?: string }): Promise<Notification>;
  createLeagueAnnouncement(leagueId: number, title: string, message: string): Promise<void>;
  updateLeagueNotificationSettings(leagueId: number, settings: LeagueNotificationSettings): Promise<League>;

  // Active week parlay status (for Quick Pick tile badges)
  getActiveWeekParlayStatus(leagueIds: number[], userId: string): Promise<Record<number, ActiveWeekStatus>>;
  getLeagueDataStats(leagueId: number): Promise<LeagueDataStats>;
  getPopularPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<PopularPick[]>;

  // Aggregate win/loss stats per league (for My Leagues tile)
  getLeagueOverviewStats(leagueIds: number[]): Promise<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number }>>;

  // Custom indexes
  createCustomIndex(ownerId: string, input: InsertCustomIndex): Promise<CustomIndex>;
  listVisibleCustomIndexes(userId: string): Promise<CustomIndexWithAccess[]>;
  getCustomIndex(id: number): Promise<CustomIndex | undefined>;
  updateCustomIndex(id: number, updates: UpdateCustomIndex): Promise<CustomIndex>;
  deleteCustomIndex(id: number): Promise<void>;
  shareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void>;
  unshareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void>;
  getCustomIndexShares(customIndexId: number): Promise<string[]>;
  usersShareALeague(userIdA: string, userIdB: string): Promise<boolean>;

  // Parlay week locking
  getWeekLockStatus(leagueId: number, weekId: number): Promise<WeekLockStatus>;
  lockWeekParlay(leagueId: number, weekId: number, userId: string, hadMissingBets: boolean): Promise<LeagueWeekLock>;
  unlockWeekParlay(leagueId: number, weekId: number): Promise<void>;

  // Enrichment
  findGameByTeams(weekId: number, homeTeam: string, awayTeam: string): Promise<Game | null>;
  upsertGameForImport(weekId: number, homeTeam: string, awayTeam: string, gameDate?: Date): Promise<Game>;
  getUnenrichedLegs(leagueId?: number): Promise<(ParlayLeg & { game: Game | null })[]>;
  enrichParlayLeg(legId: number, updates: { result?: string | null; line?: string | null; oddsEnriched: boolean }): Promise<void>;
  updateGameScores(gameId: number, homeScore: number, awayScore: number, isFinished: boolean, winner?: string): Promise<void>;
  backfillGameFinishedAt(): Promise<{ updated: number }>;
  patchGameOdds(gameId: number, odds: { spread?: string; overUnder?: string; moneylineHome?: string; moneylineAway?: string }): Promise<void>;
  getUser(userId: string): Promise<typeof users.$inferSelect | null>;

  // nflverse / Players
  getWeekBySeasonAndNumber(season: number, weekNumber: number): Promise<Week | null>;
  getGamesForSeasonWeek(season: number, weekNumber: number): Promise<Game[]>;
  upsertPlayer(data: Omit<InsertPlayer, 'updatedAt'>): Promise<Player>;
  upsertPlayerWeekStat(data: InsertPlayerWeekStat): Promise<PlayerWeekStat>;
  getPlayerStatsForGame(gameId: number): Promise<(PlayerWeekStat & { player: Player })[]>;
  getPlayerStatByName(playerName: string, season: number, week: number): Promise<(PlayerWeekStat & { player: Player }) | null>;
  setLegEnrichmentLog(legId: number, log: string): Promise<void>;

  // Story Studio
  createStoryReport(userId: string, input: InsertStoryReport): Promise<StoryReport>;
  getStoryReportWithSections(id: number): Promise<StoryReportWithSections | undefined>;
  updateStoryReport(id: number, updates: UpdateStoryReport): Promise<StoryReport>;
  upsertStorySection(reportId: number, kind: StorySectionKind, order: number, data: { content?: string; generatedContent?: string; promptVersion?: string }): Promise<StorySection>;
}

export class DatabaseStorage implements IStorage {
  async getWeeks(): Promise<Week[]> {
    return await db.select().from(weeks).orderBy(weeks.season, weeks.weekNumber);
  }

  async getWeek(id: number): Promise<Week | undefined> {
    const [week] = await db.select().from(weeks).where(eq(weeks.id, id));
    return week;
  }

  async createWeek(week: any): Promise<Week> {
    const [newWeek] = await db.insert(weeks).values(week).returning();
    return newWeek;
  }

  /** The only code path allowed to flip a week's isActive to true — deactivates every
   * other week first so at most one week is ever active at a time. */
  async setActiveWeek(weekId: number): Promise<void> {
    await db.update(weeks).set({ isActive: false });
    await db.update(weeks).set({ isActive: true }).where(eq(weeks.id, weekId));
  }

  async getGamesByWeek(weekId: number, userId?: string): Promise<GameWithBet[]> {
    const weekGames = await db.select().from(games).where(eq(games.weekId, weekId));
    
    if (!userId) {
      return weekGames;
    }

    const userBets = await db.select().from(bets).where(eq(bets.userId, userId));
    
    return weekGames.map(game => {
      const bet = userBets.find(b => b.gameId === game.id);
      return { ...game, userBet: bet };
    });
  }

  async createGame(game: any): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async getGame(id: number): Promise<Game | undefined> {
    const [game] = await db.select().from(games).where(eq(games.id, id));
    return game;
  }

  async createBet(userId: string, insertBet: InsertBet): Promise<Bet> {
    const existing = await db.select().from(bets)
      .where(and(eq(bets.userId, userId), eq(bets.gameId, insertBet.gameId)));

    if (existing.length > 0) {
      const [updated] = await db.update(bets)
        .set({ pick: insertBet.pick, createdAt: new Date() })
        .where(eq(bets.id, existing[0].id))
        .returning();
      return updated;
    }

    const [newBet] = await db.insert(bets)
      .values({ ...insertBet, userId })
      .returning();
    return newBet;
  }

  async getBetHistory(userId: string): Promise<BetHistoryItem[]> {
    const rows = await db.select({
      bet: bets,
      game: games,
      week: weeks
    })
    .from(bets)
    .innerJoin(games, eq(bets.gameId, games.id))
    .innerJoin(weeks, eq(games.weekId, weeks.id))
    .where(eq(bets.userId, userId))
    .orderBy(desc(weeks.weekNumber));

    return rows.map(r => ({
      ...r.bet,
      game: r.game,
      week: r.week
    }));
  }

  async getStats(): Promise<UserStat[]> {
    // noinspection SqlResolve
    const rows = await db
      .select({
        userId: users.id,
        firstName: users.firstName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
        settings: users.settings,
        wins:   sql<number>`count(*) filter (where ${parlays.status} = 'win')`,
        losses: sql<number>`count(*) filter (where ${parlays.status} = 'loss')`,
        pushes: sql<number>`count(*) filter (where ${parlays.status} = 'push')`,
      })
      .from(users)
      .leftJoin(parlays, eq(parlays.userId, users.id))
      .where(sql`${users.isDemo} is not true`)
      .groupBy(users.id);

    return rows
      .map(row => {
        const wins = Number(row.wins);
        const losses = Number(row.losses);
        const pushes = Number(row.pushes);
        const totalDecided = wins + losses;
        const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;
        const settings = row.settings as any;
        return {
          userId: row.userId,
          username: settings?.displayName || row.firstName || row.email || 'Unknown',
          profileImageUrl: row.profileImageUrl,
          wins,
          losses,
          pushes,
          winRate,
          region: settings?.region || null,
        };
      })
      .sort((a, b) => b.winRate - a.winRate);
  }

  /**
   * Per-member win/loss/push record, based on individual parlay_legs results
   * (not the parlay's overall status) — each leg is its own bet, attributed
   * to whichever member contributed it (parlayLegs.userId). Legs belonging to
   * a 'void' (no submission) or 'rejected' parlay are excluded, since those
   * don't represent a real decided bet.
   */
  async getLeagueStats(leagueId: number, weekIds?: number[]): Promise<UserStat[]> {
    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    const memberIds = members.map(m => m.userId);

    if (memberIds.length === 0) return [];

    const memberUsers = await db.select().from(users).where(inArray(users.id, memberIds));

    const legRows = await db.select({ userId: parlayLegs.userId, result: parlayLegs.result })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(
        eq(parlays.leagueId, leagueId),
        not(inArray(parlays.status as any, ['void', 'rejected'])),
        inArray(parlayLegs.userId, memberIds),
        weekIds && weekIds.length > 0 ? inArray(parlays.weekId, weekIds) : undefined,
      ));

    return memberUsers.map(user => {
      const userLegs = legRows.filter(l => l.userId === user.id);
      const wins = userLegs.filter(l => l.result === 'win').length;
      const losses = userLegs.filter(l => l.result === 'loss').length;
      const pushes = userLegs.filter(l => l.result === 'push').length;
      const totalDecided = wins + losses;
      const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

      return {
        userId: user.id,
        username: (user.settings as any)?.displayName || user.firstName || user.email || 'Unknown',
        profileImageUrl: user.profileImageUrl,
        wins,
        losses,
        pushes,
        winRate,
        region: (user.settings as any)?.region || null,
      };
    }).sort((a, b) => b.winRate - a.winRate);
  }

  async getLeagueDataStats(leagueId: number): Promise<LeagueDataStats> {
    const [members, leagueParlays, activeWeek] = await Promise.all([
      db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId)),
      db.select().from(parlays).where(eq(parlays.leagueId, leagueId)),
      db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1),
    ]);

    const countedParlays = leagueParlays.filter(p => p.status !== 'void');
    const parlayIds = countedParlays.map(p => p.id);
    const totalLegs = parlayIds.length === 0 ? 0 : (
      await db.select().from(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds))
    ).length;

    const totalParlays = countedParlays.length;
    const memberCount = members.length;
    const avgLegsPerParlay = totalParlays > 0 ? totalLegs / totalParlays : 0;

    const currentSeason = activeWeek[0]?.season;
    let seasonWeekIds: number[] | undefined;
    if (currentSeason !== undefined) {
      const seasonWeeks = await db.select().from(weeks).where(eq(weeks.season, currentSeason));
      seasonWeekIds = seasonWeeks.map(w => w.id);
    }

    const [allTimeStandings, currentSeasonStandings] = await Promise.all([
      this.getLeagueStats(leagueId),
      seasonWeekIds ? this.getLeagueStats(leagueId, seasonWeekIds) : Promise.resolve([]),
    ]);

    return {
      totalParlays,
      totalLegs,
      memberCount,
      avgLegsPerParlay,
      allTimeStandings,
      currentSeasonStandings,
    };
  }

  // Leagues
  async createLeague(userId: string, league: InsertLeague): Promise<League> {
    const inviteCode = generateInviteCode();
    const [newLeague] = await db.insert(leagues)
      .values({ ...league, inviteCode })
      .returning();
    
    // Add creator as admin
    await db.insert(leagueMembers).values({
      leagueId: newLeague.id,
      userId,
      role: 'admin'
    });

    return newLeague;
  }

  async getLeague(id: number): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
    return league;
  }

  async getUserLeagues(userId: string): Promise<LeagueWithMembers[]> {
    const memberships = await db.select().from(leagueMembers).where(eq(leagueMembers.userId, userId));
    if (memberships.length === 0) return [];

    const leagueIds = memberships.map(m => m.leagueId);
    const [userLeagues, allMembers] = await Promise.all([
      db.select().from(leagues).where(inArray(leagues.id, leagueIds)),
      db.select({ member: leagueMembers, user: users })
        .from(leagueMembers)
        .innerJoin(users, eq(leagueMembers.userId, users.id))
        .where(inArray(leagueMembers.leagueId, leagueIds)),
    ]);

    const membersByLeague = new Map<number, typeof allMembers>();
    for (const m of allMembers) {
      const existing = membersByLeague.get(m.member.leagueId) ?? [];
      existing.push(m);
      membersByLeague.set(m.member.leagueId, existing);
    }

    return userLeagues.map(league => {
      const members = membersByLeague.get(league.id) ?? [];
      const userMembership = memberships.find(m => m.leagueId === league.id);
      return {
        ...league,
        members: members.map(m => ({
          ...m.member,
          user: {
            id: m.user.id,
            firstName: m.user.firstName,
            email: m.user.email,
            profileImageUrl: m.user.profileImageUrl,
            isDemo: m.user.isDemo,
            settings: m.user.settings as any,
          }
        })),
        memberCount: members.length,
        isAdmin: userMembership?.role === 'admin',
        isLieutenant: userMembership?.role === 'lieutenant',
      };
    });
  }

  async getActiveWeekParlayStatus(leagueIds: number[], userId: string): Promise<Record<number, ActiveWeekStatus>> {
    if (leagueIds.length === 0) return {};
    const [activeWeek] = await db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1);
    if (!activeWeek) return {};

    const [parlayRows, lockRows, memberRows] = await Promise.all([
      db.select({ leagueId: parlays.leagueId, userId: parlays.userId, status: parlays.status })
        .from(parlays)
        .where(and(eq(parlays.weekId, activeWeek.id), inArray(parlays.leagueId, leagueIds))),
      db.select({ leagueId: leagueWeekLocks.leagueId })
        .from(leagueWeekLocks)
        .where(and(eq(leagueWeekLocks.weekId, activeWeek.id), inArray(leagueWeekLocks.leagueId, leagueIds))),
      db.select({ leagueId: leagueMembers.leagueId })
        .from(leagueMembers)
        .where(inArray(leagueMembers.leagueId, leagueIds)),
    ]);

    const lockedSet = new Set(lockRows.map(l => l.leagueId));
    const result: Record<number, ActiveWeekStatus> = {};
    for (const leagueId of leagueIds) {
      const leagueParlays = parlayRows.filter(p => p.leagueId === leagueId);
      const submittedCount = leagueParlays.length;
      const totalMembers = memberRows.filter(m => m.leagueId === leagueId).length;
      result[leagueId] = {
        weekId: activeWeek.id,
        weekLabel: activeWeek.label,
        submittedCount,
        totalMembers,
        allSubmitted: submittedCount >= totalMembers && totalMembers > 0,
        isLocked: lockedSet.has(leagueId),
        currentUserSubmitted: leagueParlays.some(p => p.userId === userId),
        // Active week parlay status (for Quick Picks tile badges)
        hasPendingParlay: leagueParlays.some(p => p.status === 'pending'),
        hasApprovedParlay: leagueParlays.some(p => p.status === 'approved'),
      };
    }
    return result;
  }

  async getPopularPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<PopularPick[]> {
    const rows = await db
      .select({ leg: parlayLegs })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

    const pickKey = (leg: typeof parlayLegs.$inferSelect) =>
      leg.betType === 'player_prop'
        ? `prop:${leg.playerName}:${leg.propType}:${leg.pick}`
        : `game:${leg.gameId}:${leg.betType}:${leg.pick}`;

    const excludeKeys = new Set(
      rows.filter(r => r.leg.userId === excludeUserId).map(r => pickKey(r.leg))
    );

    const counts = new Map<string, PopularPick>();
    for (const { leg } of rows) {
      if (leg.userId === excludeUserId) continue;
      const key = pickKey(leg);
      if (excludeKeys.has(key)) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, {
          gameId: leg.gameId,
          betType: leg.betType,
          pick: leg.pick,
          playerName: leg.playerName,
          propType: leg.propType,
          count: 1,
        });
      }
    }

    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }

  async getLeagueOverviewStats(leagueIds: number[]): Promise<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number }>> {
    if (leagueIds.length === 0) return {};

    const parlayRows = await db
      .select({ leagueId: parlays.leagueId, status: parlays.status })
      .from(parlays)
      .where(and(inArray(parlays.leagueId, leagueIds), inArray(parlays.status as any, ['win', 'loss'])));

    const result: Record<number, { wins: number; losses: number; winRate: number; totalDecided: number }> = {};
    for (const leagueId of leagueIds) {
      const rows = parlayRows.filter(p => p.leagueId === leagueId);
      const wins = rows.filter(p => p.status === 'win').length;
      const losses = rows.filter(p => p.status === 'loss').length;
      const totalDecided = wins + losses;
      result[leagueId] = {
        wins,
        losses,
        winRate: totalDecided > 0 ? (wins / totalDecided) * 100 : 0,
        totalDecided,
      };
    }
    return result;
  }

  async joinLeague(userId: string, inviteCode: string): Promise<LeagueMember | null> {
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, inviteCode.toUpperCase()));
    if (!league) return null;

    // Check if already member
    const existing = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)));
    if (existing.length > 0) return existing[0];

    const [member] = await db.insert(leagueMembers)
      .values({ leagueId: league.id, userId, role: 'member' })
      .returning();
    return member;
  }

  async getLeagueMembers(leagueId: number): Promise<LeagueMember[]> {
    return await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
  }

  async isSuperUser(userId: string): Promise<boolean> {
    const [user] = await db.select({ isSuperUser: users.isSuperUser }).from(users).where(eq(users.id, userId));
    return user?.isSuperUser === true;
  }

  async isLeagueAdmin(leagueId: number, userId: string): Promise<boolean> {
    if (await this.isSuperUser(userId)) return true;
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    return member?.role === 'admin';
  }

  async isLeagueLieutenant(leagueId: number, userId: string): Promise<boolean> {
    if (await this.isSuperUser(userId)) return true;
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    return member?.role === 'lieutenant';
  }

  async getLeagueMembersWithUsers(leagueId: number): Promise<LeagueMemberWithUser[]> {
    const result = await db.select({
      member: leagueMembers,
      user: users
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId));

    return result.map(r => ({
      ...r.member,
      user: {
        id: r.user.id,
        firstName: r.user.firstName,
        email: r.user.email,
        profileImageUrl: r.user.profileImageUrl,
        isDemo: r.user.isDemo,
        settings: r.user.settings as any
      }
    }));
  }

  async getLieutenants(leagueId: number): Promise<LeagueMemberWithUser[]> {
    const all = await this.getLeagueMembersWithUsers(leagueId);
    return all.filter(m => m.role === 'lieutenant');
  }

  async updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay' | 'insightsEnabled' | 'loserLabel'>>): Promise<League> {
    const [updated] = await db.update(leagues)
      .set(updates)
      .where(eq(leagues.id, leagueId))
      .returning();
    return updated;
  }

  async updateLieutenantPermissions(leagueId: number, permissions: LieutenantPermissions): Promise<League> {
    const [updated] = await db.update(leagues)
      .set({ lieutenantPermissions: permissions })
      .where(eq(leagues.id, leagueId))
      .returning();
    return updated;
  }

  async setMemberRole(leagueId: number, userId: string, role: string): Promise<LeagueMember> {
    const [updated] = await db.update(leagueMembers)
      .set({ role })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
      .returning();
    return updated;
  }

  async removeLeagueMember(leagueId: number, userId: string): Promise<void> {
    await db.delete(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  }

  async transferLeagueAdmin(leagueId: number, fromUserId: string, toUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Promote the new admin
      await tx.update(leagueMembers)
        .set({ role: 'admin' })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, toUserId)));
      // Remove the outgoing admin from the league
      await tx.delete(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, fromUserId)));
    });
  }

  // Parlays
  async getParlay(id: number): Promise<Parlay | undefined> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, id));
    return parlay;
  }

  async createParlay(userId: string, parlay: InsertParlay, legs: Omit<InsertParlayLeg, "parlayId" | "userId">[]): Promise<Parlay> {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(parlays)
        .where(
          and(
            eq(parlays.userId, userId),
            eq(parlays.leagueId, parlay.leagueId),
            eq(parlays.weekId, parlay.weekId),
          ),
        );

      let parlayRecord: Parlay;

      if (existing.length > 0) {
        await tx.delete(parlayLegs).where(eq(parlayLegs.parlayId, existing[0].id));
        const [updated] = await tx
          .update(parlays)
          .set({
            status: "pending",
            createdAt: new Date(),
            approvedBy: null,
            approvedAt: null,
          })
          .where(eq(parlays.id, existing[0].id))
          .returning();
        parlayRecord = updated;
      } else {
        const [newParlay] = await tx
          .insert(parlays)
          .values({ ...parlay, userId })
          .returning();
        parlayRecord = newParlay;
      }

      if (legs.length > 0) {
        await tx
          .insert(parlayLegs)
          .values(legs.map((leg) => ({ ...leg, parlayId: parlayRecord.id, userId })));
      }

      return parlayRecord;
    }).then((parlayRecord) => {
      emitLeague(parlay.leagueId, parlay.weekId, "parlays_updated");
      return parlayRecord;
    });
  }

  async getUserParlayForWeek(userId: string, leagueId: number, weekId: number): Promise<ParlayWithLegs | null> {
    const [parlay] = await db.select().from(parlays)
      .where(and(
        eq(parlays.userId, userId),
        eq(parlays.leagueId, leagueId),
        eq(parlays.weekId, weekId)
      ));

    if (!parlay) return null;

    const legs = await db.select({
      leg: parlayLegs,
      game: games
    })
    .from(parlayLegs)
    .leftJoin(games, eq(parlayLegs.gameId, games.id))
    .where(eq(parlayLegs.parlayId, parlay.id));

    const [week] = await db.select().from(weeks).where(eq(weeks.id, parlay.weekId));

    return {
      ...parlay,
      legs: legs.map(l => ({ ...l.leg, game: l.game ?? null })),
      week
    };
  }

  async getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]> {
    // leftJoin (not innerJoin) — a parlay must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    const leagueParlays = await db.select({
      parlay: parlays,
      user: users
    })
    .from(parlays)
    .leftJoin(users, eq(parlays.userId, users.id))
    .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

    if (leagueParlays.length === 0) return [];

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    // leftJoin (not innerJoin) — a leg must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    const allLegs = await db.select({ leg: parlayLegs, game: games, legUser: users })
      .from(parlayLegs)
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .leftJoin(users, eq(parlayLegs.userId, users.id))
      .where(inArray(parlayLegs.parlayId, parlayIds));

    const legsByParlayId = new Map<number, ParlayWithLegs["legs"]>();
    for (const { leg, game, legUser } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({
        ...leg,
        game,
        user: legUser ? { firstName: legUser.firstName, email: legUser.email, profileImageUrl: legUser.profileImageUrl, isDemo: legUser.isDemo, settings: legUser.settings as any } : undefined,
      });
      legsByParlayId.set(leg.parlayId, existing);
    }

    return leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week,
      user: user ? { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo, settings: user.settings as any } : undefined,
    }));
  }

  async approveParlay(parlayId: number, adminId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'approved', approvedBy: adminId, approvedAt: new Date() })
      .where(eq(parlays.id, parlayId))
      .returning();
    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
  }

  async rejectParlay(parlayId: number, adminId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'rejected', approvedBy: adminId, approvedAt: new Date() })
      .where(eq(parlays.id, parlayId))
      .returning();
    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
  }

  async getUserParlayHistory(userId: string, leagueId?: number): Promise<ParlayWithLegs[]> {
    const userParlays = leagueId
      ? await db.select().from(parlays).where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId)))
      : await db.select().from(parlays).where(eq(parlays.userId, userId));

    if (userParlays.length === 0) return [];

    const parlayIds = userParlays.map(p => p.id);
    const weekIds = [...new Set(userParlays.map(p => p.weekId))];

    const [allLegs, allWeeks] = await Promise.all([
      db.select({ leg: parlayLegs, game: games })
        .from(parlayLegs)
        .leftJoin(games, eq(parlayLegs.gameId, games.id))
        .where(inArray(parlayLegs.parlayId, parlayIds)),
      db.select().from(weeks).where(inArray(weeks.id, weekIds)),
    ]);

    const legsByParlayId = new Map<number, (ParlayLeg & { game: Game | null })[]>();
    for (const { leg, game } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({ ...leg, game });
      legsByParlayId.set(leg.parlayId, existing);
    }

    const weekById = new Map(allWeeks.map(w => [w.id, w]));

    return userParlays
      .map(parlay => ({
        ...parlay,
        legs: legsByParlayId.get(parlay.id) ?? [],
        week: weekById.get(parlay.weekId)!,
      }))
      .sort((a, b) => b.week.weekNumber - a.week.weekNumber);
  }

  async getUserLegHistory(userId: string, leagueId?: number): Promise<ParlayLegWithParlayContext[]> {
    // leftJoin (not innerJoin) on users — a leg the caller contributed must never
    // disappear just because the parlay's owner record doesn't resolve (e.g. stale
    // import data). Missing `owner` (when not the caller's own parlay) signals that.
    const rows = await db.select({ leg: parlayLegs, game: games, parlay: parlays, owner: users })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .leftJoin(users, eq(parlays.userId, users.id))
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .where(
        leagueId
          ? and(eq(parlayLegs.userId, userId), eq(parlays.leagueId, leagueId))
          : eq(parlayLegs.userId, userId)
      );

    if (rows.length === 0) return [];

    const weekIds = [...new Set(rows.map(r => r.parlay.weekId))];
    const allWeeks = await db.select().from(weeks).where(inArray(weeks.id, weekIds));
    const weekById = new Map(allWeeks.map(w => [w.id, w]));

    return rows
      .map(({ leg, game, parlay, owner }) => {
        const isOwnParlay = parlay.userId === userId;
        return {
          ...leg,
          game,
          parlay: {
            id: parlay.id,
            weekId: parlay.weekId,
            week: weekById.get(parlay.weekId)!,
            status: parlay.status,
            isOwnParlay,
            owner: isOwnParlay || !owner ? null : { firstName: owner.firstName, email: owner.email, settings: owner.settings as any },
          },
        };
      })
      .sort((a, b) => b.parlay.week.weekNumber - a.parlay.week.weekNumber || a.parlay.id - b.parlay.id);
  }

  async updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string | null; notes?: string | null }[] }): Promise<Parlay> {
    return await db.transaction(async (tx) => {
      const existingLegs = await tx.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
      const validLegIds = new Set(existingLegs.map(l => l.id));

      if (updates.status) {
        await tx.update(parlays).set({ status: updates.status }).where(eq(parlays.id, parlayId));
      }
      
      if (updates.legs) {
        await Promise.all(
          updates.legs.map(async (leg) => {
            if (!validLegIds.has(leg.id)) return;
            const legUpdates: Record<string, unknown> = {};
            if (leg.result !== undefined) legUpdates.result = leg.result;
            if (leg.notes !== undefined) legUpdates.notes = leg.notes;
            if (Object.keys(legUpdates).length > 0) {
              await tx.update(parlayLegs).set(legUpdates).where(eq(parlayLegs.id, leg.id));
            }
          }),
        );
      }

      const [parlay] = await tx.select().from(parlays).where(eq(parlays.id, parlayId));
      return parlay;
    }).then((parlay) => {
      if (!parlay) throw new Error("Parlay not found after update");
      emitLeague(parlay.leagueId, parlay.weekId, "parlays_updated");
      return parlay;
    });
  }

  async getAllLeagueParlays(leagueId: number): Promise<ParlayWithLegs[]> {
    // leftJoin (not innerJoin) — a parlay must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    const leagueParlays = await db.select({ parlay: parlays, user: users })
      .from(parlays)
      .leftJoin(users, eq(parlays.userId, users.id))
      .where(eq(parlays.leagueId, leagueId))
      .orderBy(desc(parlays.createdAt));

    if (leagueParlays.length === 0) return [];

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    const weekIds = [...new Set(leagueParlays.map(({ parlay }) => parlay.weekId))];

    const [allLegs, allWeeks] = await Promise.all([
      // leftJoin (not innerJoin) — a leg must never disappear from the results just
      // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
      // data with a stale owner reference). Missing `user` signals that to callers.
      db.select({ leg: parlayLegs, game: games, legUser: users })
        .from(parlayLegs)
        .leftJoin(games, eq(parlayLegs.gameId, games.id))
        .leftJoin(users, eq(parlayLegs.userId, users.id))
        .where(inArray(parlayLegs.parlayId, parlayIds)),
      db.select().from(weeks).where(inArray(weeks.id, weekIds)),
    ]);

    const legsByParlayId = new Map<number, ParlayWithLegs["legs"]>();
    for (const { leg, game, legUser } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({
        ...leg,
        game,
        user: legUser ? { firstName: legUser.firstName, email: legUser.email, profileImageUrl: legUser.profileImageUrl, isDemo: legUser.isDemo, settings: legUser.settings as any } : undefined,
      });
      legsByParlayId.set(leg.parlayId, existing);
    }
    const weekById = new Map(allWeeks.map(w => [w.id, w]));

    return leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week: weekById.get(parlay.weekId)!,
      user: user ? { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo, settings: user.settings as any } : undefined,
    }));
  }

  async deleteParlay(parlayId: number): Promise<void> {
    const existing = await this.getParlay(parlayId);
    await db.transaction(async (tx) => {
      await tx.delete(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
      await tx.delete(parlays).where(eq(parlays.id, parlayId));
    });
    if (existing) emitLeague(existing.leagueId, existing.weekId, "parlays_updated");
  }

  async deleteParlayLeg(legId: number): Promise<void> {
    await db.delete(parlayLegs).where(eq(parlayLegs.id, legId));
  }

  async updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>>): Promise<ParlayLeg> {
    const [updated] = await db.update(parlayLegs).set(updates).where(eq(parlayLegs.id, legId)).returning();
    return updated;
  }

  async bulkUpdateParlayLegs(legIds: number[], field: keyof Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>, value: string | null): Promise<ParlayLeg[]> {
    return db.update(parlayLegs).set({ [field]: value }).where(inArray(parlayLegs.id, legIds)).returning();
  }

  async addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'> & { userId: string }): Promise<ParlayLeg> {
    const [newLeg] = await db.insert(parlayLegs).values({ ...leg, parlayId }).returning();
    return newLeg;
  }

  async mergeParlays(leagueId: number, targetParlayId: number, sourceParlayIds: number[]): Promise<void> {
    const target = await this.getParlay(targetParlayId);
    if (!target || target.leagueId !== leagueId) throw new Error("Target parlay not found in this league");
    await db.transaction(async (tx) => {
      for (const sourceId of sourceParlayIds) {
        await tx.update(parlayLegs).set({ parlayId: targetParlayId }).where(eq(parlayLegs.parlayId, sourceId));
        await tx.delete(parlays).where(and(eq(parlays.id, sourceId), eq(parlays.leagueId, leagueId)));
      }
    });
    emitLeague(leagueId, target.weekId, "parlays_updated");
  }

  async splitParlayLegs(leagueId: number, parlayId: number, legIds: number[]): Promise<Parlay> {
    const source = await this.getParlay(parlayId);
    if (!source || source.leagueId !== leagueId) throw new Error("Parlay not found in this league");
    if (legIds.length === 0) throw new Error("No legs selected to split");
    const newParlay = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parlays).values({
        userId: source.userId,
        weekId: source.weekId,
        leagueId: source.leagueId,
        status: source.status ?? "pending",
        source: "imported",
      }).returning();
      await tx.update(parlayLegs)
        .set({ parlayId: created.id })
        .where(and(eq(parlayLegs.parlayId, parlayId), inArray(parlayLegs.id, legIds)));
      return created;
    });
    emitLeague(leagueId, source.weekId, "parlays_updated");
    return newParlay;
  }

  async createHistoricalParlay(userId: string, leagueId: number, weekId: number, legs: Array<{ betType: string; pick: string; line?: string | null; odds?: string | null; result?: string | null; playerName?: string | null; propType?: string | null; gameSegment?: string | null; notes?: string | null }>): Promise<Parlay> {
    const newParlay = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parlays).values({
        userId, leagueId, weekId, status: "approved", source: "imported",
      }).returning();
      if (legs.length > 0) {
        await tx.insert(parlayLegs).values(legs.map(leg => ({
          parlayId: created.id,
          userId,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line ?? null,
          odds: leg.odds ?? null,
          result: leg.result ?? null,
          playerName: leg.playerName ?? null,
          propType: leg.propType ?? null,
          gameSegment: leg.gameSegment ?? null,
          notes: leg.notes ?? null,
        })));
      }
      return created;
    });
    emitLeague(leagueId, weekId, "parlays_updated");
    return newParlay;
  }

  // Imports
  async createImportBatch(batch: InsertImportBatch): Promise<ImportBatch> {
    const [newBatch] = await db.insert(importBatches).values(batch).returning();
    return newBatch;
  }

  async createImportedParlay(userId: string, parlay: InsertParlay, legs: ImportParlayLeg[], batchId: number, status: string): Promise<Parlay> {
    return await db.transaction(async (tx) => {
      const [newParlay] = await tx.insert(parlays)
        .values({ ...parlay, userId, source: 'imported', importBatchId: batchId, status })
        .returning();

      if (legs.length > 0) {
        await tx.insert(parlayLegs).values(legs.map(leg => ({
          gameId: leg.gameId ?? null,
          userId,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line,
          odds: (leg as any).odds ?? null,
          gameSegment: (leg as any).gameSegment ?? null,
          result: leg.result,
          playerName: (leg as any).playerName ?? null,
          propType: (leg as any).propType ?? null,
          notes: (leg as any).notes ?? null,
          parlayId: newParlay.id 
        })));
      }

      return newParlay;
    }).then((newParlay) => {
      emitLeague(newParlay.leagueId, newParlay.weekId, "parlays_updated");
      return newParlay;
    });
  }

  /**
   * Compute a parlay's outcome from its legs and update its status to
   * 'win' / 'loss' if all legs are resolved.
   *
   * Rules:
   *  - Skip if status is already a terminal result or is 'rejected'/'void'
   *  - Skip if any leg still has no result
   *  - Any leg = 'loss' → parlay = 'loss'
   *  - Otherwise (all wins, or wins + pushes, zero losses) → parlay = 'win'
   *
   * A parlay only wins if every leg hits; a single push doesn't break that,
   * but a single loss always makes it a loss. 'push' is no longer an
   * automatically-computed parlay status — it remains a manually-settable
   * override for admins, but the rollup never assigns it itself.
   */
  async rollupParlayStatus(parlayId: number): Promise<void> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, parlayId));
    if (!parlay) return;

    const terminalStatuses = ['win', 'loss', 'push', 'rejected', 'void'];
    if (terminalStatuses.includes(parlay.status ?? '')) return;

    const legs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
    if (legs.length === 0) return;
    if (legs.some(l => !l.result)) return; // not all resolved yet

    const newStatus = legs.some(l => l.result === 'loss') ? 'loss' : 'win';

    await db.update(parlays).set({ status: newStatus }).where(eq(parlays.id, parlayId));
  }

  /**
   * Roll up parlay statuses for all parlays in a league (or all leagues if
   * leagueId is omitted).
   *
   * By default, only touches parlays not already in a terminal state — safe
   * to call repeatedly. Pass `recomputeTerminal: true` to also recompute
   * parlays already marked 'win' or 'push' (e.g. a one-time backfill after
   * changing the win/loss rule) — 'rejected'/'void' are never recomputed
   * since those are administrative, not leg-driven. Returns counts of
   * updated vs skipped parlays.
   */
  async rollupLeagueParlayStatuses(leagueId?: number, recomputeTerminal = false): Promise<{ updated: number; skipped: number }> {
    const terminalStatuses = ['win', 'loss', 'push', 'rejected', 'void'];
    const excludedStatuses = recomputeTerminal ? ['rejected', 'void'] : terminalStatuses;

    const allParlays = leagueId
      ? await db.select().from(parlays)
          .where(and(
            eq(parlays.leagueId, leagueId),
            not(inArray(parlays.status as any, excludedStatuses))
          ))
      : await db.select().from(parlays)
          .where(not(inArray(parlays.status as any, excludedStatuses)));

    let updated = 0;
    let skipped = 0;

    for (const parlay of allParlays) {
      const legs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlay.id));
      if (legs.length === 0 || legs.some(l => !l.result)) { skipped++; continue; }

      const newStatus = legs.some(l => l.result === 'loss') ? 'loss' : 'win';

      await db.update(parlays).set({ status: newStatus }).where(eq(parlays.id, parlay.id));
      updated++;
    }

    return { updated, skipped };
  }

  async getLeagueMemberByEmail(leagueId: number, email: string): Promise<LeagueMember | null> {
    const result = await db.select({
      member: leagueMembers
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(and(eq(leagueMembers.leagueId, leagueId), eq(users.email, email.toLowerCase())));
    
    return result.length > 0 ? result[0].member : null;
  }

  async getUserByEmail(email: string): Promise<typeof users.$inferSelect | null> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user || null;
  }

  async addMemberToLeague(leagueId: number, userId: string): Promise<LeagueMember> {
    const existing = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    if (existing.length > 0) return existing[0];
    const [member] = await db.insert(leagueMembers)
      .values({ leagueId, userId, role: 'member' })
      .returning();
    return member;
  }

  async getLeagueImportHistory(leagueId: number): Promise<ImportBatch[]> {
    return await db.select().from(importBatches)
      .where(eq(importBatches.leagueId, leagueId))
      .orderBy(desc(importBatches.uploadedAt));
  }

  async deleteImportBatch(batchId: number, leagueId: number): Promise<void> {
    const batchParlays = await db.select({ id: parlays.id })
      .from(parlays)
      .where(and(eq(parlays.importBatchId, batchId), eq(parlays.leagueId, leagueId)));
    const parlayIds = batchParlays.map(p => p.id);
    if (parlayIds.length > 0) {
      await db.delete(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds));
      await db.delete(parlays).where(inArray(parlays.id, parlayIds));
    }
    await db.delete(importBatches).where(
      and(eq(importBatches.id, batchId), eq(importBatches.leagueId, leagueId))
    );
  }

  async setUserDemoFlag(userId: string, isDemo: boolean): Promise<void> {
    await db.update(users).set({ isDemo }).where(eq(users.id, userId));
  }

  async setLeagueDemoFlag(leagueId: number, isDemo: boolean): Promise<void> {
    await db.update(leagues).set({ isDemo }).where(eq(leagues.id, leagueId));
  }

  async setLeagueDemoWeekData(leagueId: number, useDemoWeekData: boolean): Promise<void> {
    await db.update(leagues).set({ useDemoWeekData }).where(eq(leagues.id, leagueId));
  }

  async updateUserSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
    const [current] = await db.select({ settings: users.settings }).from(users).where(eq(users.id, userId));
    const merged = { ...(current?.settings as Record<string, unknown> || {}), ...settings };
    await db.update(users).set({ settings: merged }).where(eq(users.id, userId));
  }

  // Notifications
  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const rows = await db.select().from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return rows.length;
  }

  async markNotificationRead(id: number, userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async createNotification(data: { userId: string; leagueId?: number; type: string; title: string; message?: string }): Promise<Notification> {
    const [notif] = await db.insert(notifications).values(data).returning();
    emitUser(data.userId, "notifications_updated");
    if (data.leagueId != null) emitLeague(data.leagueId, undefined, "notifications_updated");
    return notif;
  }

  async createLeagueAnnouncement(leagueId: number, title: string, message: string): Promise<void> {
    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    for (const member of members) {
      await db.insert(notifications).values({
        userId: member.userId,
        leagueId,
        type: 'announcement',
        title,
        message,
      });
      emitUser(member.userId, "notifications_updated");
    }
    emitLeague(leagueId, undefined, "notifications_updated");
  }

  async updateLeagueNotificationSettings(leagueId: number, settings: LeagueNotificationSettings): Promise<League> {
    const [updated] = await db.update(leagues)
      .set({ notificationSettings: settings })
      .where(eq(leagues.id, leagueId))
      .returning();
    return updated;
  }

  async getWeekLockStatus(leagueId: number, weekId: number): Promise<WeekLockStatus> {
    // Get all league members (excluding admin for "submitted" check — all members must submit)
    const members = await db.select().from(leagueMembers)
      .where(eq(leagueMembers.leagueId, leagueId));
    const totalMembers = members.length;

    // Count how many have a parlay for this week
    const submitted = await db.select().from(parlays)
      .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));
    const submittedCount = submitted.length;

    // Check for existing lock
    const [lock] = await db.select().from(leagueWeekLocks)
      .where(and(eq(leagueWeekLocks.leagueId, leagueId), eq(leagueWeekLocks.weekId, weekId)));

    return {
      isLocked: !!lock,
      lockedAt: lock?.lockedAt,
      lockedBy: lock?.lockedBy,
      hadMissingBets: lock?.hadMissingBets,
      submittedCount,
      totalMembers,
      allSubmitted: submittedCount >= totalMembers && totalMembers > 0,
    };
  }

  async lockWeekParlay(leagueId: number, weekId: number, userId: string, hadMissingBets: boolean): Promise<LeagueWeekLock> {
    const [lock] = await db.insert(leagueWeekLocks)
      .values({ leagueId, weekId, lockedBy: userId, hadMissingBets })
      .returning();
    emitLeague(leagueId, weekId, "lock_updated");
    return lock;
  }

  async unlockWeekParlay(leagueId: number, weekId: number): Promise<void> {
    await db.delete(leagueWeekLocks)
      .where(and(eq(leagueWeekLocks.leagueId, leagueId), eq(leagueWeekLocks.weekId, weekId)));
    emitLeague(leagueId, weekId, "lock_updated");
  }

  // ─── Enrichment ────────────────────────────────────────────────────────────

  async getUser(userId: string): Promise<typeof users.$inferSelect | null> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user ?? null;
  }

  async findGameByTeams(weekId: number, homeTeam: string, awayTeam: string): Promise<Game | null> {
    const allGames = await db.select().from(games).where(eq(games.weekId, weekId));
    const normalize = (s: string) => s.toLowerCase().trim();
    const h = normalize(homeTeam);
    const a = normalize(awayTeam);

    // Exact match first
    const exact = allGames.find(
      g => normalize(g.homeTeam) === h && normalize(g.awayTeam) === a
    );
    if (exact) return exact;

    // Partial match — e.g. "Chiefs" matches "Kansas City Chiefs"
    const partial = allGames.find(
      g =>
        (normalize(g.homeTeam).includes(h) || h.includes(normalize(g.homeTeam))) &&
        (normalize(g.awayTeam).includes(a) || a.includes(normalize(g.awayTeam)))
    );
    return partial ?? null;
  }

  async upsertGameForImport(weekId: number, homeTeam: string, awayTeam: string, gameDate?: Date): Promise<Game> {
    const existing = await this.findGameByTeams(weekId, homeTeam, awayTeam);
    if (existing) return existing;

    const [created] = await db.insert(games).values({
      weekId,
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      gameTime: gameDate ?? new Date(),
      isFinished: false,
    }).returning();
    return created;
  }

  async getUnenrichedLegs(leagueId?: number): Promise<(ParlayLeg & { game: Game })[]> {
    const rows = await db
      .select({ leg: parlayLegs, game: games })
      .from(parlayLegs)
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(
        leagueId !== undefined
          ? and(eq(parlayLegs.oddsEnriched, false), eq(parlays.leagueId, leagueId))
          : eq(parlayLegs.oddsEnriched, false)
      );

    return rows.map(r => ({ ...r.leg, game: r.game }));
  }

  async enrichParlayLeg(
    legId: number,
    updates: { result?: string | null; line?: string | null; oddsEnriched: boolean }
  ): Promise<void> {
    const set: Record<string, unknown> = { oddsEnriched: updates.oddsEnriched };
    if (updates.result !== undefined) set.result = updates.result;
    if (updates.line !== undefined) set.line = updates.line;
    await db.update(parlayLegs).set(set as any).where(eq(parlayLegs.id, legId));
  }

  async updateGameScores(
    gameId: number,
    homeScore: number,
    awayScore: number,
    isFinished: boolean,
    winner?: string
  ): Promise<void> {
    const w = winner ?? (homeScore > awayScore ? "home" : awayScore > homeScore ? "away" : "tie");
    await db.update(games)
      .set({ homeScore, awayScore, isFinished, winner: w, finishedAt: isFinished ? new Date() : null })
      .where(eq(games.id, gameId));
  }

  /**
   * One-time backfill for games that were finished before `finishedAt` existed.
   * Estimates finish time as kickoff + ~3.5 hours (typical NFL game length) —
   * an approximation, not a recorded fact, so "Parlay Loser" also works for
   * historical parlays instead of only ones resolved from now on.
   */
  async backfillGameFinishedAt(): Promise<{ updated: number }> {
    const rows = await db.select().from(games).where(and(eq(games.isFinished, true), isNull(games.finishedAt)));
    let updated = 0;
    for (const g of rows) {
      if (!g.gameTime) continue;
      const estimate = new Date(new Date(g.gameTime).getTime() + 3.5 * 60 * 60 * 1000);
      await db.update(games).set({ finishedAt: estimate }).where(eq(games.id, g.id));
      updated++;
    }
    return { updated };
  }

  async patchGameOdds(
    gameId: number,
    odds: { spread?: string; overUnder?: string; moneylineHome?: string; moneylineAway?: string }
  ): Promise<void> {
    const set: Record<string, unknown> = {};
    if (odds.spread) set.spread = odds.spread;
    if (odds.overUnder) set.overUnder = odds.overUnder;
    if (odds.moneylineHome) set.moneylineHome = odds.moneylineHome;
    if (odds.moneylineAway) set.moneylineAway = odds.moneylineAway;
    if (Object.keys(set).length === 0) return;
    await db.update(games).set(set as any).where(eq(games.id, gameId));
  }

  // ─── nflverse / Players ─────────────────────────────────────────────────────

  async getWeekBySeasonAndNumber(season: number, weekNumber: number): Promise<Week | null> {
    const [week] = await db.select().from(weeks)
      .where(and(eq(weeks.season, season), eq(weeks.weekNumber, weekNumber)));
    return week ?? null;
  }

  async getGamesForSeasonWeek(season: number, weekNumber: number): Promise<Game[]> {
    const week = await this.getWeekBySeasonAndNumber(season, weekNumber);
    if (!week) return [];
    return db.select().from(games).where(eq(games.weekId, week.id));
  }

  async upsertPlayer(data: Omit<InsertPlayer, 'updatedAt'>): Promise<Player> {
    if (data.nflverseId) {
      const [existing] = await db.select().from(players)
        .where(eq(players.nflverseId, data.nflverseId));
      if (existing) {
        const [updated] = await db.update(players)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(players.id, existing.id))
          .returning();
        return updated;
      }
    }
    const [created] = await db.insert(players)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return created;
  }

  async upsertPlayerWeekStat(data: InsertPlayerWeekStat): Promise<PlayerWeekStat> {
    // Check for existing stat row for this player/season/week
    const [existing] = await db.select().from(playerWeekStats)
      .where(
        and(
          eq(playerWeekStats.playerId, data.playerId),
          eq(playerWeekStats.season, data.season),
          eq(playerWeekStats.week, data.week)
        )
      );

    if (existing) {
      const [updated] = await db.update(playerWeekStats)
        .set(data)
        .where(eq(playerWeekStats.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(playerWeekStats).values(data).returning();
    return created;
  }

  async getPlayerStatsForGame(gameId: number): Promise<(PlayerWeekStat & { player: Player })[]> {
    const [game] = await db.select().from(games).where(eq(games.id, gameId));
    if (!game) return [];

    const [week] = await db.select().from(weeks).where(eq(weeks.id, game.weekId));
    if (!week) return [];

    const rows = await db
      .select({ stat: playerWeekStats, player: players })
      .from(playerWeekStats)
      .innerJoin(players, eq(playerWeekStats.playerId, players.id))
      .where(
        and(
          eq(playerWeekStats.season, week.season),
          eq(playerWeekStats.week, week.weekNumber)
        )
      );

    return rows.map(r => ({ ...r.stat, player: r.player }));
  }

  async getPlayerStatByName(playerName: string, season: number, week: number): Promise<(PlayerWeekStat & { player: Player }) | null> {
    // Normalize a name: lowercase, strip common suffixes (Jr, Sr, II–IV),
    // remove punctuation so "D.K. Metcalf" ≈ "DK Metcalf" and
    // "Odell Beckham Jr." ≈ "Odell Beckham"
    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, "")
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const norm = normalize(playerName);

    // Try exact ilike match on both name columns first (fast DB query)
    const run = async (col: any, pattern: string) => {
      const rows = await db
        .select({ stat: playerWeekStats, player: players })
        .from(playerWeekStats)
        .innerJoin(players, eq(playerWeekStats.playerId, players.id))
        .where(and(ilike(col, `%${pattern}%`), eq(playerWeekStats.season, season), eq(playerWeekStats.week, week)))
        .limit(1);
      return rows.length > 0 ? { ...rows[0].stat, player: rows[0].player } : null;
    };

    // Pass 1: exact name as given
    const r1 = (await run(players.name, playerName)) ?? (await run(players.displayName, playerName));
    if (r1) return r1;

    // Pass 2: normalized name (strips suffixes/punctuation)
    if (norm !== playerName.toLowerCase()) {
      const r2 = (await run(players.name, norm)) ?? (await run(players.displayName, norm));
      if (r2) return r2;
    }

    // Pass 3: each significant word of the name (catches "Henry" matching "Derrick Henry")
    // Only use this if we have at least 2 words to avoid too-broad single-word matches
    const words = norm.split(" ").filter(w => w.length > 2);
    if (words.length >= 2) {
      const lastName = words[words.length - 1]; // most distinctive word
      const candidateRows = await db
        .select({ stat: playerWeekStats, player: players })
        .from(playerWeekStats)
        .innerJoin(players, eq(playerWeekStats.playerId, players.id))
        .where(and(
          ilike(players.displayName, `%${lastName}%`),
          eq(playerWeekStats.season, season),
          eq(playerWeekStats.week, week)
        ))
        .limit(20);

      // Among candidates, find the one whose normalized display name best matches
      for (const row of candidateRows) {
        const candidateNorm = normalize(row.player.displayName ?? row.player.name);
        if (candidateNorm.includes(norm) || norm.includes(candidateNorm)) {
          return { ...row.stat, player: row.player };
        }
      }
    }

    return null;
  }

  async setLegEnrichmentLog(legId: number, log: string): Promise<void> {
    await db.update(parlayLegs).set({ enrichmentLog: log } as any).where(eq(parlayLegs.id, legId));
  }

  // ===== Custom indexes =====

  async createCustomIndex(ownerId: string, input: InsertCustomIndex): Promise<CustomIndex> {
    const [created] = await db.insert(customIndexes)
      .values({
        ownerId,
        displayName: input.displayName,
        scope: input.scope ?? 'private',
        publishedLeagueId: input.scope === 'league' ? input.publishedLeagueId ?? null : null,
        filters: input.filters,
      })
      .returning();
    return created;
  }

  /**
   * Every index the user may see: their own, ones shared with them, and league
   * defaults published in a league they belong to. Deduped, owner-first.
   */
  async listVisibleCustomIndexes(userId: string): Promise<CustomIndexWithAccess[]> {
    const memberships = await db
      .select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userId));
    const myLeagueIds = memberships.map(m => m.leagueId);

    const owned = await db.select().from(customIndexes).where(eq(customIndexes.ownerId, userId));

    const sharedRows = await db.select({ idx: customIndexes })
      .from(customIndexShares)
      .innerJoin(customIndexes, eq(customIndexShares.customIndexId, customIndexes.id))
      .where(eq(customIndexShares.sharedWithUserId, userId));

    const published = myLeagueIds.length > 0
      ? await db.select().from(customIndexes)
          .where(and(eq(customIndexes.scope, 'league'), inArray(customIndexes.publishedLeagueId, myLeagueIds)))
      : [];

    const byId = new Map<number, CustomIndexWithAccess>();
    const add = (idx: CustomIndex, access: CustomIndexWithAccess['access']) => {
      if (byId.has(idx.id)) return; // first writer wins: owner > shared > league
      byId.set(idx.id, { ...idx, isOwner: idx.ownerId === userId, access });
    };

    owned.forEach(i => add(i, 'owner'));
    sharedRows.forEach(r => add(r.idx, 'shared'));
    published.forEach(i => add(i, 'league'));

    // Attach share lists so owners can manage them without an extra round trip
    const ownedIds = owned.map(i => i.id);
    if (ownedIds.length > 0) {
      const shares = await db.select().from(customIndexShares)
        .where(inArray(customIndexShares.customIndexId, ownedIds));
      for (const share of shares) {
        const entry = byId.get(share.customIndexId);
        if (entry) entry.sharedWithUserIds = [...(entry.sharedWithUserIds ?? []), share.sharedWithUserId];
      }
    }

    return Array.from(byId.values());
  }

  async getCustomIndex(id: number): Promise<CustomIndex | undefined> {
    const [row] = await db.select().from(customIndexes).where(eq(customIndexes.id, id));
    return row;
  }

  async updateCustomIndex(id: number, updates: UpdateCustomIndex): Promise<CustomIndex> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.displayName !== undefined) set.displayName = updates.displayName;
    if (updates.filters !== undefined) set.filters = updates.filters;
    if (updates.scope !== undefined) {
      set.scope = updates.scope;
      // Demoting to private clears the publish target so it can't leak league-wide
      set.publishedLeagueId = updates.scope === 'league' ? updates.publishedLeagueId ?? null : null;
    } else if (updates.publishedLeagueId !== undefined) {
      set.publishedLeagueId = updates.publishedLeagueId;
    }

    const [updated] = await db.update(customIndexes)
      .set(set)
      .where(eq(customIndexes.id, id))
      .returning();
    return updated;
  }

  async deleteCustomIndex(id: number): Promise<void> {
    await db.delete(customIndexes).where(eq(customIndexes.id, id));
  }

  async shareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void> {
    await db.insert(customIndexShares)
      .values({ customIndexId, sharedWithUserId })
      .onConflictDoNothing();
  }

  async unshareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void> {
    await db.delete(customIndexShares)
      .where(and(
        eq(customIndexShares.customIndexId, customIndexId),
        eq(customIndexShares.sharedWithUserId, sharedWithUserId),
      ));
  }

  async getCustomIndexShares(customIndexId: number): Promise<string[]> {
    const rows = await db.select({ userId: customIndexShares.sharedWithUserId })
      .from(customIndexShares)
      .where(eq(customIndexShares.customIndexId, customIndexId));
    return rows.map(r => r.userId);
  }

  // ─── Story Studio ──────────────────────────────────────────────────────

  async createStoryReport(userId: string, input: InsertStoryReport): Promise<StoryReport> {
    const [created] = await db.insert(storyReports)
      .values({
        leagueId: input.leagueId,
        weekId: input.weekId,
        userId,
        selectedStory: input.selectedStory,
        thesis: input.thesis,
        tone: input.tone,
      })
      .returning();
    return created;
  }

  async getStoryReportWithSections(id: number): Promise<StoryReportWithSections | undefined> {
    const [report] = await db.select().from(storyReports).where(eq(storyReports.id, id));
    if (!report) return undefined;
    const sections = await db.select().from(storySections)
      .where(eq(storySections.reportId, id))
      .orderBy(storySections.order);
    return { ...report, sections };
  }

  async updateStoryReport(id: number, updates: UpdateStoryReport): Promise<StoryReport> {
    const [updated] = await db.update(storyReports)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(storyReports.id, id))
      .returning();
    return updated;
  }

  async upsertStorySection(
    reportId: number,
    kind: StorySectionKind,
    order: number,
    data: { content?: string; generatedContent?: string; promptVersion?: string },
  ): Promise<StorySection> {
    const [section] = await db.insert(storySections)
      .values({ reportId, kind, order, ...data })
      .onConflictDoUpdate({
        target: [storySections.reportId, storySections.kind],
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return section;
  }

  /** True when both users belong to at least one league in common. */
  async usersShareALeague(userIdA: string, userIdB: string): Promise<boolean> {
    const a = db.select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userIdA));
    const [row] = await db.select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(and(
        eq(leagueMembers.userId, userIdB),
        inArray(leagueMembers.leagueId, a),
      ))
      .limit(1);
    return !!row;
  }
}

export const storage = new DatabaseStorage();
