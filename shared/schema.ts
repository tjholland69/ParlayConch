import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, real, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Export users and sessions from auth model
export * from "./models/auth";

export type LieutenantPermissions = {
  // Parlay management
  approveRejectParlays: boolean;
  editParlays: boolean;
  lockParlay: boolean;
  unlockParlay: boolean;
  unselectUserPick: boolean;
  // Member management
  approveMemberInvites: boolean;
  // Data / admin
  importHistory: boolean;
  markLeagueDemo: boolean;
  // NOTE: suspendMembers and setLieutenant are NEVER grantable to lieutenants — admin-only always
};

export const DEFAULT_LIEUTENANT_PERMISSIONS: LieutenantPermissions = {
  approveRejectParlays: true,
  editParlays: false,
  lockParlay: false,
  unlockParlay: false,
  unselectUserPick: false,
  approveMemberInvites: false,
  importHistory: false,
  markLeagueDemo: false,
};

export type UserNotificationPreferences = {
  email: boolean;
  sms: boolean;
  push: boolean;
  phone?: string;
};

export type UserSettings = {
  displayName?: string;
  notificationPreferences?: UserNotificationPreferences;
  skipImportInstructions?: boolean;
};

export type LeagueNotificationSettings = {
  scheduledReminders: boolean;
  reminderDaysBeforeDeadline: number;
  reminderMessage: string;
};

export const DEFAULT_LEAGUE_NOTIFICATION_SETTINGS: LeagueNotificationSettings = {
  scheduledReminders: false,
  reminderDaysBeforeDeadline: 2,
  reminderMessage: "Don't forget to submit your picks this week!",
};

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
  spreadOdds: text("spread_odds"),
  overUnder: text("over_under"),
  overOdds: text("over_odds"),
  underOdds: text("under_odds"),
  moneylineHome: text("moneyline_home"),
  moneylineAway: text("moneyline_away"),
  gameTime: timestamp("game_time").notNull(),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isFinished: boolean("is_finished").default(false),
  winner: text("winner"),
  venue: text("venue"),
  weather: text("weather"),
  homeRecord: text("home_record"),
  awayRecord: text("away_record"),
});

// Leagues - groups of users
export const leagues = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  inviteCode: text("invite_code").notNull().unique(),
  maxParlaysPerWeek: integer("max_parlays_per_week").default(1),
  minLegsPerParlay: integer("min_legs_per_parlay").default(3),
  maxLegsPerParlay: integer("max_legs_per_parlay").default(5),
  isDemo: boolean("is_demo").default(false),
  lieutenantPermissions: jsonb("lieutenant_permissions").$type<LieutenantPermissions>(),
  notificationSettings: jsonb("notification_settings").$type<LeagueNotificationSettings>(),
  createdAt: timestamp("created_at").defaultNow(),
});

// League memberships
export const leagueMembers = pgTable("league_members", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  userId: varchar("user_id").notNull(),
  role: text("role").default("member"), // 'admin', 'member'
  joinedAt: timestamp("joined_at").defaultNow(),
});

// Import batches - tracks CSV imports
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(),
  originalFilename: text("original_filename").notNull(),
  recordCount: integer("record_count").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Parlays - a user's weekly pick (replaces individual bets)
export const parlays = pgTable("parlays", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  leagueId: integer("league_id").notNull(),
  weekId: integer("week_id").notNull(),
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected', 'win', 'loss', 'push'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("live"), // 'live', 'imported'
  importBatchId: integer("import_batch_id"),
});

// Parlay legs - individual picks within a parlay
export const parlayLegs = pgTable("parlay_legs", {
  id: serial("id").primaryKey(),
  parlayId: integer("parlay_id").notNull(),
  gameId: integer("game_id").notNull(),
  betType: text("bet_type").notNull(), // 'spread', 'moneyline', 'over', 'under'
  pick: text("pick").notNull(), // 'home', 'away', 'over', 'under'
  line: text("line"), // The line at time of pick (approximate if auto-filled)
  result: text("result"), // 'win', 'loss', 'push', null
  oddsEnriched: boolean("odds_enriched").default(false), // true once odds/result have been auto-resolved
});

// Parlay week locks — tracks when a Parlay Maestro locks a week's submissions
export const leagueWeekLocks = pgTable("league_week_locks", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").notNull(),
  weekId: integer("week_id").notNull(),
  lockedBy: varchar("locked_by").notNull(),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  hadMissingBets: boolean("had_missing_bets").notNull().default(false),
});

// In-app notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  leagueId: integer("league_id"),
  type: text("type").notNull(), // 'announcement', 'parlay_approved', 'parlay_rejected', 'reminder', 'system'
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Legacy bets table (keep for backward compatibility)
export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  gameId: integer("game_id").notNull(),
  pick: text("pick").notNull(),
  status: text("status").default('pending'),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertLeagueWeekLockSchema = createInsertSchema(leagueWeekLocks).omit({ id: true, lockedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, isRead: true, createdAt: true });
