// Client-safe types and constants — importable from mobile (Metro), the web
// client (Vite), and the server alike. This file must NEVER import
// drizzle-orm/pg-core, drizzle-zod, or ./models/{auth,chat} at the value
// level (not even transitively): mobile's Metro bundler can't resolve/bundle
// the Postgres driver chain those pull in. Table definitions and
// table-derived value exports (insert schemas, the tables themselves) live
// in ./db-schema instead — import those only from server code.
//
// The `import type` / `export type` below are erased entirely by the
// TypeScript transform, so re-exporting db-schema's inferred row types here
// does not create a runtime dependency on db-schema (and therefore not on
// drizzle-orm) for consumers of this file.
import { z } from "zod";
import type { SportsbookProvider } from "./sportsbook-providers";
import type {
  Week, Game, Bet, Notification, InsertNotification, League, LeagueMember,
  Parlay, ParlayLeg, ImportBatch, Team, InsertTeam, CustomIndex, CustomIndexShare,
  LeagueWeekLock, InsertLeagueWeekLock, ParlayLegDispute, InsertParlayLegDispute,
  StoryReport, InsertStoryReport, UpdateStoryReport, StorySection, StoryReportWithSections,
  AuditEvent, InsertAuditEvent, Player, PlayerWeekStat, InsertPlayer, InsertPlayerWeekStat,
  InsertBet, InsertLeague, InsertParlay, InsertParlayLeg, InsertImportBatch,
} from "./db-schema";

export type {
  Week, Game, Bet, Notification, InsertNotification, League, LeagueMember,
  Parlay, ParlayLeg, ImportBatch, Team, InsertTeam, CustomIndex, CustomIndexShare,
  LeagueWeekLock, InsertLeagueWeekLock, ParlayLegDispute, InsertParlayLegDispute,
  StoryReport, InsertStoryReport, UpdateStoryReport, StorySection, StoryReportWithSections,
  AuditEvent, InsertAuditEvent, Player, PlayerWeekStat, InsertPlayer, InsertPlayerWeekStat,
  InsertBet, InsertLeague, InsertParlay, InsertParlayLeg, InsertImportBatch,
};

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
  preferredSportsbook?: SportsbookProvider | null;
  /** Free-text sportsbook name when preferredSportsbook === "other". */
  preferredSportsbookOther?: string | null;
  /** NFL team code (e.g. "KC") chosen as a default avatar badge — see
   * mobile/src/lib/nflTeams.ts. Takes priority over profileImageUrl. */
  avatarTeam?: string | null;
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
  // Combined
  { value: "all_purpose_yards", label: "All-Purpose Yards" }, // rushing + receiving yards combined
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

export type WeekLockStatus = {
  isLocked: boolean;
  lockedAt?: Date;
  lockedBy?: string;
  hadMissingBets?: boolean;
  submittedCount: number;
  totalMembers: number;
  allSubmitted: boolean;
};

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
  /** Mean of I(win)*oddsFactor over decided legs (0 if none). */
  powerScore: number;
  /** Weeks with a non-void/rejected parlay / eligible league weeks (0–1). */
  participationRate: number;
  /** (powerScore × participation) − league mean of the same product. */
  bar: number;
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

// A specific pick already locked in by another league member this week —
// unlike PopularPick (a same-shape popularity ranking across everyone,
// including still-drafting picks), this is the exclusivity set: only
// picks from non-draft (submitted) parlays, used to gray out tiles other
// members have already claimed.
export type TakenPick = {
  gameId: number | null;
  betType: string;
  pick: string;
  playerName?: string | null;
  propType?: string | null;
  // Who owns this pick, pre-formatted server-side (so a last name reaches
  // the client only in this abbreviated form, never raw) — `web` is
  // "F.Lastname", `mobile` is just the first name. See shared/pickOwnerLabel.ts.
  takenBy: { web: string; mobile: string };
};
