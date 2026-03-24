import { db } from "./db";
import {
  weeks, games, bets, users, leagues, leagueMembers, parlays, parlayLegs, importBatches,
  type Week, type Game, type Bet, type InsertBet, type League, type LeagueMember,
  type Parlay, type ParlayLeg, type InsertLeague, type InsertParlay, type InsertParlayLeg,
  type GameWithBet, type BetHistoryItem, type UserStat, type LeagueWithMembers, type ParlayWithLegs,
  type ImportBatch, type InsertImportBatch, type ImportParlayLeg
} from "@shared/schema";
import { eq, and, desc, inArray } from "drizzle-orm";

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
  isLeagueAdmin(leagueId: number, userId: string): Promise<boolean>;

  // Parlays
  getParlay(id: number): Promise<Parlay | undefined>;
  createParlay(userId: string, parlay: InsertParlay, legs: InsertParlayLeg[]): Promise<Parlay>;
  getUserParlayForWeek(userId: string, leagueId: number, weekId: number): Promise<ParlayWithLegs | null>;
  getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]>;
  approveParlay(parlayId: number, adminId: string): Promise<Parlay>;
  rejectParlay(parlayId: number, adminId: string): Promise<Parlay>;
  getUserParlayHistory(userId: string, leagueId?: number): Promise<ParlayWithLegs[]>;
  updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string }[] }): Promise<Parlay>;

  // Imports
  createImportBatch(batch: InsertImportBatch): Promise<ImportBatch>;
  createImportedParlay(userId: string, parlay: InsertParlay, legs: ImportParlayLeg[], batchId: number, status: string): Promise<Parlay>;
  getLeagueImportHistory(leagueId: number): Promise<ImportBatch[]>;
  getLeagueMemberByEmail(leagueId: number, email: string): Promise<LeagueMember | null>;

  // Demo flags
  setUserDemoFlag(userId: string, isDemo: boolean): Promise<void>;
  setLeagueDemoFlag(leagueId: number, isDemo: boolean): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getWeeks(): Promise<Week[]> {
    return await db.select().from(weeks).orderBy(weeks.weekNumber);
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
    const allUsers = await db.select().from(users);
    const allParlays = await db.select().from(parlays);

    return allUsers.map(user => {
      const userParlays = allParlays.filter(p => p.userId === user.id && ['win', 'loss', 'push'].includes(p.status || ''));
      const wins = userParlays.filter(p => p.status === 'win').length;
      const losses = userParlays.filter(p => p.status === 'loss').length;
      const pushes = userParlays.filter(p => p.status === 'push').length;
      const totalDecided = wins + losses;
      const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

      return {
        userId: user.id,
        username: user.firstName || user.email || 'Unknown',
        profileImageUrl: user.profileImageUrl,
        wins,
        losses,
        pushes,
        winRate
      };
    }).sort((a, b) => b.winRate - a.winRate);
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
        username: user.firstName || user.email || 'Unknown',
        profileImageUrl: user.profileImageUrl,
        wins,
        losses,
        pushes,
        winRate
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
    const userLeagues = await db.select().from(leagues).where(inArray(leagues.id, leagueIds));

    const result: LeagueWithMembers[] = [];
    for (const league of userLeagues) {
      const allMembers = await db.select({
        member: leagueMembers,
        user: users
      })
      .from(leagueMembers)
      .innerJoin(users, eq(leagueMembers.userId, users.id))
      .where(eq(leagueMembers.leagueId, league.id));

      const userMembership = memberships.find(m => m.leagueId === league.id);

      result.push({
        ...league,
        members: allMembers.map(m => ({
          ...m.member,
          user: {
            id: m.user.id,
            firstName: m.user.firstName,
            email: m.user.email,
            profileImageUrl: m.user.profileImageUrl
          }
        })),
        memberCount: allMembers.length,
        isAdmin: userMembership?.role === 'admin'
      });
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

  async isLeagueAdmin(leagueId: number, userId: string): Promise<boolean> {
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    return member?.role === 'admin';
  }

  // Parlays
  async getParlay(id: number): Promise<Parlay | undefined> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, id));
    return parlay;
  }

  async createParlay(userId: string, parlay: InsertParlay, legs: InsertParlayLeg[]): Promise<Parlay> {
    // Check if user already has a parlay for this week/league
    const existing = await db.select().from(parlays)
      .where(and(
        eq(parlays.userId, userId),
        eq(parlays.leagueId, parlay.leagueId),
        eq(parlays.weekId, parlay.weekId)
      ));

    let parlayRecord: Parlay;
    
    if (existing.length > 0) {
      // Delete old legs and update parlay
      await db.delete(parlayLegs).where(eq(parlayLegs.parlayId, existing[0].id));
      const [updated] = await db.update(parlays)
        .set({ status: 'pending', createdAt: new Date(), approvedBy: null, approvedAt: null })
        .where(eq(parlays.id, existing[0].id))
        .returning();
      parlayRecord = updated;
    } else {
      const [newParlay] = await db.insert(parlays)
        .values({ ...parlay, userId })
        .returning();
      parlayRecord = newParlay;
    }

    // Insert legs
    for (const leg of legs) {
      await db.insert(parlayLegs).values({ ...leg, parlayId: parlayRecord.id });
    }

    return parlayRecord;
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
    .innerJoin(games, eq(parlayLegs.gameId, games.id))
    .where(eq(parlayLegs.parlayId, parlay.id));

    const [week] = await db.select().from(weeks).where(eq(weeks.id, parlay.weekId));

    return {
      ...parlay,
      legs: legs.map(l => ({ ...l.leg, game: l.game })),
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

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));

    const result: ParlayWithLegs[] = [];
    for (const { parlay, user } of leagueParlays) {
      const legs = await db.select({
        leg: parlayLegs,
        game: games
      })
      .from(parlayLegs)
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .where(eq(parlayLegs.parlayId, parlay.id));

      result.push({
        ...parlay,
        legs: legs.map(l => ({ ...l.leg, game: l.game })),
        week,
        user: { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo }
      });
    }

    return result;
  }

  async approveParlay(parlayId: number, adminId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'approved', approvedBy: adminId, approvedAt: new Date() })
      .where(eq(parlays.id, parlayId))
      .returning();
    return updated;
  }

  async rejectParlay(parlayId: number, adminId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'rejected', approvedBy: adminId, approvedAt: new Date() })
      .where(eq(parlays.id, parlayId))
      .returning();
    return updated;
  }

  async getUserParlayHistory(userId: string, leagueId?: number): Promise<ParlayWithLegs[]> {
    let query = db.select().from(parlays).where(eq(parlays.userId, userId));
    
    const userParlays = leagueId 
      ? await db.select().from(parlays).where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId)))
      : await db.select().from(parlays).where(eq(parlays.userId, userId));

    const result: ParlayWithLegs[] = [];
    for (const parlay of userParlays) {
      const legs = await db.select({
        leg: parlayLegs,
        game: games
      })
      .from(parlayLegs)
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .where(eq(parlayLegs.parlayId, parlay.id));

      const [week] = await db.select().from(weeks).where(eq(weeks.id, parlay.weekId));

      result.push({
        ...parlay,
        legs: legs.map(l => ({ ...l.leg, game: l.game })),
        week
      });
    }

    return result.sort((a, b) => b.week.weekNumber - a.week.weekNumber);
  }

  async updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string }[] }): Promise<Parlay> {
    return await db.transaction(async (tx) => {
      const existingLegs = await tx.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
      const validLegIds = new Set(existingLegs.map(l => l.id));

      if (updates.status) {
        await tx.update(parlays).set({ status: updates.status }).where(eq(parlays.id, parlayId));
      }
      
      if (updates.legs) {
        for (const leg of updates.legs) {
          if (!validLegIds.has(leg.id)) continue;
          if (leg.result !== undefined) {
            await tx.update(parlayLegs).set({ result: leg.result }).where(eq(parlayLegs.id, leg.id));
          }
        }
      }

      const [parlay] = await tx.select().from(parlays).where(eq(parlays.id, parlayId));
      return parlay;
    });
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
          gameId: leg.gameId,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line,
          result: leg.result,
          parlayId: newParlay.id 
        })));
      }

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

  async getLeagueImportHistory(leagueId: number): Promise<ImportBatch[]> {
    return await db.select().from(importBatches)
      .where(eq(importBatches.leagueId, leagueId))
      .orderBy(desc(importBatches.uploadedAt));
  }

  async setUserDemoFlag(userId: string, isDemo: boolean): Promise<void> {
    await db.update(users).set({ isDemo }).where(eq(users.id, userId));
  }

  async setLeagueDemoFlag(leagueId: number, isDemo: boolean): Promise<void> {
    await db.update(leagues).set({ isDemo }).where(eq(leagues.id, leagueId));
  }
}

export const storage = new DatabaseStorage();