export const insertWeekSchema = createInsertSchema(weeks).omit({ id: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export const insertBetSchema = createInsertSchema(bets).omit({ id: true, userId: true, status: true, createdAt: true });

export const insertLeagueSchema = createInsertSchema(leagues).omit({ id: true, inviteCode: true, createdAt: true });
export const insertLeagueMemberSchema = createInsertSchema(leagueMembers).omit({ id: true, joinedAt: true });
export const insertParlaySchema = createInsertSchema(parlays).omit({ id: true, userId: true, status: true, approvedBy: true, approvedAt: true, createdAt: true, source: true, importBatchId: true });
export const insertParlayLegSchema = createInsertSchema(parlayLegs).omit({ id: true, result: true });
export const insertImportBatchSchema = createInsertSchema(importBatches).omit({ id: true, uploadedAt: true });

// ─── nflverse / Player data ────────────────────────────────────────────────

// NFL players referenced in bets (populated by nflverse sync)
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  nflverseId: text("nflverse_id").unique(), // e.g. "00-0023459" (GSIS ID)
  name: text("name").notNull(),
  displayName: text("display_name"),
  position: text("position"), // QB, WR, RB, TE, K, DEF, etc.
  team: text("team"), // current team abbreviation (e.g. "KC")
  headshot: text("headshot"), // URL from nflverse
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Weekly player stats — only stored for players in games that were bet on
export const playerWeekStats = pgTable("player_week_stats", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull(),
  season: integer("season").notNull(),
  week: integer("week").notNull(),
  seasonType: text("season_type").default("REG"), // REG, POST, PRE
  team: text("team"),
  // Passing
  completions: integer("completions"),
  attempts: integer("attempts"),
  passingYards: integer("passing_yards"),
  passingTds: integer("passing_tds"),
  interceptions: integer("interceptions"),
  passerRating: real("passer_rating"),
  // Rushing
  carries: integer("carries"),
  rushingYards: integer("rushing_yards"),
  rushingTds: integer("rushing_tds"),
  // Receiving
  receptions: integer("receptions"),
  targets: integer("targets"),
  receivingYards: integer("receiving_yards"),
  receivingTds: integer("receiving_tds"),
  // Scoring / Fantasy
  fantasyPoints: real("fantasy_points"),
  fantasyPointsPpr: real("fantasy_points_ppr"),
});

export const insertPlayerSchema = createInsertSchema(players).omit({ id: true, updatedAt: true });
export const insertPlayerWeekStatSchema = createInsertSchema(playerWeekStats).omit({ id: true });

export type Player = typeof players.$inferSelect;
export type PlayerWeekStat = typeof playerWeekStats.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type InsertPlayerWeekStat = z.infer<typeof insertPlayerWeekStatSchema>;

// Types
export type Week = typeof weeks.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Bet = typeof bets.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type League = typeof leagues.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type Parlay = typeof parlays.$inferSelect;
export type ParlayLeg = typeof parlayLegs.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;

export type LeagueWeekLock = typeof leagueWeekLocks.$inferSelect;
export type InsertLeagueWeekLock = z.infer<typeof insertLeagueWeekLockSchema>;

export type WeekLockStatus = {
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  hadMissingBets?: boolean;
  submittedCount: number;
  totalMembers: number;
  allSubmitted: boolean;
};

export type InsertBet = z.infer<typeof insertBetSchema>;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type InsertParlay = z.infer<typeof insertParlaySchema>;
export type InsertParlayLeg = z.infer<typeof insertParlayLegSchema>;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
export type ImportParlayLeg = Omit<InsertParlayLeg, 'parlayId'> & { result?: string | null };

// API Response Types
export type GameWithBet = Game & { userBet?: Bet };
export type BetHistoryItem = Bet & { game: Game, week: Week };
export type UserStat = {
  userId: string;
  username: string;
  profileImageUrl?: string | null;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
};

export type LeagueMemberWithUser = LeagueMember & {
  user: { id: string; firstName?: string | null; email?: string | null; profileImageUrl?: string | null; isDemo?: boolean | null };
};

export type LeagueWithMembers = League & {
  members: LeagueMemberWithUser[];
  memberCount: number;
  isAdmin: boolean;
  isLieutenant: boolean;
};

export type ParlayWithLegs = Parlay & {
  legs: (ParlayLeg & { game: Game })[];
  week: Week;
  user?: { firstName?: string | null; email?: string | null; profileImageUrl?: string | null; isDemo?: boolean | null };
};

export type LeagueStats = {
  leagueId: number;
  leagueName: string;
  standings: UserStat[];
};
