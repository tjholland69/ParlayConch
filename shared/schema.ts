import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Export users and sessions from auth model
export * from "./models/auth";

export const weeks = pgTable("weeks", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  weekNumber: integer("week_number").notNull(),
  label: text("label").notNull(), // e.g. "Week 1", "Wild Card"
  isActive: boolean("is_active").default(true),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  spread: text("spread"), // e.g. "-3.5"
  gameTime: timestamp("game_time").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isFinished: boolean("is_finished").default(false),
  winner: text("winner"), // 'home', 'away', 'push'
});

export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(), // Links to auth users.id
  gameId: integer("game_id").notNull(),
  pick: text("pick").notNull(), // 'home' or 'away'
  status: text("status").default('pending'), // 'pending', 'win', 'loss', 'push'
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertWeekSchema = createInsertSchema(weeks).omit({ id: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export const insertBetSchema = createInsertSchema(bets).omit({ id: true, userId: true, status: true, createdAt: true });

// Types
export type Week = typeof weeks.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type InsertBet = z.infer<typeof insertBetSchema>;

// API Response Types
export type GameWithBet = Game & { userBet?: Bet };
export type BetHistoryItem = Bet & { game: Game, week: Week };
export type UserStat = {
  userId: string;
  username: string;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
};
