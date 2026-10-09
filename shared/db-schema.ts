// Server-only Drizzle ORM schema — table definitions and insert schemas that
// depend on drizzle-orm/pg-core and drizzle-zod. Never import this from
// mobile/client code: those runtimes can't bundle the Postgres driver chain
// pg-core pulls in. Client-safe types/constants live in ./schema, which
// re-exports the *types* defined here via `import type` / `export type` so
// those re-exports are erased at build time and never pull this file in.
import { pgTable, text, serial, integer, boolean, timestamp, varchar, jsonb, real, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";
import type { LieutenantPermissions, LeagueNotificationSettings, CustomIndexFilters, StoryCandidate } from "./schema";

export * from "./models/auth";
export * from "./models/chat";

export const weeks = pgTable("weeks", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  weekNumber: integer("week_number").notNull(),
  label: text("label").notNull(),
  isActive: boolean("is_active").default(false),
}, (table) => [
  uniqueIndex("weeks_season_week_uidx").on(table.season, table.weekNumber),
]);

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
  uniqueIndex("games_week_teams_idx").on(table.weekId, table.homeTeam, table.awayTeam),
]);

// Cached snapshots from The Odds API's historical endpoint, used to backfill
// game-market lines/odds (spread/total/moneyline) closer to what they actually
// were when a bet was placed, instead of whatever the `games` row holds today.
// One row covers every game in that week's slate as of a given snapshot time —
// games sharing a kickoff window (e.g. the early Sunday slate) share a row, and
// once a game is in the past the odds never change, so rows are cached forever
// (no TTL/invalidation needed).
export const historicalOddsSnapshots = pgTable("historical_odds_snapshots", {
  id: serial("id").primaryKey(),
  season: integer("season").notNull(),
  weekNumber: integer("week_number").notNull(),
  // 'open' for the early-week line, or an ISO timestamp for a closing-line
  // snapshot tied to a specific kickoff slot.
  bucketLabel: text("bucket_label").notNull(),
  snapshotAt: timestamp("snapshot_at").notNull(), // the `date` param sent to the historical API
  payload: jsonb("payload").notNull(), // raw odds-api game list for that snapshot (all teams)
  fetchedAt: timestamp("fetched_at").defaultNow(),
}, (table) => [
  uniqueIndex("historical_odds_snapshots_scope_idx").on(table.season, table.weekNumber, table.bucketLabel),
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
  // No longer used: a member has one pick per parlay, so there's nothing to
  // cap per game. The column stays so old rows and old app builds still load.
  maxBetsPerGame: integer("max_bets_per_game").default(1),
  isDemo: boolean("is_demo").default(false),
  useDemoWeekData: boolean("use_demo_week_data").default(false),
  insightsEnabled: boolean("insights_enabled").default(false),
  lieutenantPermissions: jsonb("lieutenant_permissions").$type<LieutenantPermissions>(),
  notificationSettings: jsonb("notification_settings").$type<LeagueNotificationSettings>(),
  // What to call the member whose bet busts first each losing week: 'parlay_loser', 'asshole', 'jerry', 'dud', or 'doofus'.
  loserLabel: text("loser_label").default("parlay_loser"),
  // What to call the member whose bet is the last to be decided in a winning parlay: one of HERO_LABELS (shared/leagueLabels.ts).
  heroLabel: text("hero_label").default("parlay_hero"),
  // The league's own emoji for its shame report. Null uses the defaults (a
  // siren on the slides, a bell in the text version).
  shameEmoji: text("shame_emoji"),
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
  // Active/inactive + membership window. A user is only "active" in this league
  // between startDate and endDate (endDate null = still active / hasn't left).
  // Leaving sets isActive=false + endDate; it never deletes the row. Only a full
  // maestro-initiated purge removes the row, and only once no parlay_legs remain
  // orphaned under this user in this league (see purgedAt below).
  isActive: boolean("is_active").notNull().default(true),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),
  // Set when a maestro purges this member while orphaned parlay_legs still exist
  // (bypassing immediate resolution). Distinguishes "left normally" from "purged,
  // pending exceptions-blotter cleanup" in the UI. The row is hard-deleted once
  // getOrphanedLegsForMember returns empty for this user/league.
  purgedAt: timestamp("purged_at"),
}, (table) => [
  index("league_members_league_id_idx").on(table.leagueId),
  index("league_members_user_id_idx").on(table.userId),
  index("league_members_league_active_idx").on(table.leagueId, table.isActive),
]);

