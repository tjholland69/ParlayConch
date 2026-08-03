import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

// Export users and sessions from auth model
export * from "./models/auth";
export * from "./models/chat";

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

export type UserRegion = {
  continent: string; // "US" | "North & Central America" | "South America" | "Europe" | "Africa" | "Asia" | "Oceania"
  place: string; // state name if continent === "US", else country name
};

export type UserSettings = {
  displayName?: string;
  notificationPreferences?: UserNotificationPreferences;
  skipImportInstructions?: boolean;
  primaryColor?: string;
  region?: UserRegion | null;
  theme?: "dark" | "light" | "system";
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
  isActive: boolean("is_active").default(false),
});

export const games = pgTable("games", {
  id: serial("id").primaryKey(),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  spread: text("spread"),
  spreadOdds: text("spread_odds"),
  overUnder: text("over_under"),
  overOdds: text("over_odds"),
  underOdds: text("under_odds"),
  moneylineHome: text("moneyline_home"),
  moneylineAway: text("moneyline_away"),
  gameTime: timestamp("game_time"),
  homeScore: integer("home_score"),
  awayScore: integer("away_score"),
  isFinished: boolean("is_finished").default(false),
  // Approximate "bust moment" for a leg tied to this game — stamped when we learn
  // (via the periodic score sync) that the game finished, not the true real-time
  // final whistle. Used to order which leg busted first within a losing parlay.
  finishedAt: timestamp("finished_at"),
  winner: text("winner"),
  venue: text("venue"),
  weather: text("weather"),
  homeRecord: text("home_record"),
  awayRecord: text("away_record"),
}, (table) => [
  index("games_week_id_idx").on(table.weekId),
]);

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
  useDemoWeekData: boolean("use_demo_week_data").default(false),
  insightsEnabled: boolean("insights_enabled").default(false),
  lieutenantPermissions: jsonb("lieutenant_permissions").$type<LieutenantPermissions>(),
  notificationSettings: jsonb("notification_settings").$type<LeagueNotificationSettings>(),
  // What to call the member whose bet busts first each losing week: 'parlay_loser' or 'asshole'.
  loserLabel: text("loser_label").default("parlay_loser"),
  createdAt: timestamp("created_at").defaultNow(),
});

// League memberships
export const leagueMembers = pgTable("league_members", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: text("role").default("member"), // 'admin', 'member'
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("league_members_league_id_idx").on(table.leagueId),
  index("league_members_user_id_idx").on(table.userId),
]);

// Import batches - tracks CSV imports
export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  uploadedBy: varchar("uploaded_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  originalFilename: text("original_filename").notNull(),
  recordCount: integer("record_count").default(0),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

// Parlays - a user's weekly pick (replaces individual bets)
export const parlays = pgTable("parlays", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "restrict" }),
  status: text("status").default("pending"), // 'pending', 'approved', 'rejected', 'win', 'loss', 'push'
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("live"), // 'live', 'imported'
  importBatchId: integer("import_batch_id").references(() => importBatches.id, {
    onDelete: "set null",
  }),
}, (table) => [
  uniqueIndex("parlays_user_league_week_uidx").on(table.userId, table.leagueId, table.weekId),
  index("parlays_league_week_idx").on(table.leagueId, table.weekId),
]);

// Valid player prop types for reference
export const PLAYER_PROP_TYPES = [
  // Rushing
  { value: "rush_yards",       label: "Rushing Yards" },
  { value: "rush_tds",         label: "Rushing TDs" },
  { value: "rush_attempts",    label: "Rush Attempts" },
  // Receiving
  { value: "rec_yards",        label: "Receiving Yards" },
  { value: "rec_tds",          label: "Receiving TDs" },
  { value: "receptions",       label: "Receptions" },
  // Passing
  { value: "pass_yards",       label: "Passing Yards" },
  { value: "pass_tds",         label: "Passing TDs" },
  { value: "pass_attempts",    label: "Pass Attempts" },
  { value: "pass_completions", label: "Pass Completions" },
  { value: "interceptions",    label: "Interceptions Thrown" },
  // Scoring
  { value: "anytime_td",       label: "Anytime TD Scorer" },
  { value: "first_td",         label: "First TD Scorer" },
  { value: "last_td",          label: "Last TD Scorer" },
  // Kicking
  { value: "kicking_pts",      label: "Kicking Points" },
  { value: "fg_made",          label: "Field Goals Made" },
  // Defense
  { value: "sacks",            label: "Sacks" },
  { value: "tackles",          label: "Tackles" },
] as const;

