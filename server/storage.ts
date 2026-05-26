import { db } from "./db";
import {
  weeks, games, bets, users, leagues, leagueMembers, parlays, parlayLegs, importBatches, notifications, leagueWeekLocks,
  players, playerWeekStats,
  type Week, type Game, type Bet, type InsertBet, type League, type LeagueMember,
  type Parlay, type ParlayLeg, type InsertLeague, type InsertParlay, type InsertParlayLeg,
  type GameWithBet, type BetHistoryItem, type UserStat, type LeagueWithMembers, type ParlayWithLegs,
  type ImportBatch, type InsertImportBatch, type ImportParlayLeg,
  type LieutenantPermissions, type LeagueMemberWithUser, DEFAULT_LIEUTENANT_PERMISSIONS,
  type Notification, type LeagueNotificationSettings,
  type LeagueWeekLock, type WeekLockStatus,
  type Player, type PlayerWeekStat, type InsertPlayer, type InsertPlayerWeekStat,
} from "@shared/schema";
import { eq, and, desc, inArray, sql, ilike } from "drizzle-orm";
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

  // Games
  getGamesByWeek(weekId: number, userId?: string): Promise<GameWithBet[]>;
  createGame(game: any): Promise<Game>;
  getGame(id: number): Promise<Game | undefined>;

  // Bets (legacy)
  createBet(userId: string, bet: InsertBet): Promise<Bet>;
  getBetHistory(userId: string): Promise<BetHistoryItem[]>;
  
  // Stats
  getStats(): Promise<UserStat[]>;
  getLeagueStats(leagueId: number): Promise<UserStat[]>;

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
  updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay'>>): Promise<League>;
  updateLieutenantPermissions(leagueId: number, permissions: LieutenantPermissions): Promise<League>;
  setMemberRole(leagueId: number, userId: string, role: string): Promise<LeagueMember>;
  getLieutenants(leagueId: number): Promise<LeagueMemberWithUser[]>;
  removeLeagueMember(leagueId: number, userId: string): Promise<void>;
  transferLeagueAdmin(leagueId: number, fromUserId: string, toUserId: string): Promise<void>;

  // Parlays
  getParlay(id: number): Promise<Parlay | undefined>;
  createParlay(userId: string, parlay: InsertParlay, legs: InsertParlayLeg[]): Promise<Parlay>;
  getUserParlayForWeek(userId: string, leagueId: number, weekId: number): Promise<ParlayWithLegs | null>;
  getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]>;
  getAllLeagueParlays(leagueId: number): Promise<ParlayWithLegs[]>;
  approveParlay(parlayId: number, adminId: string): Promise<Parlay>;
  rejectParlay(parlayId: number, adminId: string): Promise<Parlay>;
  getUserParlayHistory(userId: string, leagueId?: number): Promise<ParlayWithLegs[]>;
  updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string | null; notes?: string | null }[] }): Promise<Parlay>;
  deleteParlay(parlayId: number): Promise<void>;
  deleteParlayLeg(legId: number): Promise<void>;
  updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment'>>): Promise<ParlayLeg>;
  addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'>): Promise<ParlayLeg>;
  mergeParlays(leagueId: number, targetParlayId: number, sourceParlayIds: number[]): Promise<void>;

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

  async getLeagueStats(leagueId: number): Promise<UserStat[]> {
    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    const memberIds = members.map(m => m.userId);
    
    if (memberIds.length === 0) return [];

    const memberUsers = await db.select().from(users).where(inArray(users.id, memberIds));
    const leagueParlays = await db.select().from(parlays).where(eq(parlays.leagueId, leagueId));

    return memberUsers.map(user => {
      const userParlays = leagueParlays.filter(p => p.userId === user.id && ['win', 'loss', 'push'].includes(p.status || ''));
      const wins = userParlays.filter(p => p.status === 'win').length;
      const losses = userParlays.filter(p => p.status === 'loss').length;
      const pushes = userParlays.filter(p => p.status === 'push').length;
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
            isDemo: m.user.isDemo
          }
        })),
        memberCount: members.length,
        isAdmin: userMembership?.role === 'admin',
        isLieutenant: userMembership?.role === 'lieutenant',
      };
    });
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

  async updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay' | 'insightsEnabled'>>): Promise<League> {
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

  async createParlay(userId: string, parlay: InsertParlay, legs: InsertParlayLeg[]): Promise<Parlay> {
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
          .values(legs.map((leg) => ({ ...leg, parlayId: parlayRecord.id })));
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
    const leagueParlays = await db.select({
      parlay: parlays,
      user: users
    })
    .from(parlays)
    .innerJoin(users, eq(parlays.userId, users.id))
    .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

    if (leagueParlays.length === 0) return [];

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    const allLegs = await db.select({ leg: parlayLegs, game: games })
      .from(parlayLegs)
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .where(inArray(parlayLegs.parlayId, parlayIds));

    const legsByParlayId = new Map<number, (ParlayLeg & { game: Game | null })[]>();
    for (const { leg, game } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({ ...leg, game });
      legsByParlayId.set(leg.parlayId, existing);
    }

    return leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week,
      user: { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo }
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
    const leagueParlays = await db.select({ parlay: parlays, user: users })
      .from(parlays)
      .innerJoin(users, eq(parlays.userId, users.id))
      .where(eq(parlays.leagueId, leagueId))
      .orderBy(desc(parlays.createdAt));

    if (leagueParlays.length === 0) return [];

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    const weekIds = [...new Set(leagueParlays.map(({ parlay }) => parlay.weekId))];

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

    return leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week: weekById.get(parlay.weekId)!,
      user: { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo, settings: user.settings as any },
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

  async updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment'>>): Promise<ParlayLeg> {
    const [updated] = await db.update(parlayLegs).set(updates).where(eq(parlayLegs.id, legId)).returning();
    return updated;
  }

  async addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'>): Promise<ParlayLeg> {
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
      .set({ homeScore, awayScore, isFinished, winner: w })
      .where(eq(games.id, gameId));
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
    const run = async (col: any) => {
      const rows = await db
        .select({ stat: playerWeekStats, player: players })
        .from(playerWeekStats)
        .innerJoin(players, eq(playerWeekStats.playerId, players.id))
        .where(and(ilike(col, `%${playerName}%`), eq(playerWeekStats.season, season), eq(playerWeekStats.week, week)))
        .limit(1);
      return rows.length > 0 ? { ...rows[0].stat, player: rows[0].player } : null;
    };
    return (await run(players.name)) ?? (await run(players.displayName));
  }

  async setLegEnrichmentLog(legId: number, log: string): Promise<void> {
    await db.update(parlayLegs).set({ enrichmentLog: log } as any).where(eq(parlayLegs.id, legId));
  }
}

export const storage = new DatabaseStorage();
