import { db } from "./db";
import {
  weeks, games, bets, users, leagues, leagueMembers, parlays, parlayLegs,
  type Week, type Game, type League, type Parlay, type ParlayWithLegs
} from "@shared/schema";
import { eq, and, desc, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Weeks
  getWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(week: any): Promise<Week>;

  // Games
  getGamesByWeek(weekId: number): Promise<Game[]>;
  createGame(game: any): Promise<Game>;

  // Leagues
  createLeague(adminId: string, name: string): Promise<League>;
  joinLeague(userId: string, inviteCode: string): Promise<League | undefined>;
  getUserLeagues(userId: string): Promise<League[]>;
  getLeagueMembers(leagueId: number): Promise<any[]>;

  // Parlays
  createParlay(userId: string, parlay: any, legs: any[]): Promise<ParlayWithLegs>;
  getParlay(id: number): Promise<ParlayWithLegs | undefined>;
  getUserParlays(userId: string, leagueId?: number): Promise<ParlayWithLegs[]>;
  updateParlayStatus(parlayId: number, status: string, adminNote?: string): Promise<void>;
  
  // Stats
  getStats(leagueId: number): Promise<any[]>;
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

  async getGamesByWeek(weekId: number): Promise<Game[]> {
    return await db.select().from(games).where(eq(games.weekId, weekId));
  }

  async createGame(game: any): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async createLeague(adminId: string, name: string): Promise<League> {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [league] = await db.insert(leagues).values({ name, adminId, inviteCode }).returning();
    await db.insert(leagueMembers).values({ leagueId: league.id, userId: adminId });
    return league;
  }

  async joinLeague(userId: string, inviteCode: string): Promise<League | undefined> {
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, inviteCode));
    if (!league) return undefined;
    
    const existing = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId)));
    
    if (existing.length === 0) {
      await db.insert(leagueMembers).values({ leagueId: league.id, userId });
    }
    return league;
  }

  async getUserLeagues(userId: string): Promise<League[]> {
    const memberships = await db.select().from(leagueMembers).where(eq(leagueMembers.userId, userId));
    if (memberships.length === 0) return [];
    return await db.select().from(leagues).where(inArray(leagues.id, memberships.map(m => m.leagueId)));
  }

  async getLeagueMembers(leagueId: number): Promise<any[]> {
    return await db.select({
      id: users.id,
      firstName: users.firstName,
      email: users.email
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(eq(leagueMembers.leagueId, leagueId));
  }

  async createParlay(userId: string, parlayData: any, legsData: any[]): Promise<ParlayWithLegs> {
    const [parlay] = await db.insert(parlays).values({ ...parlayData, userId }).returning();
    const legs = await Promise.all(legsData.map(async (leg) => {
      const [newLeg] = await db.insert(parlayLegs).values({ ...leg, parlayId: parlay.id }).returning();
      const [game] = await db.select().from(games).where(eq(games.id, leg.gameId));
      return { ...newLeg, game };
    }));
    return { ...parlay, legs };
  }

  async getParlay(id: number): Promise<ParlayWithLegs | undefined> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, id));
    if (!parlay) return undefined;
    const legs = await db.select({
      leg: parlayLegs,
      game: games
    })
    .from(parlayLegs)
    .innerJoin(games, eq(parlayLegs.gameId, games.id))
    .where(eq(parlayLegs.parlayId, parlay.id));
    
    return { ...parlay, legs: legs.map(l => ({ ...l.leg, game: l.game })) };
  }

  async getUserParlays(userId: string, leagueId?: number): Promise<ParlayWithLegs[]> {
    let query = db.select().from(parlays).where(eq(parlays.userId, userId));
    if (leagueId) {
      query = db.select().from(parlays).where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId)));
    }
    const userParlays = await query;
    return await Promise.all(userParlays.map(async (p) => {
      const legs = await db.select({
        leg: parlayLegs,
        game: games
      })
      .from(parlayLegs)
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .where(eq(parlayLegs.parlayId, p.id));
      return { ...p, legs: legs.map(l => ({ ...l.leg, game: l.game })) };
    }));
  }

  async updateParlayStatus(parlayId: number, status: string, adminNote?: string): Promise<void> {
    await db.update(parlays).set({ status, adminNote }).where(eq(parlays.id, parlayId));
  }

  async getStats(leagueId: number): Promise<any[]> {
    const members = await this.getLeagueMembers(leagueId);
    const parlayResults = await db.select().from(parlays).where(eq(parlays.leagueId, leagueId));
    
    return members.map(member => {
      const userParlays = parlayResults.filter(p => p.userId === member.id);
      const wins = userParlays.filter(p => p.status === 'win').length;
      const losses = userParlays.filter(p => p.status === 'loss').length;
      return {
        userId: member.id,
        username: member.firstName || member.email,
        wins,
        losses,
        winRate: (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0
      };
    }).sort((a, b) => b.winRate - a.winRate);
  }
}

export const storage = new DatabaseStorage();