export type PlayerPropType = typeof PLAYER_PROP_TYPES[number]["value"];

// Parlay legs - individual picks within a parlay
export const parlayLegs = pgTable("parlay_legs", {
  id: serial("id").primaryKey(),
  parlayId: integer("parlay_id")
    .notNull()
    .references(() => parlays.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // league member who contributed this leg — distinct from parlays.userId (the orchestrator)
  gameId: integer("game_id").references(() => games.id, { onDelete: "set null" }), // nullable — player prop bets may not reference a specific game
  betType: text("bet_type").notNull(), // 'spread', 'moneyline', 'over', 'under', 'player_prop'
  pick: text("pick").notNull(), // 'home', 'away', 'over', 'under', 'yes', 'no'
  line: text("line"), // Spread/total value at time of pick (e.g. -3.5 for spread, 47.5 for total; blank for moneyline)
  odds: text("odds"), // American-style odds at time of pick (e.g. -110, +130); stored separately from the line value
  gameSegment: text("game_segment"), // Optional game portion the bet applies to (e.g. 'First Half', 'Second Quarter')
  result: text("result"), // 'win', 'loss', 'push', null
  oddsEnriched: boolean("odds_enriched").default(false), // true once odds/result have been auto-resolved
  playerName: text("player_name"), // for player_prop bets: the player's name
  propType: text("prop_type"),     // for player_prop bets: the prop category (e.g. 'rush_yards')
  notes: text("notes"),            // free-text note, display only
  enrichmentLog: text("enrichment_log"), // JSON: { at, changes, warnings, errors } — last data-fetch attempt
}, (table) => [
  index("parlay_legs_parlay_id_idx").on(table.parlayId),
  index("parlay_legs_user_id_idx").on(table.userId),
]);

// Parlay week locks — tracks when a Parlay Maestro locks a week's submissions
export const leagueWeekLocks = pgTable("league_week_locks", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  lockedBy: varchar("locked_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lockedAt: timestamp("locked_at").notNull().defaultNow(),
  hadMissingBets: boolean("had_missing_bets").notNull().default(false),
});

// In-app notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  leagueId: integer("league_id").references(() => leagues.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'announcement', 'parlay_approved', 'parlay_rejected', 'reminder', 'system'
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
]);

// ─── Custom Indexes ────────────────────────────────────────────────────────
// A named, saved definition of a comparison line ("index") that can be overlaid
// on performance graphs. Private to its owner by default; can be shared with
// specific users, or published league-wide by a Parlay Maestro.

export type CustomIndexFilters = {
  leagueIds: number[];       // empty = all of the creator's leagues
  memberUserIds: string[];   // whose bets aggregate into the comparison line; empty = all members of leagueIds
  betTypes: string[];        // subset of 'spread' | 'moneyline' | 'over' | 'under' | 'player_prop'; empty = all
  propTypes?: string[];      // subset of PLAYER_PROP_TYPES values; empty/undefined = all
  playerName?: string;       // case-insensitive substring match
  teamName?: string;         // case-insensitive match against home/away team or player's team
};