// NFL team metadata — centralized reference table; other tables (games, players,
// custom index filters) currently store team names/abbreviations as free text and
// are not FK'd to this table, but can be joined against it by abbreviation.
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  abbreviation: text("abbreviation").notNull().unique(), // e.g. 'KC'
  fullName: text("full_name").notNull(), // 'Kansas City Chiefs'
  city: text("city").notNull(),
  nickname: text("nickname").notNull(), // 'Chiefs'
  conference: text("conference"), // 'AFC' | 'NFC'
  division: text("division"), // 'North' | 'South' | 'East' | 'West'
  stadiumName: text("stadium_name"),
  stadiumType: text("stadium_type"), // 'outdoor' | 'dome' | 'retractable'
  isTurf: boolean("is_turf"),
  owner: text("owner"),
  headCoach: text("head_coach"),
  primaryColor: text("primary_color"),
  secondaryColor: text("secondary_color"),
  logoUrl: text("logo_url"),
});

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

// Parlays - a league's shared ticket for a week. `userId` is whoever started
// it; every member adds one leg of their own (see shared/weekParlays.ts).
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
  status: text("status").default("pending"), // 'draft', 'pending', 'approved', 'sent', 'placed', 'rejected', 'win', 'loss', 'push', 'void'
  // Derived, read-only grouping of `status` — Postgres GENERATED STORED column
  // (see migrations), never written to by the app. Not surfaced in the GUI;
  // exists purely so future features/logic can branch on group instead of
  // enumerating individual statuses.
  //   draft:  'draft' — in-progress, legs still being added, not yet submitted
  //   open:   'approved', 'pending', 'sent', 'placed'
  //   closed: 'win', 'loss', 'rejected', 'push'
  //   void:   'void'
  statusGroup: text("status_group"),
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  source: text("source").default("live"), // 'live', 'imported'
  importBatchId: integer("import_batch_id").references(() => importBatches.id, {
    onDelete: "set null",
  }),
  // Sportsbook promo boost on this parlay's odds, as a percentage (25 = a
  // 25% boost). Null when there's no boost. Editable at any status, since a
  // boost claimed at the book is often recorded here after the bet is live.
  boostPct: real("boost_pct"),
}, (table) => [
  // Not unique: in a league that runs several parlays a week, the same
  // member can start more than one.
  index("parlays_user_league_week_idx").on(table.userId, table.leagueId, table.weekId),
  index("parlays_league_week_idx").on(table.leagueId, table.weekId),
  index("parlays_status_idx").on(table.status),
  index("parlays_league_status_idx").on(table.leagueId, table.status),
]);

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
  oddsSource: text("odds_source"), // Bookmaker the line/odds came from (e.g. 'DraftKings', 'FanDuel')
  gameSegment: text("game_segment"), // Optional game portion the bet applies to (e.g. 'First Half', 'Second Quarter')
  result: text("result"), // 'win', 'loss', 'push', null
  resultDetail: text("result_detail"), // human-readable justification for the result, e.g. "Passed for 312 yds (needed 245.5+)" or "Final: DAL 24 @ PHI 17"
  oddsEnriched: boolean("odds_enriched").default(false), // true once odds/result have been auto-resolved
  playerName: text("player_name"), // for player_prop bets: the player's name
  propType: text("prop_type"),     // for player_prop bets: the prop category (e.g. 'rush_yards')
  notes: text("notes"),            // free-text note, display only
  enrichmentLog: text("enrichment_log"), // JSON: { at, changes, warnings, errors } — last data-fetch attempt
  // The moment this leg's outcome became fixed — may be well before the
  // game ends (e.g. an over hitting in the 3rd quarter). Defaults to null/
  // 'final' until a resolution pass populates it; 'final' legs fall back to
  // games.finishedAt for display. See decidedConfidence for how it was derived.
  decidedAt: timestamp("decided_at"),
  decidedPlayDesc: text("decided_play_desc"), // play-by-play description of the deciding play, for display
  decidedQuarter: text("decided_quarter"),    // e.g. 'Q3', 'OT'
  decidedClock: text("decided_clock"),        // game clock at the deciding play, e.g. '9:14'
  // 'final' = decided at game end (default/fallback, no early detection run yet)
  // 'exact' = deterministic mid-game detection (totals-over, player props)
  // 'heuristic' = probabilistic garbage-time elimination (spread/moneyline/under)
  decidedConfidence: text("decided_confidence").default("final"),
  // When the pick was saved. Changing a pick writes a new row, so this is the
  // time of the pick that stands. Legs from before this column all carry the
  // time it was added; they keep their id order (see shared/legOrder.ts).
  createdAt: timestamp("created_at").defaultNow(),
  // "On Behalf Of": set when someone other than the leg's owner (userId)
  // made the pick. The owner then has to approve it, or the Parlay Maestro
  // can override. approvalStatus is null for a pick the owner made themselves.
  placedByUserId: varchar("placed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  approvalStatus: text("approval_status"), // null | 'pending' | 'approved'
  approvalByUserId: varchar("approval_by_user_id").references(() => users.id, { onDelete: "set null" }),
  approvalAt: timestamp("approval_at"),
}, (table) => [
  index("parlay_legs_parlay_id_idx").on(table.parlayId),
  index("parlay_legs_user_id_idx").on(table.userId),
  index("parlay_legs_odds_enriched_idx").on(table.oddsEnriched),
]);

