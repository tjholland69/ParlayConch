import { pgTable, text, serial, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Export users and sessions from auth model
export * from "./models/auth";

export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  adminId: varchar("admin_id").notNull(), // User ID of the league creator/admin
  createdAt: timestamp("created_at").defaultNow(),
});

export const leagueMembers = pgTable("league_members", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: varchar("user_id").notNull(),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const weeks = pgTable("weeks", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  weekNumber: integer("week_number").notNull(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(true),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id").notNull(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  spread: text("spread"),
  gameTime: timestamp("game_time").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isFinished: boolean("is_finished").default(false),
  winner: text("winner"),
  // NFL Reference Data
  nflRefId: text("nfl_ref_id"), // ID from external NFL reference
  venue: text("venue"),
  weather: text("weather"),
});

export const parlays = pgTable("parlays", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  weekId: integer("week_id").notNull(),
  leagueId: integer("league_id").notNull(),
  status: text("status").default('pending'), // 'pending', 'approved', 'win', 'loss', 'push'
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const parlayLegs = pgTable("parlay_legs", {
  id: serial("id").primaryKey(),
  parlayId: integer("parlay_id").notNull(),
  gameId: integer("game_id").notNull(),
  pick: text("pick").notNull(), // 'home' or 'away'
  status: text("status").default('pending'),
});

// Deprecated bets table replaced by parlays/parlayLegs for the new structure
export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  gameId: integer("game_id").notNull(),
  pick: text("pick").notNull(),
  status: text("status").default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertLeagueSchema = createInsertSchema(leagues).omit({ id: true, createdAt: true });
export const insertParlaySchema = createInsertSchema(parlays).omit({ id: true, status: true, createdAt: true });
export const insertParlayLegSchema = createInsertSchema(parlayLegs).omit({ id: true, status: true });

// Types
export type League = typeof leagues.$inferSelect;
export type Parlay = typeof parlays.$inferSelect;
export type ParlayLeg = typeof parlayLegs.$inferSelect;
export type Week = typeof weeks.$inferSelect;
export type Game = typeof games.$inferSelect;

export type ParlayWithLegs = Parlay & { legs: (ParlayLeg & { game: Game })[] };