export const customIndexes = pgTable("custom_indexes", {
  id: serial("id").primaryKey(),
  ownerId: varchar("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  scope: text("scope").default("private"), // 'private', 'league'
  publishedLeagueId: integer("published_league_id").references(() => leagues.id, { onDelete: "cascade" }),
  filters: jsonb("filters").$type<CustomIndexFilters>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("custom_indexes_owner_id_idx").on(table.ownerId),
  index("custom_indexes_published_league_id_idx").on(table.publishedLeagueId),
]);

export const customIndexShares = pgTable("custom_index_shares", {
  id: serial("id").primaryKey(),
  customIndexId: integer("custom_index_id")
    .notNull()
    .references(() => customIndexes.id, { onDelete: "cascade" }),
  sharedWithUserId: varchar("shared_with_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("custom_index_shares_uidx").on(table.customIndexId, table.sharedWithUserId),
  index("custom_index_shares_user_id_idx").on(table.sharedWithUserId),
]);

// ─── Story Studio ──────────────────────────────────────────────────────────
// One editorial session per (league, week): a user-authored weekly report
// assembled from deterministic analytics + AI-drafted, user-edited sections.

// Analytics / Story Discovery data contracts — deterministic only, no
// generated prose. Computed on demand from bet data, never persisted on
// their own, so they always reflect the latest results for a week.

export type WeeklyMemberStanding = {
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number | null;
  currentStreak: { kind: "win" | "loss"; length: number } | null;
};

export type AnalyticsReport = {
  leagueId: number;
  leagueName: string;
  weekId: number;
  weekLabel: string;
  totalLegsDecided: number;
  leagueWinRate: number | null;
  favoritePickRate: number | null; // share of decided legs that picked the favorite (negative spread/moneyline)
  underdogPickRate: number | null;
  trailingFavoritePickRate: number | null; // trailing 4-week league average, for outlier comparison
  standings: WeeklyMemberStanding[]; // sorted best win rate first
  bestPerformer: WeeklyMemberStanding | null;
  worstPerformer: WeeklyMemberStanding | null;
  pickDistribution: Record<string, number>; // betType -> count
};

export type StoryCandidate = {
  id: string; // stable slug for this candidate kind, e.g. "underdog-surge"
  title: string;
  summary: string;
  supportingEvidence: string[];
  confidence: number; // 0-100, derived from a documented z-score-style formula — not fabricated
};

export const STORY_SECTION_KINDS = ["headline", "opening", "winnerSummary", "closing"] as const;
export type StorySectionKind = typeof STORY_SECTION_KINDS[number];

export const storyReports = pgTable("story_reports", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // Full candidate snapshot at selection time (title/summary/evidence/confidence) —
  // preserved even if the underlying analytics later change (e.g. more legs graded).
  selectedStory: jsonb("selected_story").$type<StoryCandidate>().notNull(),
  thesis: text("thesis").notNull(),
  tone: text("tone").notNull(), // 'hype', 'analytical', 'snarky', 'straightforward'
  status: text("status").notNull().default("draft"), // 'draft', 'published'
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("story_reports_league_week_idx").on(table.leagueId, table.weekId),
  index("story_reports_user_id_idx").on(table.userId),
]);

export const storySections = pgTable("story_sections", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id")
    .notNull()
    .references(() => storyReports.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // one of STORY_SECTION_KINDS
  order: integer("order").notNull(),
  content: text("content"), // current (possibly user-edited) text shown to the user
  generatedContent: text("generated_content"), // last raw AI output, for diff/revert
  promptVersion: text("prompt_version"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("story_sections_report_kind_uidx").on(table.reportId, table.kind),
]);

export const insertStoryReportSchema = createInsertSchema(storyReports).omit({
  id: true, userId: true, status: true, createdAt: true, updatedAt: true,
});
export const updateStoryReportSchema = z.object({
  thesis: z.string().min(1).optional(),
  tone: z.string().min(1).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

export type StoryReport = typeof storyReports.$inferSelect;
export type InsertStoryReport = z.infer<typeof insertStoryReportSchema>;
export type UpdateStoryReport = z.infer<typeof updateStoryReportSchema>;
export type StorySection = typeof storySections.$inferSelect;
export type StoryReportWithSections = StoryReport & { sections: StorySection[] };

// Legacy bets table (keep for backward compatibility)
export const bets = pgTable("bets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  gameId: integer("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
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
export const insertParlayLegSchema = createInsertSchema(parlayLegs)
  .omit({ id: true, result: true })
  .extend({ userId: z.string().optional() }); // server attaches userId before insert; clients need not supply it
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
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
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
export type CustomIndex = typeof customIndexes.$inferSelect;
export type CustomIndexShare = typeof customIndexShares.$inferSelect;

/** A custom index as returned to a client, annotated with how the requester can see it. */
export type CustomIndexWithAccess = CustomIndex & {
  isOwner: boolean;
  /** 'owner' | 'shared' | 'league' — which visibility rule granted access. */
  access: "owner" | "shared" | "league";
  sharedWithUserIds?: string[];
};

export const customIndexFiltersSchema = z.object({
  leagueIds: z.array(z.number().int()).default([]),
  memberUserIds: z.array(z.string()).default([]),
  betTypes: z.array(z.enum(["spread", "moneyline", "over", "under", "player_prop"])).default([]),
  propTypes: z.array(z.string()).default([]),
  playerName: z.string().default(""),
  teamName: z.string().default(""),
});

export const insertCustomIndexSchema = z.object({
  displayName: z.string().min(1).max(120),
  scope: z.enum(["private", "league"]).default("private"),
  publishedLeagueId: z.number().int().nullable().optional(),
  filters: customIndexFiltersSchema,
});

export const updateCustomIndexSchema = insertCustomIndexSchema.partial();

export type InsertCustomIndex = z.infer<typeof insertCustomIndexSchema>;
export type UpdateCustomIndex = z.infer<typeof updateCustomIndexSchema>;

/**
 * Canonical form of a filter set used for equality comparison — sorted/deduped
 * arrays, trimmed+lowercased strings, blanks treated as "unset". Two filter sets
 * that mean the same thing produce identical normalized objects.
 */
export function normalizeCustomIndexFilters(filters: Partial<CustomIndexFilters>) {
  const sortedUnique = (arr?: (string | number)[]) =>
    Array.from(new Set(arr ?? [])).sort();
  return {
    leagueIds: sortedUnique(filters.leagueIds) as number[],
    memberUserIds: sortedUnique(filters.memberUserIds) as string[],
    betTypes: sortedUnique(filters.betTypes) as string[],
    propTypes: sortedUnique(filters.propTypes) as string[],
    playerName: (filters.playerName ?? "").trim().toLowerCase(),
    teamName: (filters.teamName ?? "").trim().toLowerCase(),
  };
}

export function customIndexFiltersEqual(a: Partial<CustomIndexFilters>, b: Partial<CustomIndexFilters>): boolean {
  const na = normalizeCustomIndexFilters(a);
  const nb = normalizeCustomIndexFilters(b);
  return JSON.stringify(na) === JSON.stringify(nb);
}

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
  region?: UserRegion | null;
};

export type LeagueMemberWithUser = LeagueMember & {
  user: { id: string; firstName?: string | null; email?: string | null; profileImageUrl?: string | null; isDemo?: boolean | null; settings?: UserSettings | null };
};

export type LeagueWithMembers = League & {
  members: LeagueMemberWithUser[];
  memberCount: number;
  isAdmin: boolean;
  isLieutenant: boolean;
};

export type ParlayWithLegs = Parlay & {
  legs: (ParlayLeg & {
    game: Game | null;
    user?: { firstName?: string | null; email?: string | null; profileImageUrl?: string | null; isDemo?: boolean | null; settings?: UserSettings | null };
  })[];
  week: Week;
  user?: { firstName?: string | null; email?: string | null; profileImageUrl?: string | null; isDemo?: boolean | null; settings?: UserSettings | null };
};

// A single leg the current user contributed, with a pointer back to its parent
// parlay — including parlays owned/merged by another league member.
export type ParlayLegWithParlayContext = ParlayLeg & {
  game: Game | null;
  parlay: {
    id: number;
    weekId: number;
    week: Week;
    status: string | null;
    isOwnParlay: boolean;
    owner: { firstName?: string | null; email?: string | null; settings?: UserSettings | null } | null;
  };
};

export type LeagueStats = {
  leagueId: number;
  leagueName: string;
  standings: UserStat[];
};

export type ActiveWeekStatus = {
  weekId: number;
  weekLabel: string;
  submittedCount: number;
  totalMembers: number;
  allSubmitted: boolean;
  isLocked: boolean;
  currentUserSubmitted: boolean;
  hasPendingParlay: boolean;
  hasApprovedParlay: boolean;
};

export type LeagueDataStats = {
  totalParlays: number;
  totalLegs: number;
  memberCount: number;
  avgLegsPerParlay: number;
  allTimeStandings: UserStat[];
  currentSeasonStandings: UserStat[];
};

export type PopularPick = {
  gameId: number | null;
  betType: string;
  pick: string;
  playerName?: string | null;
  propType?: string | null;
  count: number;
};
