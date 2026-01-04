import { db } from "./db";
import {
  weeks, games, bets, users,
  type Week, type Game, type Bet, type InsertBet,
  type GameWithBet, type BetHistoryItem, type UserStat
} from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authStorage } from "./replit_integrations/auth";

export interface IStorage {
  // Weeks
  getWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(week: any): Promise<Week>; // For seeding

  // Games
  getGamesByWeek(weekId: number, userId?: string): Promise<GameWithBet[]>;
  createGame(game: any): Promise<Game>; // For seeding

  // Bets
  createBet(userId: string, bet: InsertBet): Promise<Bet>;
  getBetHistory(userId: string): Promise<BetHistoryItem[]>;
  
  // Stats
  getStats(): Promise<UserStat[]>;
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

    const userBets = await db.select().from(bets)
      .where(and(eq(bets.userId, userId)));
    
    // Map bets to games
    return weekGames.map(game => {
      const bet = userBets.find(b => b.gameId === game.id);
      return { ...game, userBet: bet };
    });
  }

  async createGame(game: any): Promise<Game> {
    const [newGame] = await db.insert(games).values(game).returning();
    return newGame;
  }

  async createBet(userId: string, insertBet: InsertBet): Promise<Bet> {
    // Upsert bet (replace if exists for this game/user)
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
    // Join users with bets to calc stats
    // This is a simplified version, ideally would do aggregation in SQL
    const allUsers = await db.select().from(users);
    const allBets = await db.select().from(bets);

    return allUsers.map(user => {
      const userBets = allBets.filter(b => b.userId === user.id && b.status !== 'pending');
      const wins = userBets.filter(b => b.status === 'win').length;
      const losses = userBets.filter(b => b.status === 'loss').length;
      const pushes = userBets.filter(b => b.status === 'push').length;
      const totalDecided = wins + losses;
      const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

      return {
        userId: user.id,
        username: user.firstName || user.email || 'Unknown', // Fallback
        wins,
        losses,
        pushes,
        winRate
      };
    }).sort((a, b) => b.winRate - a.winRate);
  }
}

export const storage = new DatabaseStorage();