// A league member disputing a leg's outcome or entry. Reviewed by support in
// the Exceptions Queue (superuser-only), kept separate from the parlay data
// itself — filing a dispute never mutates the leg's result/line.
export const parlayLegDisputes = pgTable("parlay_leg_disputes", {
  id: serial("id").primaryKey(),
  parlayLegId: integer("parlay_leg_id")
    .notNull()
    .references(() => parlayLegs.id, { onDelete: "cascade" }),
  raisedByUserId: varchar("raised_by_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reasonType: text("reason_type").notNull(), // 'result_wrong' | 'entered_incorrectly'
  justification: text("justification").notNull(),
  screenshotKey: text("screenshot_key"), // bucket object key — required for 'entered_incorrectly'
  status: text("status").notNull().default("open"), // 'open' | 'resolved' | 'dismissed'
  resolvedByUserId: varchar("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
  // Set when a dispute is ruled on, upheld or dismissed. Both stay on record
  // for the Disputes Report (see storage.resolveDispute).
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("parlay_leg_disputes_leg_id_idx").on(table.parlayLegId),
  index("parlay_leg_disputes_status_idx").on(table.status),
]);

// "The Suss Meter": a member's anonymous down vote on someone else's pick in
// an open parlay. One per member per leg. Who voted is never sent to a
// client; only the count is (see storage.getSussForParlays).
export const legSussVotes = pgTable("leg_suss_votes", {
  id: serial("id").primaryKey(),
  parlayLegId: integer("parlay_leg_id")
    .notNull()
    .references(() => parlayLegs.id, { onDelete: "cascade" }),
  voterUserId: varchar("voter_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("leg_suss_votes_leg_voter_uidx").on(table.parlayLegId, table.voterUserId),
]);

export type ParlayLegDispute = typeof parlayLegDisputes.$inferSelect;
export type InsertParlayLegDispute = typeof parlayLegDisputes.$inferInsert;

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

// "On Behalf Of" grants made person to person: `ownerUserId` lets
// `delegateUserId` make their pick in this league. The Parlay Maestro (and
// lieutenants, when the league allows it) can pick for anyone without one.
export const pickDelegations = pgTable("pick_delegations", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  ownerUserId: varchar("owner_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  delegateUserId: varchar("delegate_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("pick_delegations_uidx").on(table.leagueId, table.ownerUserId, table.delegateUserId),
  index("pick_delegations_delegate_idx").on(table.leagueId, table.delegateUserId),
]);

// A member asking for a locked week to be reopened. Whoever can unlock (the
// Parlay Maestro, or a lieutenant with the unlock permission) grants or
// dismisses it; granting unlocks the week.
export const unlockRequests = pgTable("unlock_requests", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  weekId: integer("week_id")
    .notNull()
    .references(() => weeks.id, { onDelete: "cascade" }),
  requestedBy: varchar("requested_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  reason: text("reason"),
  status: text("status").notNull().default("open"), // 'open' | 'granted' | 'dismissed'
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("unlock_requests_league_week_idx").on(table.leagueId, table.weekId),
]);

// Personal access tokens for the read-only MCP connector (server/mcp.ts).
// Only a SHA-256 hash is stored: the token itself is shown once, when it's
// made. `tokenPrefix` is its first few characters, so the owner can tell
// their tokens apart in Settings.
export const apiTokens = pgTable("api_tokens", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenPrefix: text("token_prefix").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  index("api_tokens_user_id_idx").on(table.userId),
]);

// League member pokes — an easter egg on the league Members tab. One row per
// poke; seenAt is set when the recipient pokes back or dismisses it.
export const leaguePokes = pgTable("league_pokes", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  toUserId: varchar("to_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  seenAt: timestamp("seen_at"),
}, (table) => [
  index("league_pokes_league_to_idx").on(table.leagueId, table.toUserId),
]);

// In-app notifications
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  leagueId: integer("league_id").references(() => leagues.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'announcement', 'parlay_approved', 'parlay_rejected', 'reminder', 'system', 'dispute_resolved', or a NOTIFICATION_EVENTS key (shared/notifications.ts)
  title: text("title").notNull(),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Set for alerts that must reach a member once only (a parlay busting, a
  // slate wrap-up): a second insert with the same key is skipped.
  dedupeKey: text("dedupe_key"),
}, (table) => [
  index("notifications_user_id_idx").on(table.userId),
  uniqueIndex("notifications_user_dedupe_uidx").on(table.userId, table.dedupeKey),
]);

// ─── Custom Indexes ────────────────────────────────────────────────────────
// A named, saved definition of a comparison line ("index") that can be overlaid
// on performance graphs. Private to its owner by default; can be shared with
// specific users, or published league-wide by a Parlay Maestro.

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

// Audit ledger — append-only record of auth events, admin/mutating actions, and
// failures. Written by a single in-process worker draining a BullMQ queue so
// concurrent request handlers never contend on this table directly (see
// server/jobs/audit-queue.ts). Kept separate from application debug logs, which
// are sampled/short-retained; every row here is intentional and complete.
export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  targetType: varchar("target_type", { length: 50 }),
  targetId: varchar("target_id", { length: 100 }),
  success: boolean("success").notNull().default(true),
  statusCode: integer("status_code"),
  ip: varchar("ip", { length: 64 }),
  userAgent: text("user_agent"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("audit_events_event_type_idx").on(table.eventType),
  index("audit_events_actor_user_id_idx").on(table.actorUserId),
  index("audit_events_created_at_idx").on(table.createdAt),
]);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;

// Schemas
export const insertLeagueWeekLockSchema = createInsertSchema(leagueWeekLocks).omit({ id: true, lockedAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, isRead: true, createdAt: true, dedupeKey: true });
export const insertWeekSchema = createInsertSchema(weeks).omit({ id: true });
export const insertGameSchema = createInsertSchema(games).omit({ id: true });
export const insertBetSchema = createInsertSchema(bets).omit({ id: true, userId: true, status: true, createdAt: true });

export const insertLeagueSchema = createInsertSchema(leagues).omit({ id: true, inviteCode: true, createdAt: true });
export const insertLeagueMemberSchema = createInsertSchema(leagueMembers).omit({ id: true, joinedAt: true, isActive: true, startDate: true, endDate: true, purgedAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true });
export const insertParlaySchema = createInsertSchema(parlays).omit({ id: true, userId: true, status: true, approvedBy: true, approvedAt: true, createdAt: true, source: true, importBatchId: true, boostPct: true });
export const insertParlayLegSchema = createInsertSchema(parlayLegs)
  .omit({
    id: true, result: true, decidedAt: true, decidedPlayDesc: true, decidedQuarter: true, decidedClock: true, decidedConfidence: true,
    createdAt: true, placedByUserId: true, approvalStatus: true, approvalByUserId: true, approvalAt: true,
  })
  .extend({ userId: z.string().optional() }); // server attaches userId before insert; clients need not supply it
export const insertImportBatchSchema = createInsertSchema(importBatches).omit({ id: true, uploadedAt: true });

// ─── nflverse / Player data ────────────────────────────────────────────────

// NFL players referenced in bets (populated by nflverse sync)
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  nflverseId: text("nflverse_id").unique(), // e.g. "00-0023459" (GSIS ID)
  espnId: text("espn_id").unique(), // ESPN athlete id — used by the ESPN boxscore defensive-stats sync
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
  // Defense — "tackles" prop lines are conventionally solo + assist combined;
  // kept as two columns (rather than pre-summed) so solo-only lines can be
  // supported later without a schema change.
  defSacks: real("def_sacks"),
  defTacklesSolo: integer("def_tackles_solo"),
  defTacklesWithAssist: integer("def_tackles_with_assist"),
  // Scoring / Fantasy
  fantasyPoints: real("fantasy_points"),
  fantasyPointsPpr: real("fantasy_points_ppr"),
}, (table) => [
  uniqueIndex("player_week_stats_player_season_week_uidx").on(table.playerId, table.season, table.week),
]);

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
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type CustomIndex = typeof customIndexes.$inferSelect;
export type CustomIndexShare = typeof customIndexShares.$inferSelect;

export type LeagueWeekLock = typeof leagueWeekLocks.$inferSelect;
export type LeaguePoke = typeof leaguePokes.$inferSelect;
export type PickDelegation = typeof pickDelegations.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type UnlockRequest = typeof unlockRequests.$inferSelect;
export type InsertLeagueWeekLock = z.infer<typeof insertLeagueWeekLockSchema>;

export type InsertBet = z.infer<typeof insertBetSchema>;
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type InsertParlay = z.infer<typeof insertParlaySchema>;
export type InsertParlayLeg = z.infer<typeof insertParlayLegSchema>;
export type InsertImportBatch = z.infer<typeof insertImportBatchSchema>;
