import { db } from "./db";
import { logger } from "./logger";
import {
  weeks, games, bets, users, leagues, leagueMembers, parlays, parlayLegs, importBatches, notifications, leagueWeekLocks,
  players, playerWeekStats, customIndexes, customIndexShares, storyReports, storySections, parlayLegDisputes, teams,
  type Team,
  type ParlayLegDispute, type InsertParlayLegDispute,
  type CustomIndex, type CustomIndexWithAccess, type InsertCustomIndex, type UpdateCustomIndex,
  type StoryReport, type StoryReportWithSections, type InsertStoryReport, type UpdateStoryReport,
  type StorySection, type StorySectionKind,
  type Week, type Game, type Bet, type InsertBet, type League, type LeagueMember,
  type Parlay, type ParlayLeg, type InsertLeague, type InsertParlay, type InsertParlayLeg,
  type GameWithBet, type BetHistoryItem, type UserStat, type LeagueWithMembers, type ParlayWithLegs,
  type ParlayLegWithParlayContext,
  type ImportBatch, type InsertImportBatch, type ImportParlayLeg,
  type LieutenantPermissions, type LeagueMemberWithUser,
  type Notification, type LeagueNotificationSettings,
  type LeagueWeekLock, type WeekLockStatus,
  type Player, type PlayerWeekStat, type InsertPlayer, type InsertPlayerWeekStat,
  type UserSettings,
  type ActiveWeekStatus, type LeagueDataStats, type PopularPick, type TakenPick,
} from "@shared/schema";
import { normalizeJoinedGame, normalizeParlayLegPatch } from "@shared/dataIntegrity";
import { countParlayOutcomes, mergeUserSettings, buildUserStat, normalizeOutcomeCounts } from "@shared/statsAggregation";
import { formatPickOwnerLabel } from "@shared/pickOwnerLabel";
import { eq, and, or, desc, asc, inArray, sql, ilike, not, isNull } from "drizzle-orm";
import {
  averagePowerScore,
  legPowerContribution,
  participationRate,
  withBar,
} from "@shared/powerScore";
import { publishLeagueEvent, publishUserEvent } from "./realtime-bus";
import { impliedPointsMoved, MAX_POINTS_MOVE } from "@shared/buyPoints";

function emitLeague(leagueId: number, weekId: number | undefined, kind: string) {
  void publishLeagueEvent(leagueId, kind, weekId).catch((e) =>
    logger.error({ e }, "[realtime]"),
  );
}

function emitUser(userId: string, kind: string) {
  void publishUserEvent(userId, kind).catch((e) => logger.error({ e }, "[realtime]"));
}

// Discriminates a leg by what it actually bets on, independent of which
// parlay it belongs to — game legs key on (gameId, betType, pick); player
// props have no gameId-scoped odds, so they key on (playerName, propType,
// pick) instead. Shared by getPopularPicksForWeek, getTakenPicksForWeek, and
// addLegToDraftParlay's cross-user exclusivity check so all three agree on
// what counts as "the same pick."
function pickKey(leg: { betType: string; gameId?: number | null; pick: string; playerName?: string | null; propType?: string | null }): string {
  return leg.betType === 'player_prop'
    ? `prop:${leg.playerName}:${leg.propType}:${leg.pick}`
    : `game:${leg.gameId}:${leg.betType}:${leg.pick}`;
}

// Cross-user exclusivity, used only by addLegToDraftParlay/createParlay — a
// stricter, betType-aware variant of pickKey. Moneyline is never exclusive
// (any number of members can each take either side); spread/over-under are
// exclusive per game regardless of SIDE (once one member has the spread on a
// game, no one else may take the spread on that game at all, home or away —
// same for over/under). Player props keep pickKey's exact-side exclusivity,
// unchanged. Returns null for a leg that's never exclusive.
function exclusivityKey(leg: { betType: string; gameId?: number | null; pick: string; playerName?: string | null; propType?: string | null }): string | null {
  if (leg.betType === 'moneyline') return null;
  if (leg.betType === 'player_prop') return pickKey(leg);
  // 'over' and 'under' are stored as two distinct betType values (not two
  // sides of one type) — group them under one key so taking either side of
  // the total locks out the other, the same way spread's home/away do.
  const market = leg.betType === 'over' || leg.betType === 'under' ? 'total' : leg.betType;
  return `game:${leg.gameId}:${market}`;
}

// Lowercase, strip common suffixes (Jr, Sr, II–IV) and punctuation, collapse
// whitespace, so "D.K. Metcalf" ≈ "DK Metcalf" and "Odell Beckham Jr." ≈
// "Odell Beckham". Shared by name-matching lookups across data sources
// (nflverse player names vs. ESPN display names) that don't share a stable id.
function normalizePlayerName(s: string): string {
  return s.toLowerCase()
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv|v)\b/gi, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export interface IStorage {
  // Weeks
  getWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(week: any): Promise<Week>;
  setActiveWeek(weekId: number): Promise<void>;

  // Games
  getGamesByWeek(weekId: number, userId?: string): Promise<GameWithBet[]>;
  createGame(game: any): Promise<Game>;
  getGame(id: number): Promise<Game | undefined>;

  // Bets (legacy)
  createBet(userId: string, bet: InsertBet): Promise<Bet>;
  getBetHistory(userId: string): Promise<BetHistoryItem[]>;
  
  // Stats
  getStats(): Promise<UserStat[]>;
  getLeagueStats(leagueId: number, weekIds?: number[]): Promise<UserStat[]>;

  // Leagues
  createLeague(userId: string, league: InsertLeague): Promise<League>;
  getLeague(id: number): Promise<League | undefined>;
  getUserLeagues(userId: string): Promise<LeagueWithMembers[]>;
  joinLeague(userId: string, inviteCode: string): Promise<LeagueMember | null>;
  getLeagueMembers(leagueId: number): Promise<LeagueMember[]>;
  getLeagueMembersWithUsers(leagueId: number, opts?: { includeInactive?: boolean; asOfDate?: Date }): Promise<LeagueMemberWithUser[]>;
  isSuperUser(userId: string): Promise<boolean>;
  isLeagueAdmin(leagueId: number, userId: string): Promise<boolean>;
  isLeagueLieutenant(leagueId: number, userId: string): Promise<boolean>;
  updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay' | 'maxBetsPerGame' | 'insightsEnabled' | 'loserLabel' | 'heroLabel'>>): Promise<League>;
  updateLieutenantPermissions(leagueId: number, permissions: LieutenantPermissions): Promise<League>;
  setMemberRole(leagueId: number, userId: string, role: string): Promise<LeagueMember>;
  getLieutenants(leagueId: number): Promise<LeagueMemberWithUser[]>;
  removeLeagueMember(leagueId: number, userId: string): Promise<void>;
  leaveLeagueMember(leagueId: number, userId: string, asOfDate?: Date): Promise<LeagueMember>;
  purgeLeagueMemberBypass(leagueId: number, userId: string): Promise<LeagueMember>;
  getOrphanedLegsForMember(leagueId: number, userId: string): Promise<(ParlayLeg & { game: Game | null; parlay: { id: number; weekId: number } })[]>;
  getOrphanedLegsForLeague(leagueId: number): Promise<(ParlayLeg & { game: Game | null; parlay: { id: number; weekId: number }; ownerEmail: string | null; ownerFirstName: string | null })[]>;
  resolveOrphanedLeg(leagueId: number, legId: number, action: 'reassign' | 'delete', newUserId?: string): Promise<void>;
  transferLeagueAdmin(leagueId: number, fromUserId: string, toUserId: string): Promise<void>;

  // Parlays
  getParlay(id: number): Promise<Parlay | undefined>;
  createParlay(userId: string, parlay: InsertParlay, legs: Omit<InsertParlayLeg, "parlayId" | "userId">[]): Promise<Parlay>;
  addLegToDraftParlay(
    userId: string,
    leagueId: number,
    weekId: number,
    leg: Omit<InsertParlayLeg, "parlayId" | "userId">,
    maxLegsPerParlay: number,
    maxBetsPerGame: number,
  ): Promise<Parlay>;
  removeDraftParlayLeg(userId: string, parlayId: number, legId: number): Promise<Parlay | null>;
  submitDraftParlay(userId: string, parlayId: number, minLegsPerParlay: number, maxLegsPerParlay: number): Promise<Parlay>;
  getUserParlayForWeek(userId: string, leagueId: number, weekId: number): Promise<ParlayWithLegs | null>;
  getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]>;
  getAllLeagueParlays(
    leagueId: number,
    opts?: { limit?: number; offset?: number; all?: boolean; weekIds?: number[] },
  ): Promise<{ items: ParlayWithLegs[]; total: number; limit: number; offset: number; hasMore: boolean }>;
  approveParlay(parlayId: number, adminId: string): Promise<Parlay>;
  rejectParlay(parlayId: number, adminId: string): Promise<Parlay>;
  markParlaySent(parlayId: number, userId: string): Promise<Parlay>;
  markParlayPlaced(parlayId: number, userId: string): Promise<Parlay>;
  revertParlayToApproved(parlayId: number, userId: string): Promise<Parlay>;
  getSentParlaysForUser(userId: string): Promise<ParlayWithLegs[]>;
  getUserParlayHistory(userId: string, leagueId?: number, weekIds?: number[]): Promise<ParlayWithLegs[]>;
  getUserLegHistory(userId: string, leagueId?: number): Promise<ParlayLegWithParlayContext[]>;
  updateParlay(parlayId: number, updates: { status?: string; legs?: { id: number; result?: string | null; notes?: string | null }[] }): Promise<Parlay>;
  deleteParlay(parlayId: number): Promise<void>;
  deleteParlayLeg(legId: number): Promise<void>;
  updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'oddsSource' | 'result' | 'resultDetail' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>>): Promise<ParlayLeg>;
  bulkUpdateParlayLegs(legIds: number[], field: keyof Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'oddsSource' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>, value: string | null): Promise<ParlayLeg[]>;
  addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'> & { userId: string }): Promise<ParlayLeg>;
  mergeParlays(leagueId: number, targetParlayId: number, sourceParlayIds: number[]): Promise<void>;
  splitParlayLegs(leagueId: number, parlayId: number, legIds: number[]): Promise<Parlay>;
  createHistoricalParlay(userId: string, leagueId: number, weekId: number, legs: Array<{ betType: string; pick: string; line?: string | null; odds?: string | null; result?: string | null; playerName?: string | null; propType?: string | null; gameSegment?: string | null; notes?: string | null }>): Promise<Parlay>;
  cloneParlay(sourceParlayId: number, targetWeekId: number): Promise<Parlay>;
  getMissingParlayMembers(leagueId: number, weekId: number): Promise<LeagueMemberWithUser[]>;
  backfillMissingParlays(leagueId: number, weekId: number): Promise<Parlay[]>;
  getActiveWeek(): Promise<Week | null>;

  // Leg disputes ("Exceptions Queue")
  createDispute(input: { parlayLegId: number; raisedByUserId: string; reasonType: string; justification: string; screenshotKey?: string | null }): Promise<ParlayLegDispute>;
  getOpenDisputeForLeg(parlayLegId: number): Promise<ParlayLegDispute | null>;
  getDisputesForLeg(parlayLegId: number): Promise<ParlayLegDispute[]>;
  getDispute(id: number): Promise<ParlayLegDispute | null>;
  listDisputes(status?: string): Promise<Array<ParlayLegDispute & {
    leg: ParlayLeg;
    parlay: Parlay;
    leagueName: string;
    weekLabel: string;
    raisedByName: string;
  }>>;
  resolveDispute(id: number, resolverUserId: string, status: "resolved" | "dismissed", notes?: string): Promise<ParlayLegDispute>;

  // Parlay status rollup
  rollupParlayStatus(parlayId: number): Promise<void>;
  rollupLeagueParlayStatuses(leagueId?: number, recomputeTerminal?: boolean): Promise<{ updated: number; skipped: number }>;

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

  // Active week parlay status (for Quick Pick tile badges)
  getActiveWeekParlayStatus(leagueIds: number[], userId: string): Promise<Record<number, ActiveWeekStatus>>;
  getLeagueDataStats(leagueId: number): Promise<LeagueDataStats>;
  getPopularPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<PopularPick[]>;
  getTakenPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<TakenPick[]>;

  // Aggregate win/loss stats per league (for My Leagues tile)
  getLeagueOverviewStats(leagueIds: number[]): Promise<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number; parlaysWon: number }>>;

  // Custom indexes
  createCustomIndex(ownerId: string, input: InsertCustomIndex): Promise<CustomIndex>;
  listVisibleCustomIndexes(userId: string): Promise<CustomIndexWithAccess[]>;
  getCustomIndex(id: number): Promise<CustomIndex | undefined>;
  updateCustomIndex(id: number, updates: UpdateCustomIndex): Promise<CustomIndex>;
  deleteCustomIndex(id: number): Promise<void>;
  shareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void>;
  unshareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void>;
  getCustomIndexShares(customIndexId: number): Promise<string[]>;
  usersShareALeague(userIdA: string, userIdB: string): Promise<boolean>;

  // Parlay week locking
  getWeekLockStatus(leagueId: number, weekId: number): Promise<WeekLockStatus>;
  lockWeekParlay(leagueId: number, weekId: number, userId: string, hadMissingBets: boolean): Promise<LeagueWeekLock>;
  unlockWeekParlay(leagueId: number, weekId: number): Promise<void>;

  // Enrichment
  findGameByTeams(weekId: number, homeTeam: string, awayTeam: string): Promise<Game | null>;
  upsertGameForImport(weekId: number, homeTeam: string, awayTeam: string, gameDate?: Date): Promise<Game>;
  getUnenrichedLegs(leagueId?: number): Promise<(ParlayLeg & { game: Game | null })[]>;
  enrichParlayLeg(legId: number, updates: { result?: string | null; resultDetail?: string | null; line?: string | null; oddsEnriched: boolean }): Promise<void>;
  enrichParlayLegsBatch(updates: Array<{ id: number; result?: string | null; resultDetail?: string | null; line?: string | null; oddsEnriched: boolean }>): Promise<void>;
  updateGameScores(gameId: number, homeScore: number, awayScore: number, isFinished: boolean, winner?: string): Promise<void>;
  setGameFinishedAt(gameId: number, finishedAt: Date): Promise<void>;
  backfillGameFinishedAt(): Promise<{ updated: number }>;
  getDistinctSeasons(): Promise<number[]>;
  getGameLegsPendingDecision(criteria: { betType: string; result: "win" | "loss" }[], leagueId?: number): Promise<(ParlayLeg & { game: Game; season: number; weekNumber: number })[]>;
  getWonPropLegsPendingDecision(leagueId?: number): Promise<(ParlayLeg & { season: number; weekNumber: number })[]>;
  setLegDecision(legId: number, info: { decidedAt: Date; decidedPlayDesc: string; decidedQuarter: string; decidedClock: string; decidedConfidence: string }): Promise<void>;
  patchGameOdds(gameId: number, odds: { spread?: string; overUnder?: string; moneylineHome?: string; moneylineAway?: string }): Promise<void>;
  updateGameTime(gameId: number, gameTime: Date): Promise<void>;
  getUser(userId: string): Promise<typeof users.$inferSelect | null>;

  // nflverse / Players
  getWeekBySeasonAndNumber(season: number, weekNumber: number): Promise<Week | null>;
  getGamesForSeasonWeek(season: number, weekNumber: number): Promise<Game[]>;
  upsertPlayer(data: Omit<InsertPlayer, 'updatedAt'>): Promise<Player>;
  upsertPlayerByEspn(data: Omit<InsertPlayer, 'updatedAt' | 'nflverseId'> & { espnId: string }): Promise<Player>;
  searchPlayers(query: string, limit?: number): Promise<Player[]>;
  getAllTeams(): Promise<Team[]>;
  upsertPlayerWeekStat(data: InsertPlayerWeekStat): Promise<PlayerWeekStat>;
  getPlayerStatsForGame(gameId: number): Promise<(PlayerWeekStat & { player: Player })[]>;
  getPlayerStatByName(playerName: string, season: number, week: number): Promise<(PlayerWeekStat & { player: Player }) | null>;
  setLegEnrichmentLog(legId: number, log: string): Promise<void>;

  // Story Studio
  createStoryReport(userId: string, input: InsertStoryReport): Promise<StoryReport>;
  getStoryReportWithSections(id: number): Promise<StoryReportWithSections | undefined>;
  updateStoryReport(id: number, updates: UpdateStoryReport): Promise<StoryReport>;
  upsertStorySection(reportId: number, kind: StorySectionKind, order: number, data: { content?: string; generatedContent?: string; promptVersion?: string }): Promise<StorySection>;
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

  /** The only code path allowed to flip a week's isActive to true — deactivates every
   * other week first so at most one week is ever active at a time. */
  async setActiveWeek(weekId: number): Promise<void> {
    await db.update(weeks).set({ isActive: false });
    await db.update(weeks).set({ isActive: true }).where(eq(weeks.id, weekId));
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
    // noinspection SqlResolve
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
        const counts = normalizeOutcomeCounts(row);
        const settings = row.settings as UserSettings | null;
        return {
          ...buildUserStat(
            {
              userId: row.userId,
              firstName: row.firstName,
              email: row.email,
              profileImageUrl: row.profileImageUrl,
              settings,
            },
            counts,
          ),
          // Global leaderboard is parlay-based; Power Score / BAR are league leg metrics.
          powerScore: 0,
          participationRate: 0,
          bar: 0,
        };
      })
      .sort((a, b) => b.winRate - a.winRate);
  }

  /**
   * Per-member win/loss/push record, based on individual parlay_legs results
   * (not the parlay's overall status) — each leg is its own bet, attributed
   * to whichever member contributed it (parlayLegs.userId). Legs belonging to
   * a 'void' (no submission) or 'rejected' parlay are excluded, since those
   * don't represent a real decided bet.
   *
   * Also computes Power Score (avg win×oddsFactor over decided legs) and BAR
   * (cohort-adjusted PS × participation).
   *
   * Participation = league parlays participated in / league parlays that
   * occurred while this member was active. A "league parlay" here is counted
   * per week, not per row — a member's weekly pick can be split or merged into
   * more than one `parlays` row, and that must still only count as one
   * participated (or one eligible) week. A push counts as participation
   * (it's a real, decided submission); void does not. `weeks` carries no
   * calendar date of its own, and void placeholders aren't reliably
   * backfilled, so rather than counting void rows directly, a week's
   * occurrence is inferred from the earliest real (non-void, non-rejected)
   * submission timestamp anywhere in the league that week, and eligibility is
   * that timestamp falling inside this member's [startDate, endDate ?? now]
   * window. Absence of a valid submission in an eligible week — whether or
   * not a void row actually exists for it — is what counts against them.
   */
  async getLeagueStats(leagueId: number, weekIds?: number[]): Promise<UserStat[]> {
    const members = await db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId));
    const memberIds = members.map(m => m.userId);

    if (memberIds.length === 0) return [];

    const memberUsers = await db.select().from(users).where(inArray(users.id, memberIds));

    const weekFilter = weekIds && weekIds.length > 0 ? inArray(parlays.weekId, weekIds) : undefined;

    const legRows = await db.select({
      userId: parlayLegs.userId,
      result: parlayLegs.result,
      odds: parlayLegs.odds,
      weekId: parlays.weekId,
      createdAt: parlays.createdAt,
    })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(
        eq(parlays.leagueId, leagueId),
        not(inArray(parlays.status as any, ['void', 'rejected'])),
        inArray(parlayLegs.userId, memberIds),
        weekFilter,
      ));

    // Anchor each week that saw real league activity to its earliest submission
    // — the closest thing to "when that week happened" available to us.
    const weekAnchor = new Map<number, number>();
    for (const row of legRows) {
      if (!row.createdAt) continue;
      const t = new Date(row.createdAt).getTime();
      const existing = weekAnchor.get(row.weekId);
      if (existing === undefined || t < existing) weekAnchor.set(row.weekId, t);
    }
    const activeWeekIds = [...weekAnchor.keys()];

    // Participation uses leg contribution (a member contributed at least one
    // leg to that week's parlay), not parlay ownership — so members whose
    // legs were rolled into another member's parlay still get credit.
    const submittedWeeksByUser = new Map<string, Set<number>>();
    for (const row of legRows) {
      let set = submittedWeeksByUser.get(row.userId);
      if (!set) {
        set = new Set();
        submittedWeeksByUser.set(row.userId, set);
      }
      set.add(row.weekId);
    }

    const memberById = new Map(members.map(m => [m.userId, m]));

    const base = memberUsers.map((user) => {
      const userLegs = legRows.filter((l) => l.userId === user.id);
      const wins = userLegs.filter((l) => l.result === "win").length;
      const losses = userLegs.filter((l) => l.result === "loss").length;
      const pushes = userLegs.filter((l) => l.result === "push").length;
      const totalDecided = wins + losses;
      const winRate = totalDecided > 0 ? (wins / totalDecided) * 100 : 0;

      const legScores: number[] = [];
      for (const leg of userLegs) {
        const score = legPowerContribution(leg.result, leg.odds);
        if (score != null) legScores.push(score);
      }
      const powerScore = averagePowerScore(legScores);

      // Eligible weeks: real league activity that fell inside this member's
      // own membership window, not the league's activity as a whole.
      const membership = memberById.get(user.id);
      const windowStart = membership?.startDate ? new Date(membership.startDate).getTime() : -Infinity;
      const windowEnd = membership?.endDate ? new Date(membership.endDate).getTime() : Date.now();
      const eligibleWeekIds = activeWeekIds.filter(weekId => {
        const t = weekAnchor.get(weekId)!;
        return t >= windowStart && t <= windowEnd;
      });
      const weeksEligible = eligibleWeekIds.length;

      const submitted = submittedWeeksByUser.get(user.id);
      const weeksSubmitted = submitted
        ? eligibleWeekIds.filter(weekId => submitted.has(weekId)).length
        : 0;

      const part = participationRate(weeksSubmitted, weeksEligible);

      return {
        userId: user.id,
        username: (user.settings as any)?.displayName || user.firstName || user.email || "Unknown",
        profileImageUrl: user.profileImageUrl,
        wins,
        losses,
        pushes,
        winRate,
        powerScore,
        participationRate: part,
        region: (user.settings as any)?.region || null,
      };
    });

    return withBar(base).sort((a, b) => b.winRate - a.winRate);
  }

  async getLeagueDataStats(leagueId: number): Promise<LeagueDataStats> {
    const [members, leagueParlays, activeWeek] = await Promise.all([
      db.select().from(leagueMembers).where(eq(leagueMembers.leagueId, leagueId)),
      db.select().from(parlays).where(eq(parlays.leagueId, leagueId)),
      db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1),
    ]);

    const countedParlays = leagueParlays.filter(p => p.status !== 'void');
    const parlayIds = countedParlays.map(p => p.id);
    const totalLegs = parlayIds.length === 0 ? 0 : (
      await db.select().from(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds))
    ).length;

    const totalParlays = countedParlays.length;
    const memberCount = members.length;
    const avgLegsPerParlay = totalParlays > 0 ? totalLegs / totalParlays : 0;

    const currentSeason = activeWeek[0]?.season;
    let seasonWeekIds: number[] | undefined;
    if (currentSeason !== undefined) {
      const seasonWeeks = await db.select().from(weeks).where(eq(weeks.season, currentSeason));
      seasonWeekIds = seasonWeeks.map(w => w.id);
    }

    const [allTimeStandings, currentSeasonStandings] = await Promise.all([
      this.getLeagueStats(leagueId),
      seasonWeekIds ? this.getLeagueStats(leagueId, seasonWeekIds) : Promise.resolve([]),
    ]);

    return {
      totalParlays,
      totalLegs,
      memberCount,
      avgLegsPerParlay,
      allTimeStandings,
      currentSeasonStandings,
    };
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
    // Super users see every league, not just ones they've joined — they
    // aren't a real member of most of them, so isAdmin is synthesized true
    // (same "acts like an admin everywhere" bypass isLeagueAdmin already
    // grants them) rather than derived from a league_members row.
    const isSuper = await this.isSuperUser(userId);

    const memberships = await db.select().from(leagueMembers).where(eq(leagueMembers.userId, userId));
    if (!isSuper && memberships.length === 0) return [];

    const leagueIds = isSuper
      ? (await db.select({ id: leagues.id }).from(leagues)).map(l => l.id)
      : memberships.map(m => m.leagueId);
    if (leagueIds.length === 0) return [];

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
            isDemo: m.user.isDemo,
            settings: m.user.settings as any,
          }
        })),
        memberCount: members.length,
        isAdmin: isSuper || userMembership?.role === 'admin',
        isLieutenant: !isSuper && userMembership?.role === 'lieutenant',
      };
    });
  }

  async getActiveWeekParlayStatus(leagueIds: number[], userId: string): Promise<Record<number, ActiveWeekStatus>> {
    if (leagueIds.length === 0) return {};
    const [activeWeek] = await db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1);
    if (!activeWeek) return {};

    const [parlayRows, lockRows, memberRows] = await Promise.all([
      // Exclude 'draft' — an in-progress, not-yet-submitted parlay must not
      // count toward submittedCount/allSubmitted/currentUserSubmitted, or a
      // user who only started a pick (but never submitted) would be shown
      // as having picked, and hide the "you still need to pick" prompt.
      db.select({ leagueId: parlays.leagueId, userId: parlays.userId, status: parlays.status })
        .from(parlays)
        .where(and(eq(parlays.weekId, activeWeek.id), inArray(parlays.leagueId, leagueIds), not(eq(parlays.status, 'draft')))),
      db.select({ leagueId: leagueWeekLocks.leagueId })
        .from(leagueWeekLocks)
        .where(and(eq(leagueWeekLocks.weekId, activeWeek.id), inArray(leagueWeekLocks.leagueId, leagueIds))),
      db.select({ leagueId: leagueMembers.leagueId })
        .from(leagueMembers)
        .where(inArray(leagueMembers.leagueId, leagueIds)),
    ]);

    const lockedSet = new Set(lockRows.map(l => l.leagueId));
    const result: Record<number, ActiveWeekStatus> = {};
    for (const leagueId of leagueIds) {
      const leagueParlays = parlayRows.filter(p => p.leagueId === leagueId);
      const submittedCount = leagueParlays.length;
      const totalMembers = memberRows.filter(m => m.leagueId === leagueId).length;
      result[leagueId] = {
        weekId: activeWeek.id,
        weekLabel: activeWeek.label,
        submittedCount,
        totalMembers,
        allSubmitted: submittedCount >= totalMembers && totalMembers > 0,
        isLocked: lockedSet.has(leagueId),
        currentUserSubmitted: leagueParlays.some(p => p.userId === userId),
        // Active week parlay status (for Quick Picks tile badges)
        hasPendingParlay: leagueParlays.some(p => p.status === 'pending'),
        hasApprovedParlay: leagueParlays.some(p => p.status === 'approved'),
      };
    }
    return result;
  }

  async getPopularPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<PopularPick[]> {
    const rows = await db
      .select({ leg: parlayLegs })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

    const excludeKeys = new Set(
      rows.filter(r => r.leg.userId === excludeUserId).map(r => pickKey(r.leg))
    );

    const counts = new Map<string, PopularPick>();
    for (const { leg } of rows) {
      if (leg.userId === excludeUserId) continue;
      const key = pickKey(leg);
      if (excludeKeys.has(key)) continue;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, {
          gameId: leg.gameId,
          betType: leg.betType,
          pick: leg.pick,
          playerName: leg.playerName,
          propType: leg.propType,
          count: 1,
        });
      }
    }

    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  }

  /**
   * The exclusivity set for the picks grid: every distinct pick some OTHER
   * league member has already locked in (submitted — status !== 'draft')
   * for this league/week. Unlike getPopularPicksForWeek, a still-drafting
   * opponent's picks don't appear here (they haven't locked anything in
   * yet), and this returns every taken pick, not just a top-10 ranking.
   */
  async getTakenPicksForWeek(leagueId: number, weekId: number, excludeUserId: string): Promise<TakenPick[]> {
    const rows = await db
      .select({ leg: parlayLegs, owner: users })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .innerJoin(users, eq(parlayLegs.userId, users.id))
      .where(and(
        eq(parlays.leagueId, leagueId),
        eq(parlays.weekId, weekId),
        not(eq(parlays.status, 'draft')),
        not(eq(parlayLegs.userId, excludeUserId)),
      ));

    const taken = new Map<string, TakenPick>();
    for (const { leg, owner } of rows) {
      const key = pickKey(leg);
      if (taken.has(key)) continue;
      taken.set(key, {
        gameId: leg.gameId,
        betType: leg.betType,
        pick: leg.pick,
        playerName: leg.playerName,
        propType: leg.propType,
        takenBy: formatPickOwnerLabel({
          firstName: owner.firstName,
          lastName: owner.lastName,
          email: owner.email,
          settings: owner.settings as UserSettings | null,
        }),
      });
    }

    return [...taken.values()];
  }

  // Win rate here is computed from individual parlay_legs.result (per-pick outcomes),
  // not parlays.status — a parlay with a mix of wins/losses is one loss at the
  // parlay level, but the "Overall Picks Won" stat is about how often an individual
  // pick was right, so it counts legs. parlaysWon is the separate whole-parlay
  // count (parlays.status === 'win') used for the "total parlays won" tile.
  async getLeagueOverviewStats(leagueIds: number[]): Promise<Record<number, { wins: number; losses: number; winRate: number; totalDecided: number; parlaysWon: number }>> {
    if (leagueIds.length === 0) return {};

    const legRows = await db
      .select({ leagueId: parlays.leagueId, result: parlayLegs.result })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .where(and(inArray(parlays.leagueId, leagueIds), inArray(parlayLegs.result as any, ['win', 'loss'])));

    const parlayRows = await db
      .select({ leagueId: parlays.leagueId, status: parlays.status })
      .from(parlays)
      .where(inArray(parlays.leagueId, leagueIds));

    const result: Record<number, { wins: number; losses: number; winRate: number; totalDecided: number; parlaysWon: number }> = {};
    for (const leagueId of leagueIds) {
      const rows = legRows.filter(l => l.leagueId === leagueId);
      const wins = rows.filter(l => l.result === 'win').length;
      const losses = rows.filter(l => l.result === 'loss').length;
      const totalDecided = wins + losses;
      const parlaysWon = parlayRows.filter(p => p.leagueId === leagueId && p.status === 'win').length;
      result[leagueId] = {
        wins,
        losses,
        winRate: totalDecided > 0 ? (wins / totalDecided) * 100 : 0,
        totalDecided,
        parlaysWon,
      };
    }
    return result;
  }

  async joinLeague(userId: string, inviteCode: string): Promise<LeagueMember | null> {
    const [league] = await db.select().from(leagues).where(eq(leagues.inviteCode, inviteCode.toUpperCase()));
    if (!league) return null;
    return this.addMemberToLeague(league.id, userId);
  }

  // Active members only — the "current roster" used for access checks, dropdowns,
  // and eligibility. A member who left or was purged no longer counts here even
  // though their historical parlays/legs remain intact.
  async getLeagueMembers(leagueId: number): Promise<LeagueMember[]> {
    return await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.isActive, true)));
  }

  async isSuperUser(userId: string): Promise<boolean> {
    const [user] = await db.select({ isSuperUser: users.isSuperUser }).from(users).where(eq(users.id, userId));
    return user?.isSuperUser === true;
  }

  async isLeagueAdmin(leagueId: number, userId: string): Promise<boolean> {
    if (await this.isSuperUser(userId)) return true;
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId), eq(leagueMembers.isActive, true)));
    return member?.role === 'admin';
  }

  async isLeagueLieutenant(leagueId: number, userId: string): Promise<boolean> {
    if (await this.isSuperUser(userId)) return true;
    const [member] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId), eq(leagueMembers.isActive, true)));
    return member?.role === 'lieutenant';
  }

  async getLeagueMembersWithUsers(leagueId: number, opts?: { includeInactive?: boolean; asOfDate?: Date }): Promise<LeagueMemberWithUser[]> {
    const conditions = [eq(leagueMembers.leagueId, leagueId)];
    if (opts?.asOfDate) {
      // Membership window covers the requested date — used for historical
      // queries (e.g. "who was active in this league during week N's games")
      // rather than today's roster.
      const asOf = opts.asOfDate;
      conditions.push(sql`${leagueMembers.startDate} <= ${asOf}`);
      conditions.push(sql`(${leagueMembers.endDate} IS NULL OR ${leagueMembers.endDate} > ${asOf})`);
    } else if (!opts?.includeInactive) {
      conditions.push(eq(leagueMembers.isActive, true));
    }

    const result = await db.select({
      member: leagueMembers,
      user: users
    })
    .from(leagueMembers)
    .innerJoin(users, eq(leagueMembers.userId, users.id))
    .where(and(...conditions));

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

  async updateLeagueSettings(leagueId: number, updates: Partial<Pick<League, 'name' | 'description' | 'maxParlaysPerWeek' | 'minLegsPerParlay' | 'maxLegsPerParlay' | 'maxBetsPerGame' | 'insightsEnabled' | 'loserLabel'>>): Promise<League> {
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

  // Hard-deletes the league_members row. Only safe to call once no orphaned
  // parlay_legs remain for this user in this league — callers (routes.ts) are
  // responsible for that check; this method itself does not enforce it.
  async removeLeagueMember(leagueId: number, userId: string): Promise<void> {
    await db.delete(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
  }

  // Voluntary/normal departure — the member's row (and historical parlays/legs)
  // stay intact, just marked inactive as of the given date. Distinct from a
  // maestro purge, which can also remove the row entirely.
  async leaveLeagueMember(leagueId: number, userId: string, asOfDate?: Date): Promise<LeagueMember> {
    const [updated] = await db.update(leagueMembers)
      .set({ isActive: false, endDate: asOfDate ?? new Date() })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
      .returning();
    return updated;
  }

  // Maestro-initiated purge that bypasses orphan resolution — marks the member
  // inactive + purged so their still-orphaned legs surface on the exceptions
  // blotter (getOrphanedLegsForLeague) until resolved, at which point the row
  // is hard-deleted (see resolveOrphanedLeg).
  async purgeLeagueMemberBypass(leagueId: number, userId: string): Promise<LeagueMember> {
    const [updated] = await db.update(leagueMembers)
      .set({ isActive: false, endDate: new Date(), purgedAt: new Date() })
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)))
      .returning();
    return updated;
  }

  async getOrphanedLegsForMember(leagueId: number, userId: string): Promise<(ParlayLeg & { game: Game | null; parlay: { id: number; weekId: number } })[]> {
    const rows = await db.select({ leg: parlayLegs, game: games, parlay: parlays })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .where(and(eq(parlays.leagueId, leagueId), eq(parlayLegs.userId, userId)));
    return rows.map(r => ({ ...r.leg, game: r.game, parlay: { id: r.parlay.id, weekId: r.parlay.weekId } }));
  }

  // Exceptions blotter data source — orphaned legs still owned by a purged
  // (isActive=false, purgedAt set) member in this league.
  async getOrphanedLegsForLeague(leagueId: number): Promise<(ParlayLeg & { game: Game | null; parlay: { id: number; weekId: number }; ownerEmail: string | null; ownerFirstName: string | null })[]> {
    const rows = await db.select({ leg: parlayLegs, game: games, parlay: parlays, owner: users })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .innerJoin(leagueMembers, and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, parlayLegs.userId)))
      .innerJoin(users, eq(users.id, parlayLegs.userId))
      .where(and(eq(parlays.leagueId, leagueId), sql`${leagueMembers.purgedAt} IS NOT NULL`));
    return rows.map(r => ({
      ...r.leg,
      game: r.game,
      parlay: { id: r.parlay.id, weekId: r.parlay.weekId },
      ownerEmail: r.owner.email,
      ownerFirstName: r.owner.firstName,
    }));
  }

  // Applies a resolution to one orphaned leg (reassign to an active member, or
  // delete it), then hard-deletes the purged member's row once they have zero
  // orphaned legs left in this league.
  async resolveOrphanedLeg(leagueId: number, legId: number, action: 'reassign' | 'delete', newUserId?: string): Promise<void> {
    const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
    if (!leg) throw new Error("Leg not found");
    const previousOwnerId = leg.userId;

    if (action === 'reassign') {
      if (!newUserId) throw new Error("newUserId is required to reassign a leg");
      await db.update(parlayLegs).set({ userId: newUserId }).where(eq(parlayLegs.id, legId));
    } else {
      await db.delete(parlayLegs).where(eq(parlayLegs.id, legId));
    }

    const remaining = await this.getOrphanedLegsForMember(leagueId, previousOwnerId);
    if (remaining.length === 0) {
      const [member] = await db.select().from(leagueMembers)
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, previousOwnerId)));
      if (member?.purgedAt) {
        await this.removeLeagueMember(leagueId, previousOwnerId);
      }
    }
  }

  async transferLeagueAdmin(leagueId: number, fromUserId: string, toUserId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Promote the new admin
      await tx.update(leagueMembers)
        .set({ role: 'admin' })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, toUserId)));
      // The outgoing admin leaves the league (soft — historical data stays intact)
      await tx.update(leagueMembers)
        .set({ isActive: false, endDate: new Date() })
        .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, fromUserId)));
    });
  }

  // Parlays
  async getParlay(id: number): Promise<Parlay | undefined> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, id));
    return parlay;
  }

  async createParlay(userId: string, parlay: InsertParlay, legs: Omit<InsertParlayLeg, "parlayId" | "userId">[]): Promise<Parlay> {
    // Same cross-user exclusivity + kickoff-cutoff rules as
    // addLegToDraftParlay, applied here too since this full-replace path
    // (editing an already-submitted parlay) is the other way a leg reaches
    // parlayLegs and would otherwise bypass both checks entirely.
    const takenByOthers = await this.getTakenPicksForWeek(parlay.leagueId, parlay.weekId, userId);
    const gameIds = [...new Set(legs.map(l => l.gameId).filter((id): id is number => id != null))];
    const legGames = gameIds.length > 0 ? await db.select().from(games).where(inArray(games.id, gameIds)) : [];
    const gameById = new Map(legGames.map(g => [g.id, g]));
    for (const leg of legs) {
      const legExclusivityKey = exclusivityKey(leg);
      if (legExclusivityKey != null && takenByOthers.some(t => exclusivityKey(t) === legExclusivityKey)) {
        throw new Error(
          leg.betType === 'player_prop'
            ? "This pick has already been taken by another player."
            : "Someone else in the league already has this bet type on this game.",
        );
      }
      if (leg.gameId != null) {
        const game = gameById.get(leg.gameId);
        if (game && (game.isFinished || (game.gameTime && new Date(game.gameTime) < new Date()))) {
          throw new Error("This game has already started and can no longer be picked.");
        }
        if (game) {
          const pointsMoved = impliedPointsMoved(leg.betType, leg.pick, game, leg.line);
          if (pointsMoved > MAX_POINTS_MOVE + 0.01) {
            throw new Error(`Points bought can't exceed ${MAX_POINTS_MOVE}.`);
          }
        }
      }
    }

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
          .values(legs.map((leg) => ({ ...leg, parlayId: parlayRecord.id, userId })));
      }

      return parlayRecord;
    }).then((parlayRecord) => {
      emitLeague(parlay.leagueId, parlay.weekId, "parlays_updated");
      return parlayRecord;
    });
  }

  /**
   * Adds one leg to the caller's in-progress `status: 'draft'` parlay for
   * this league/week, creating the draft row if none exists yet. Unlike
   * `createParlay` (which always fully-replaces a parlay's legs in one
   * call), this lets a user build a parlay one tap at a time — draft
   * parlays may have fewer legs than `minLegsPerParlay`; that's only
   * enforced at final submit (`submitDraftParlay`). `maxLegsPerParlay` is
   * still enforced here since there's no useful reason to let a draft grow
   * past what could ever be submitted. `maxBetsPerGame` caps how many of
   * those legs can share one `gameId` (e.g. only one of the 6 spread/
   * ML/total tiles per game, by default).
   *
   * Also rejects a leg that exactly matches (same gameId/betType/pick, or
   * same playerName/propType/pick for a prop) a leg already locked in by a
   * DIFFERENT user's non-draft parlay this week — cross-user exclusivity.
   * This is a plain read-then-insert check, not lock-protected across users
   * (two different users' draft rows can't share one FOR UPDATE lock the
   * way same-user double-taps below can) — an accepted, low-probability
   * race in this low-concurrency friend-group app.
   */
  async addLegToDraftParlay(
    userId: string,
    leagueId: number,
    weekId: number,
    leg: Omit<InsertParlayLeg, "parlayId" | "userId">,
    maxLegsPerParlay: number,
    maxBetsPerGame: number,
  ): Promise<Parlay> {
    const legExclusivityKey = exclusivityKey(leg);
    if (legExclusivityKey != null) {
      const takenByOthers = await this.getTakenPicksForWeek(leagueId, weekId, userId);
      if (takenByOthers.some(t => exclusivityKey(t) === legExclusivityKey)) {
        throw new Error(
          leg.betType === 'player_prop'
            ? "This pick has already been taken by another player."
            : "Someone else in the league already has this bet type on this game.",
        );
      }
    }

    if (leg.gameId != null) {
      const [game] = await db.select().from(games).where(eq(games.id, leg.gameId));
      if (game && (game.isFinished || (game.gameTime && new Date(game.gameTime) < new Date()))) {
        throw new Error("This game has already started and can no longer be picked.");
      }
      if (game) {
        const pointsMoved = impliedPointsMoved(leg.betType, leg.pick, game, leg.line);
        if (pointsMoved > MAX_POINTS_MOVE + 0.01) {
          throw new Error(`Points bought can't exceed ${MAX_POINTS_MOVE}.`);
        }
      }
    }

    const parlayRecord = await db.transaction(async (tx) => {
      // FOR UPDATE: without a row lock here, two concurrent adds (double-tap,
      // two devices) can both read the same existingLegs count below, both
      // pass the maxLegsPerParlay check, and both insert — overshooting the
      // cap. Locking the parlay row serializes concurrent adds to the same
      // draft so the second one always sees the first's insert.
      const [existing] = await tx
        .select()
        .from(parlays)
        .where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)))
        .for("update");

      let record: Parlay;
      if (existing) {
        if (existing.status !== "draft") {
          throw new Error("You already have a submitted parlay for this week.");
        }
        record = existing;
      } else {
        const [created] = await tx
          .insert(parlays)
          .values({ userId, leagueId, weekId, status: "draft" })
          .returning();
        record = created;
      }

      const existingLegs = await tx.select().from(parlayLegs).where(eq(parlayLegs.parlayId, record.id));
      if (existingLegs.length >= maxLegsPerParlay) {
        throw new Error(`Parlay cannot have more than ${maxLegsPerParlay} legs`);
      }
      if (leg.gameId != null) {
        const legsOnThisGame = existingLegs.filter(l => l.gameId === leg.gameId).length;
        if (legsOnThisGame >= maxBetsPerGame) {
          throw new Error(`You can only pick ${maxBetsPerGame} bet${maxBetsPerGame === 1 ? "" : "s"} on this game.`);
        }
      }

      await tx.insert(parlayLegs).values({ ...leg, parlayId: record.id, userId });
      return record;
    });

    emitLeague(leagueId, weekId, "parlays_updated");
    return parlayRecord;
  }

  /**
   * Removes one leg from the caller's own draft parlay. If that was the
   * last leg, the empty draft row is deleted too (so a fresh draft can be
   * started cleanly rather than leaving a lingering 0-leg parlay around).
   * Returns the updated parlay, or null if the draft was deleted.
   */
  async removeDraftParlayLeg(userId: string, parlayId: number, legId: number): Promise<Parlay | null> {
    const { parlay, leagueId, weekId } = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(parlays).where(eq(parlays.id, parlayId));
      if (!existing || existing.userId !== userId) throw new Error("Parlay not found");
      if (existing.status !== "draft") throw new Error("Only draft parlays can have legs removed this way");

      const deleted = await tx
        .delete(parlayLegs)
        .where(and(eq(parlayLegs.id, legId), eq(parlayLegs.parlayId, parlayId)))
        .returning({ id: parlayLegs.id });
      if (deleted.length === 0) throw new Error("Leg not found on this parlay");

      const remaining = await tx.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
      if (remaining.length === 0) {
        await tx.delete(parlays).where(eq(parlays.id, parlayId));
        return { parlay: null, leagueId: existing.leagueId, weekId: existing.weekId };
      }
      return { parlay: existing, leagueId: existing.leagueId, weekId: existing.weekId };
    });

    emitLeague(leagueId, weekId, "parlays_updated");
    return parlay;
  }

  /**
   * Finalizes a draft parlay: enforces the league's min/max leg count (the
   * min was deferred until now — see `addLegToDraftParlay`) and flips it to
   * `status: 'pending'`, entering the normal approve/reject workflow.
   */
  async submitDraftParlay(
    userId: string,
    parlayId: number,
    minLegsPerParlay: number,
    maxLegsPerParlay: number,
  ): Promise<Parlay> {
    const updated = await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(parlays).where(eq(parlays.id, parlayId));
      if (!existing || existing.userId !== userId) throw new Error("Parlay not found");
      if (existing.status !== "draft") throw new Error("This parlay has already been submitted");

      const legs = await tx.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
      if (legs.length < minLegsPerParlay) {
        throw new Error(`Parlay must have at least ${minLegsPerParlay} legs`);
      }
      if (legs.length > maxLegsPerParlay) {
        throw new Error(`Parlay cannot have more than ${maxLegsPerParlay} legs`);
      }

      const [record] = await tx
        .update(parlays)
        .set({ status: "pending", createdAt: new Date() })
        .where(eq(parlays.id, parlayId))
        .returning();
      return record;
    });

    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
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
      legs: legs.map(l => ({ ...l.leg, game: normalizeJoinedGame(l.game) })),
      week
    };
  }

  async getLeagueParlaysForWeek(leagueId: number, weekId: number): Promise<ParlayWithLegs[]> {
    // leftJoin (not innerJoin) — a parlay must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    const leagueParlays = await db.select({
      parlay: parlays,
      user: users
    })
    .from(parlays)
    .leftJoin(users, eq(parlays.userId, users.id))
    .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

    if (leagueParlays.length === 0) return [];

    const [week] = await db.select().from(weeks).where(eq(weeks.id, weekId));

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    // leftJoin (not innerJoin) — a leg must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    const allLegs = await db.select({ leg: parlayLegs, game: games, legUser: users })
      .from(parlayLegs)
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .leftJoin(users, eq(parlayLegs.userId, users.id))
      .where(inArray(parlayLegs.parlayId, parlayIds));

    const legsByParlayId = new Map<number, ParlayWithLegs["legs"]>();
    for (const { leg, game, legUser } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({
        ...leg,
        game: normalizeJoinedGame(game),
        user: legUser ? { firstName: legUser.firstName, email: legUser.email, profileImageUrl: legUser.profileImageUrl, isDemo: legUser.isDemo, settings: legUser.settings as any } : undefined,
      });
      legsByParlayId.set(leg.parlayId, existing);
    }

    return leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week,
      user: user ? { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo, settings: user.settings as any } : undefined,
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

  // Fires once the mobile app successfully hands off to the sportsbook app's
  // deep link. Idempotent from 'sent' so a retry/double-tap doesn't error.
  // 'sent'/'placed' are intentionally left out of rollupParlayStatus's
  // terminalStatuses — they fall through to auto win/loss resolution exactly
  // like 'approved' does, since a parlay can resolve without the maestro ever
  // confirming placement.
  async markParlaySent(parlayId: number, userId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'sent' })
      .where(and(eq(parlays.id, parlayId), inArray(parlays.status, ['approved', 'sent'])))
      .returning();
    if (!updated) throw new Error("Parlay is not in a state that can be sent to a sportsbook");
    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
  }

  // Maestro self-confirms they actually placed the bet with the sportsbook.
  async markParlayPlaced(parlayId: number, userId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'placed' })
      .where(and(eq(parlays.id, parlayId), eq(parlays.status, 'sent')))
      .returning();
    if (!updated) throw new Error("Parlay is not pending placement confirmation");
    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
  }

  // "No, I didn't place it" — reverts to 'approved' so it can be re-sent.
  async revertParlayToApproved(parlayId: number, userId: string): Promise<Parlay> {
    const [updated] = await db.update(parlays)
      .set({ status: 'approved' })
      .where(and(eq(parlays.id, parlayId), eq(parlays.status, 'sent')))
      .returning();
    if (!updated) throw new Error("Parlay is not pending placement confirmation");
    emitLeague(updated.leagueId, updated.weekId, "parlays_updated");
    return updated;
  }

  // Parlays a maestro approved that are stuck in 'sent', used to prompt for
  // placement confirmation when the app resumes to the foreground.
  async getSentParlaysForUser(userId: string): Promise<ParlayWithLegs[]> {
    const sentParlays = await db.select().from(parlays)
      .where(and(eq(parlays.status, 'sent'), eq(parlays.approvedBy, userId)));

    if (sentParlays.length === 0) return [];

    const parlayIds = sentParlays.map(p => p.id);
    const legs = await db.select().from(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds));
    const gameIds = [...new Set(legs.map(l => l.gameId).filter((id): id is number => id != null))];
    const gameRows = gameIds.length ? await db.select().from(games).where(inArray(games.id, gameIds)) : [];
    const gamesById = new Map(gameRows.map(g => [g.id, g]));

    const legsByParlayId = new Map<number, any[]>();
    for (const leg of legs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({ ...leg, game: leg.gameId != null ? gamesById.get(leg.gameId) : undefined });
      legsByParlayId.set(leg.parlayId, existing);
    }

    return sentParlays.map(parlay => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
    })) as ParlayWithLegs[];
  }

  async getUserParlayHistory(userId: string, leagueId?: number, weekIdFilter?: number[]): Promise<ParlayWithLegs[]> {
    const conditions = [eq(parlays.userId, userId)];
    if (leagueId) conditions.push(eq(parlays.leagueId, leagueId));
    if (weekIdFilter && weekIdFilter.length > 0) conditions.push(inArray(parlays.weekId, weekIdFilter));
    const userParlays = await db.select().from(parlays).where(and(...conditions));

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
      existing.push({ ...leg, game: normalizeJoinedGame(game) });
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

  async getUserLegHistory(userId: string, leagueId?: number): Promise<ParlayLegWithParlayContext[]> {
    // leftJoin (not innerJoin) on users — a leg the caller contributed must never
    // disappear just because the parlay's owner record doesn't resolve (e.g. stale
    // import data). Missing `owner` (when not the caller's own parlay) signals that.
    const rows = await db.select({ leg: parlayLegs, game: games, parlay: parlays, owner: users })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .leftJoin(users, eq(parlays.userId, users.id))
      .leftJoin(games, eq(parlayLegs.gameId, games.id))
      .where(
        leagueId
          ? and(eq(parlayLegs.userId, userId), eq(parlays.leagueId, leagueId))
          : eq(parlayLegs.userId, userId)
      );

    if (rows.length === 0) return [];

    const weekIds = [...new Set(rows.map(r => r.parlay.weekId))];
    const allWeeks = await db.select().from(weeks).where(inArray(weeks.id, weekIds));
    const weekById = new Map(allWeeks.map(w => [w.id, w]));

    return rows
      .map(({ leg, game, parlay, owner }) => {
        const isOwnParlay = parlay.userId === userId;
        return {
          ...leg,
          game,
          parlay: {
            id: parlay.id,
            weekId: parlay.weekId,
            week: weekById.get(parlay.weekId)!,
            status: parlay.status,
            isOwnParlay,
            owner: isOwnParlay || !owner ? null : { firstName: owner.firstName, email: owner.email, settings: owner.settings as any },
          },
        };
      })
      .sort((a, b) => {
        // Lookthrough view: most-recent pick first, keyed off the game's actual
        // kickoff time rather than week number so legs read in true date order.
        const aTime = a.game?.gameTime ? new Date(a.game.gameTime).getTime() : 0;
        const bTime = b.game?.gameTime ? new Date(b.game.gameTime).getTime() : 0;
        return bTime - aTime || b.id - a.id;
      });
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

  async getAllLeagueParlays(
    leagueId: number,
    opts: { limit?: number; offset?: number; all?: boolean; weekIds?: number[] } = {},
  ): Promise<{ items: ParlayWithLegs[]; total: number; limit: number; offset: number; hasMore: boolean }> {
    const DEFAULT_LIMIT = 50;
    const MAX_LIMIT = 100;
    const offset = Math.max(0, opts.offset ?? 0);
    const limit = opts.all
      ? Number.MAX_SAFE_INTEGER
      : Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT));

    // A weekIds scope (e.g. "this season + last season") is already a bounded
    // set on the caller's side, so it's treated like `all` — no limit/offset —
    // rather than silently truncating a multi-season view to 50 rows.
    const unbounded = opts.all || (opts.weekIds != null && opts.weekIds.length > 0);
    const scopeCondition = opts.weekIds != null && opts.weekIds.length > 0
      ? and(eq(parlays.leagueId, leagueId), inArray(parlays.weekId, opts.weekIds))
      : eq(parlays.leagueId, leagueId);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(parlays)
      .where(scopeCondition);
    const total = Number(count) || 0;

    // leftJoin (not innerJoin) — a parlay must never disappear from the results just
    // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
    // data with a stale owner reference). Missing `user` signals that to callers.
    let query = db.select({ parlay: parlays, user: users })
      .from(parlays)
      .leftJoin(users, eq(parlays.userId, users.id))
      .where(scopeCondition)
      .orderBy(desc(parlays.createdAt))
      .$dynamic();

    if (!unbounded) {
      query = query.limit(limit).offset(offset);
    }

    const leagueParlays = await query;

    if (leagueParlays.length === 0) {
      return { items: [], total, limit: unbounded ? total : limit, offset, hasMore: false };
    }

    const parlayIds = leagueParlays.map(({ parlay }) => parlay.id);
    const weekIds = [...new Set(leagueParlays.map(({ parlay }) => parlay.weekId))];

    const [allLegs, allWeeks] = await Promise.all([
      // leftJoin (not innerJoin) — a leg must never disappear from the results just
      // because its userId doesn't resolve to a row in `users` (e.g. legacy/import
      // data with a stale owner reference). Missing `user` signals that to callers.
      db.select({ leg: parlayLegs, game: games, legUser: users })
        .from(parlayLegs)
        .leftJoin(games, eq(parlayLegs.gameId, games.id))
        .leftJoin(users, eq(parlayLegs.userId, users.id))
        .where(inArray(parlayLegs.parlayId, parlayIds)),
      db.select().from(weeks).where(inArray(weeks.id, weekIds)),
    ]);

    const legsByParlayId = new Map<number, ParlayWithLegs["legs"]>();
    for (const { leg, game, legUser } of allLegs) {
      const existing = legsByParlayId.get(leg.parlayId) ?? [];
      existing.push({
        ...leg,
        game: normalizeJoinedGame(game),
        user: legUser ? { firstName: legUser.firstName, email: legUser.email, profileImageUrl: legUser.profileImageUrl, isDemo: legUser.isDemo, settings: legUser.settings as any } : undefined,
      });
      legsByParlayId.set(leg.parlayId, existing);
    }
    const weekById = new Map(allWeeks.map(w => [w.id, w]));

    const items = leagueParlays.map(({ parlay, user }) => ({
      ...parlay,
      legs: legsByParlayId.get(parlay.id) ?? [],
      week: weekById.get(parlay.weekId)!,
      user: user ? { firstName: user.firstName, email: user.email, profileImageUrl: user.profileImageUrl, isDemo: user.isDemo, settings: user.settings as any } : undefined,
    }));

    const effectiveLimit = unbounded ? items.length : limit;
    return {
      items,
      total,
      limit: effectiveLimit,
      offset,
      hasMore: unbounded ? false : offset + items.length < total,
    };
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

  async updateParlayLeg(legId: number, updates: Partial<Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'oddsSource' | 'result' | 'resultDetail' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>>): Promise<ParlayLeg> {
    const normalized = { ...updates, ...normalizeParlayLegPatch(updates) };
    const [updated] = await db.update(parlayLegs).set(normalized).where(eq(parlayLegs.id, legId)).returning();
    return updated;
  }

  async bulkUpdateParlayLegs(legIds: number[], field: keyof Pick<ParlayLeg, 'betType' | 'pick' | 'line' | 'odds' | 'oddsSource' | 'result' | 'playerName' | 'propType' | 'notes' | 'gameSegment' | 'userId'>, value: string | null): Promise<ParlayLeg[]> {
    return db.update(parlayLegs).set({ [field]: value }).where(inArray(parlayLegs.id, legIds)).returning();
  }

  async addParlayLeg(parlayId: number, leg: Omit<InsertParlayLeg, 'parlayId'> & { userId: string }): Promise<ParlayLeg> {
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

  async splitParlayLegs(leagueId: number, parlayId: number, legIds: number[]): Promise<Parlay> {
    const source = await this.getParlay(parlayId);
    if (!source || source.leagueId !== leagueId) throw new Error("Parlay not found in this league");
    if (legIds.length === 0) throw new Error("No legs selected to split");
    const newParlay = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parlays).values({
        userId: source.userId,
        weekId: source.weekId,
        leagueId: source.leagueId,
        status: source.status ?? "pending",
        source: "imported",
      }).returning();
      await tx.update(parlayLegs)
        .set({ parlayId: created.id })
        .where(and(eq(parlayLegs.parlayId, parlayId), inArray(parlayLegs.id, legIds)));
      return created;
    });
    emitLeague(leagueId, source.weekId, "parlays_updated");
    return newParlay;
  }

  async createHistoricalParlay(userId: string, leagueId: number, weekId: number, legs: Array<{ betType: string; pick: string; line?: string | null; odds?: string | null; result?: string | null; playerName?: string | null; propType?: string | null; gameSegment?: string | null; notes?: string | null }>): Promise<Parlay> {
    const newParlay = await db.transaction(async (tx) => {
      // Replace rather than blind-insert: a second call for the same
      // user/league/week (e.g. re-running the demo-data tool) must not
      // create a duplicate parlay — matches createParlay's behavior and the
      // parlays_user_league_week_uidx invariant.
      const existing = await tx
        .select()
        .from(parlays)
        .where(and(eq(parlays.userId, userId), eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));

      let created: Parlay;
      if (existing.length > 0) {
        await tx.delete(parlayLegs).where(eq(parlayLegs.parlayId, existing[0].id));
        const [updated] = await tx
          .update(parlays)
          .set({ status: "approved", source: "imported", createdAt: new Date(), approvedBy: null, approvedAt: null })
          .where(eq(parlays.id, existing[0].id))
          .returning();
        created = updated;
      } else {
        const [inserted] = await tx.insert(parlays).values({
          userId, leagueId, weekId, status: "approved", source: "imported",
        }).returning();
        created = inserted;
      }
      if (legs.length > 0) {
        await tx.insert(parlayLegs).values(legs.map(leg => ({
          parlayId: created.id,
          userId,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line ?? null,
          odds: leg.odds ?? null,
          result: leg.result ?? null,
          playerName: leg.playerName ?? null,
          propType: leg.propType ?? null,
          gameSegment: leg.gameSegment ?? null,
          notes: leg.notes ?? null,
        })));
      }
      return created;
    });
    emitLeague(leagueId, weekId, "parlays_updated");
    return newParlay;
  }

  // Duplicates a decided parlay's picks into a fresh 'pending' parlay for
  // targetWeekId, preserving each leg's original contributor (leg.userId) so a
  // team parlay's structure carries over intact. gameId/result/oddsEnriched are
  // NOT copied — the target week's games are a different matchup, so each
  // game-tied leg (spread/moneyline/over/under) starts unlinked until re-picked;
  // player-prop legs (no gameId dependency) come through fully usable.
  async cloneParlay(sourceParlayId: number, targetWeekId: number): Promise<Parlay> {
    const [source] = await db.select().from(parlays).where(eq(parlays.id, sourceParlayId));
    if (!source) throw new Error("Source parlay not found");

    const sourceLegs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, sourceParlayId));

    const newParlay = await db.transaction(async (tx) => {
      const [created] = await tx.insert(parlays).values({
        userId: source.userId,
        leagueId: source.leagueId,
        weekId: targetWeekId,
        status: "pending",
        source: "live",
      }).returning();

      if (sourceLegs.length > 0) {
        await tx.insert(parlayLegs).values(sourceLegs.map(leg => ({
          parlayId: created.id,
          userId: leg.userId,
          betType: leg.betType,
          pick: leg.pick,
          line: leg.line,
          odds: leg.odds,
          oddsSource: leg.oddsSource,
          gameSegment: leg.gameSegment,
          playerName: leg.playerName,
          propType: leg.propType,
          notes: leg.notes,
        })));
      }
      return created;
    });
    emitLeague(source.leagueId, targetWeekId, "parlays_updated");
    return newParlay;
  }

  async getActiveWeek(): Promise<Week | null> {
    const [week] = await db.select().from(weeks).where(eq(weeks.isActive, true)).limit(1);
    return week ?? null;
  }

  // Members counted "as of" a week are the ones on the roster when that week's
  // games kicked off — not today's roster — so a member who joined/left the
  // league later doesn't wrongly count as missing/present for a past week.
  // Falls back to the current roster when the week has no scheduled games yet
  // (e.g. an upcoming week with odds not loaded).
  private async getWeekAsOfDate(weekId: number): Promise<Date | undefined> {
    const [earliestGame] = await db.select({ gameTime: games.gameTime })
      .from(games)
      .where(and(eq(games.weekId, weekId), sql`${games.gameTime} IS NOT NULL`))
      .orderBy(asc(games.gameTime))
      .limit(1);
    return earliestGame?.gameTime ?? undefined;
  }

  async getMissingParlayMembers(leagueId: number, weekId: number): Promise<LeagueMemberWithUser[]> {
    const asOfDate = await this.getWeekAsOfDate(weekId);
    const members = await this.getLeagueMembersWithUsers(leagueId, asOfDate ? { asOfDate } : {});

    const submitted = await db.select({ userId: parlays.userId }).from(parlays)
      .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId)));
    const submittedIds = new Set(submitted.map(s => s.userId));

    return members.filter(m => !submittedIds.has(m.userId));
  }

  async backfillMissingParlays(leagueId: number, weekId: number): Promise<Parlay[]> {
    const missing = await this.getMissingParlayMembers(leagueId, weekId);
    if (missing.length === 0) return [];

    const created = await db.insert(parlays)
      .values(missing.map(m => ({ userId: m.userId, leagueId, weekId, status: "void", source: "imported" })))
      .onConflictDoNothing()
      .returning();

    if (created.length > 0) emitLeague(leagueId, weekId, "parlays_updated");
    return created;
  }

  async createDispute(input: { parlayLegId: number; raisedByUserId: string; reasonType: string; justification: string; screenshotKey?: string | null }): Promise<ParlayLegDispute> {
    const [created] = await db.insert(parlayLegDisputes).values({
      parlayLegId: input.parlayLegId,
      raisedByUserId: input.raisedByUserId,
      reasonType: input.reasonType,
      justification: input.justification,
      screenshotKey: input.screenshotKey ?? null,
    }).returning();
    return created;
  }

  async getOpenDisputeForLeg(parlayLegId: number): Promise<ParlayLegDispute | null> {
    const [dispute] = await db.select().from(parlayLegDisputes)
      .where(and(eq(parlayLegDisputes.parlayLegId, parlayLegId), eq(parlayLegDisputes.status, "open")));
    return dispute ?? null;
  }

  async getDisputesForLeg(parlayLegId: number): Promise<ParlayLegDispute[]> {
    return db.select().from(parlayLegDisputes)
      .where(eq(parlayLegDisputes.parlayLegId, parlayLegId))
      .orderBy(desc(parlayLegDisputes.createdAt));
  }

  async getDispute(id: number): Promise<ParlayLegDispute | null> {
    const [dispute] = await db.select().from(parlayLegDisputes).where(eq(parlayLegDisputes.id, id));
    return dispute ?? null;
  }

  async listDisputes(status?: string): Promise<Array<ParlayLegDispute & {
    leg: ParlayLeg;
    parlay: Parlay;
    leagueName: string;
    weekLabel: string;
    raisedByName: string;
  }>> {
    const rows = await db
      .select({
        dispute: parlayLegDisputes,
        leg: parlayLegs,
        parlay: parlays,
        leagueName: leagues.name,
        weekLabel: weeks.label,
        raisedByFirstName: users.firstName,
        raisedByEmail: users.email,
      })
      .from(parlayLegDisputes)
      .innerJoin(parlayLegs, eq(parlayLegDisputes.parlayLegId, parlayLegs.id))
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .innerJoin(leagues, eq(parlays.leagueId, leagues.id))
      .innerJoin(weeks, eq(parlays.weekId, weeks.id))
      .innerJoin(users, eq(parlayLegDisputes.raisedByUserId, users.id))
      .where(status ? eq(parlayLegDisputes.status, status) : undefined)
      .orderBy(desc(parlayLegDisputes.createdAt));

    return rows.map(r => ({
      ...r.dispute,
      leg: r.leg,
      parlay: r.parlay,
      leagueName: r.leagueName,
      weekLabel: r.weekLabel,
      raisedByName: r.raisedByFirstName || r.raisedByEmail || "Unknown",
    }));
  }

  async resolveDispute(id: number, resolverUserId: string, status: "resolved" | "dismissed", notes?: string): Promise<ParlayLegDispute> {
    const existing = await this.getDispute(id);
    if (!existing) throw new Error("Dispute not found");

    const resolvedAt = new Date();
    const title = status === "resolved" ? "Dispute resolved" : "Dispute dismissed";
    const message = notes?.trim()
      ? `Ruling: ${notes.trim()}`
      : status === "resolved"
        ? "Your dispute was reviewed and resolved."
        : "Your dispute was reviewed and dismissed — no change was made.";

    let result: ParlayLegDispute;
    if (status === "dismissed") {
      // Dismissed disputes have nothing worth keeping on record — hard-delete
      // the row rather than archiving it (screenshot cleanup is the caller's
      // job, since bucket access lives outside this data-access layer).
      await db.delete(parlayLegDisputes).where(eq(parlayLegDisputes.id, id));
      result = { ...existing, status, resolvedByUserId: resolverUserId, resolvedAt, resolutionNotes: notes ?? null };
    } else {
      const [updated] = await db.update(parlayLegDisputes)
        .set({ status, resolvedByUserId: resolverUserId, resolvedAt, resolutionNotes: notes ?? null, archivedAt: resolvedAt })
        .where(eq(parlayLegDisputes.id, id))
        .returning();
      result = updated;
    }

    await this.createNotification({ userId: existing.raisedByUserId, type: "dispute_resolved", title, message });

    return result;
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
          userId,
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

  /**
   * Compute a parlay's outcome from its legs and update its status to
   * 'win' / 'loss' if all legs are resolved.
   *
   * Rules:
   *  - Skip if status is already a terminal result or is 'rejected'/'void'
   *  - Skip if any leg still has no result
   *  - Any leg = 'loss' → parlay = 'loss'
   *  - Otherwise (all wins, or wins + pushes, zero losses) → parlay = 'win'
   *
   * A parlay only wins if every leg hits; a single push doesn't break that,
   * but a single loss always makes it a loss. 'push' is no longer an
   * automatically-computed parlay status — it remains a manually-settable
   * override for admins, but the rollup never assigns it itself.
   */
  async rollupParlayStatus(parlayId: number): Promise<void> {
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, parlayId));
    if (!parlay) return;

    // 'sent'/'placed' (sportsbook handoff states) are intentionally absent
    // here — they fall through to the same auto win/loss resolution as
    // 'approved', since a bet resolves whether or not the maestro ever
    // confirms placement. 'draft' is excluded for the opposite reason: it's
    // not a resolution-pending state, it's not-yet-submitted — a draft must
    // never be auto-graded, even if its legs' games have already finished.
    const terminalStatuses = ['draft', 'win', 'loss', 'push', 'rejected', 'void'];
    if (terminalStatuses.includes(parlay.status ?? '')) return;

    const legs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, parlayId));
    if (legs.length === 0) return;
    if (legs.some(l => !l.result)) return; // not all resolved yet

    const newStatus = legs.some(l => l.result === 'loss') ? 'loss' : 'win';

    await db.update(parlays).set({ status: newStatus }).where(eq(parlays.id, parlayId));
  }

  /**
   * Roll up parlay statuses for all parlays in a league (or all leagues if
   * leagueId is omitted).
   *
   * By default, only touches parlays not already in a terminal state — safe
   * to call repeatedly. Pass `recomputeTerminal: true` to also recompute
   * parlays already marked 'win' or 'push' (e.g. a one-time backfill after
   * changing the win/loss rule) — 'rejected'/'void' are never recomputed
   * since those are administrative, not leg-driven. Returns counts of
   * updated vs skipped parlays.
   */
  async rollupLeagueParlayStatuses(leagueId?: number, recomputeTerminal = false): Promise<{ updated: number; skipped: number }> {
    // Same 'sent'/'placed' fall-through as rollupParlayStatus above. 'draft'
    // is always excluded, even with recomputeTerminal — a draft must never
    // be auto-graded regardless of what its legs' games have done.
    const terminalStatuses = ['draft', 'win', 'loss', 'push', 'rejected', 'void'];
    const excludedStatuses = recomputeTerminal ? ['draft', 'rejected', 'void'] : terminalStatuses;

    const allParlays = leagueId
      ? await db.select({ id: parlays.id }).from(parlays)
          .where(and(
            eq(parlays.leagueId, leagueId),
            not(inArray(parlays.status as any, excludedStatuses))
          ))
      : await db.select({ id: parlays.id }).from(parlays)
          .where(not(inArray(parlays.status as any, excludedStatuses)));

    if (allParlays.length === 0) return { updated: 0, skipped: 0 };

    const parlayIds = allParlays.map((p) => p.id);
    const allLegs = await db
      .select({ parlayId: parlayLegs.parlayId, result: parlayLegs.result })
      .from(parlayLegs)
      .where(inArray(parlayLegs.parlayId, parlayIds));

    const resultsByParlay = new Map<number, (string | null)[]>();
    for (const leg of allLegs) {
      const list = resultsByParlay.get(leg.parlayId) ?? [];
      list.push(leg.result);
      resultsByParlay.set(leg.parlayId, list);
    }

    const toWin: number[] = [];
    const toLoss: number[] = [];
    let skipped = 0;

    for (const { id } of allParlays) {
      const results = resultsByParlay.get(id) ?? [];
      if (results.length === 0 || results.some((r) => !r)) {
        skipped++;
        continue;
      }
      if (results.some((r) => r === "loss")) toLoss.push(id);
      else toWin.push(id);
    }

    if (toWin.length > 0) {
      await db.update(parlays).set({ status: "win" }).where(inArray(parlays.id, toWin));
    }
    if (toLoss.length > 0) {
      await db.update(parlays).set({ status: "loss" }).where(inArray(parlays.id, toLoss));
    }

    return { updated: toWin.length + toLoss.length, skipped };
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
    const [existing] = await db.select().from(leagueMembers)
      .where(and(eq(leagueMembers.leagueId, leagueId), eq(leagueMembers.userId, userId)));
    if (existing) {
      if (existing.isActive) return existing;
      // Rejoin: reactivate rather than insert a second row for this (league, user) pair.
      const [reactivated] = await db.update(leagueMembers)
        .set({ isActive: true, startDate: new Date(), endDate: null, purgedAt: null })
        .where(eq(leagueMembers.id, existing.id))
        .returning();
      return reactivated;
    }
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
    const merged = mergeUserSettings(
      current?.settings as UserSettings | null | undefined,
      settings as UserSettings,
    );
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
    if (members.length === 0) return;
    await db.insert(notifications).values(
      members.map((member) => ({
        userId: member.userId,
        leagueId,
        type: "announcement" as const,
        title,
        message,
      })),
    );
    for (const member of members) {
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

    // Count how many have a submitted parlay for this week — 'draft' (still
    // being built, never hit submit) doesn't count, or allSubmitted could
    // go true from in-progress drafts alone and the lock action would skip
    // its "members without a pick will be void" warning for real non-submitters.
    const submitted = await db.select().from(parlays)
      .where(and(eq(parlays.leagueId, leagueId), eq(parlays.weekId, weekId), not(eq(parlays.status, 'draft'))));
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

    // Never fabricate a kickoff time — a caller-supplied gameDate is used as
    // given, but without one this must stay null (not "now"). Callers and
    // display code already treat a missing gameTime as "Time TBD"; a fake
    // "now" timestamp masquerades as real data instead and is exactly what
    // corrupted games.gameTime for historical imports before. A later
    // syncGameTimesFromNflverse run fills the real date in from the schedule.
    const [created] = await db.insert(games).values({
      weekId,
      homeTeam: homeTeam.trim(),
      awayTeam: awayTeam.trim(),
      gameTime: gameDate ?? null,
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
    updates: { result?: string | null; resultDetail?: string | null; line?: string | null; oddsEnriched: boolean }
  ): Promise<void> {
    const set: Record<string, unknown> = { oddsEnriched: updates.oddsEnriched };
    if (updates.result !== undefined) set.result = updates.result;
    if (updates.resultDetail !== undefined) set.resultDetail = updates.resultDetail;
    if (updates.line !== undefined) set.line = updates.line;
    await db.update(parlayLegs).set(set as any).where(eq(parlayLegs.id, legId));
  }

  /** Batch variant of enrichParlayLeg — chunks concurrent updates inside one transaction. */
  async enrichParlayLegsBatch(
    updates: Array<{ id: number; result?: string | null; resultDetail?: string | null; line?: string | null; oddsEnriched: boolean }>
  ): Promise<void> {
    if (updates.length === 0) return;
    const CHUNK = 50;
    await db.transaction(async (tx) => {
      for (let i = 0; i < updates.length; i += CHUNK) {
        const chunk = updates.slice(i, i + CHUNK);
        await Promise.all(
          chunk.map((u) => {
            const set: Record<string, unknown> = { oddsEnriched: u.oddsEnriched };
            if (u.result !== undefined) set.result = u.result;
            if (u.resultDetail !== undefined) set.resultDetail = u.resultDetail;
            if (u.line !== undefined) set.line = u.line;
            return tx.update(parlayLegs).set(set as any).where(eq(parlayLegs.id, u.id));
          }),
        );
      }
    });
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
      .set({ homeScore, awayScore, isFinished, winner: w, finishedAt: isFinished ? new Date() : null })
      .where(eq(games.id, gameId));
  }

  /**
   * Overwrites finishedAt with a more precise value (e.g. derived from the
   * real-world timestamp of a game's last play), independent of score/winner.
   */
  async setGameFinishedAt(gameId: number, finishedAt: Date): Promise<void> {
    await db.update(games).set({ finishedAt }).where(eq(games.id, gameId));
  }

  /**
   * Overwrites a game's kickoff timestamp — used to correct rows whose
   * gameTime was never the real kickoff (e.g. historical imports that
   * defaulted to the import date) with the actual date/time from a
   * schedule source like nflverse.
   */
  async updateGameTime(gameId: number, gameTime: Date): Promise<void> {
    await db.update(games).set({ gameTime }).where(eq(games.id, gameId));
  }

  /**
   * One-time backfill for games that were finished before `finishedAt` existed.
   * Estimates finish time as kickoff + ~3.5 hours (typical NFL game length) —
   * an approximation, not a recorded fact, so "Parlay Loser" also works for
   * historical parlays instead of only ones resolved from now on.
   */
  async backfillGameFinishedAt(): Promise<{ updated: number }> {
    const rows = await db.select().from(games).where(and(eq(games.isFinished, true), isNull(games.finishedAt)));
    let updated = 0;
    for (const g of rows) {
      if (!g.gameTime) continue;
      const estimate = new Date(new Date(g.gameTime).getTime() + 3.5 * 60 * 60 * 1000);
      await db.update(games).set({ finishedAt: estimate }).where(eq(games.id, g.id));
      updated++;
    }
    return { updated };
  }

  async getDistinctSeasons(): Promise<number[]> {
    const rows = await db.selectDistinct({ season: weeks.season }).from(weeks);
    return rows.map(r => r.season).sort((a, b) => a - b);
  }

  // ─── Decision-moment detection (Phase 3) ───────────────────────────────────
  // Legs whose leg-level result is already confirmed but whose decidedAt is
  // still unset — candidates for exact/heuristic mid-game "when did this
  // actually become fixed" detection from play-by-play data. Each (betType,
  // result) pair here must have a deterministic or defensible early-decision
  // point (see decisionDetection.ts's module docstring for the full
  // rationale): e.g. a spread/moneyline/under WIN or LOSS both have one
  // (mirror-image "eliminated" heuristics), but an over/prop LOSS doesn't —
  // the total/stat can only move upward, so a loss is never fixed early and
  // is correctly left to resolve at the final whistle only.

  async getGameLegsPendingDecision(criteria: { betType: string; result: "win" | "loss" }[], leagueId?: number): Promise<(ParlayLeg & { game: Game; season: number; weekNumber: number })[]> {
    const rows = await db
      .select({ leg: parlayLegs, game: games, season: weeks.season, weekNumber: weeks.weekNumber })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .innerJoin(weeks, eq(parlays.weekId, weeks.id))
      .innerJoin(games, eq(parlayLegs.gameId, games.id))
      .where(
        and(
          or(...criteria.map(c => and(eq(parlayLegs.betType, c.betType), eq(parlayLegs.result, c.result)))),
          isNull(parlayLegs.decidedAt),
          leagueId !== undefined ? eq(parlays.leagueId, leagueId) : undefined,
        )
      );
    return rows.map(r => ({ ...r.leg, game: r.game, season: r.season, weekNumber: r.weekNumber }));
  }

  async getWonPropLegsPendingDecision(leagueId?: number): Promise<(ParlayLeg & { season: number; weekNumber: number })[]> {
    const rows = await db
      .select({ leg: parlayLegs, season: weeks.season, weekNumber: weeks.weekNumber })
      .from(parlayLegs)
      .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
      .innerJoin(weeks, eq(parlays.weekId, weeks.id))
      .where(
        leagueId !== undefined
          ? and(eq(parlayLegs.betType, "player_prop"), eq(parlayLegs.result, "win"), isNull(parlayLegs.decidedAt), eq(parlays.leagueId, leagueId))
          : and(eq(parlayLegs.betType, "player_prop"), eq(parlayLegs.result, "win"), isNull(parlayLegs.decidedAt))
      );
    return rows.map(r => ({ ...r.leg, season: r.season, weekNumber: r.weekNumber }));
  }

  async setLegDecision(
    legId: number,
    info: { decidedAt: Date; decidedPlayDesc: string; decidedQuarter: string; decidedClock: string; decidedConfidence: string }
  ): Promise<void> {
    await db.update(parlayLegs).set(info).where(eq(parlayLegs.id, legId));
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

  /**
   * Upsert a player discovered via ESPN's boxscore API, which has no GSIS
   * (nflverseId) — only its own athlete id. Resolution order:
   *   1. Existing row with this espnId (fast path once backfilled).
   *   2. Existing nflverse-created row matching by normalized name — the
   *      espnId is backfilled onto it so future calls hit path 1, and this
   *      avoids creating a duplicate player for someone nflverse already
   *      populated via passing/rushing/receiving stats.
   *   3. Otherwise insert a brand-new row (e.g. a pure defender nflverse's
   *      legacy fallback file never had a column for).
   */
  async upsertPlayerByEspn(
    data: Omit<InsertPlayer, 'updatedAt' | 'nflverseId'> & { espnId: string },
  ): Promise<Player> {
    const [byEspnId] = await db.select().from(players).where(eq(players.espnId, data.espnId));
    if (byEspnId) {
      const [updated] = await db.update(players)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(players.id, byEspnId.id))
        .returning();
      return updated;
    }

    const norm = normalizePlayerName(data.displayName || data.name);
    const candidates = await db.select().from(players)
      .where(ilike(players.displayName, `%${data.displayName || data.name}%`));
    const nameMatch = candidates.find((c) => normalizePlayerName(c.displayName ?? c.name) === norm);
    if (nameMatch) {
      const [updated] = await db.update(players)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(players.id, nameMatch.id))
        .returning();
      return updated;
    }

    const [created] = await db.insert(players)
      .values({ ...data, updatedAt: new Date() })
      .returning();
    return created;
  }

  /** Full team reference list, for typeahead pickers (e.g. Advanced Filters' team field). Only 32 rows — no search param needed. */
  async getAllTeams(): Promise<Team[]> {
    return db.select().from(teams).orderBy(teams.nickname);
  }

  async searchPlayers(query: string, limit = 20): Promise<Player[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return db.select().from(players).orderBy(players.name).limit(limit);
    }
    return db.select().from(players)
      .where(ilike(players.name, `%${trimmed}%`))
      .orderBy(players.name)
      .limit(limit);
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
    const normalize = normalizePlayerName;
    const norm = normalize(playerName);

    // Try exact ilike match on both name columns first (fast DB query)
    const run = async (col: any, pattern: string) => {
      const rows = await db
        .select({ stat: playerWeekStats, player: players })
        .from(playerWeekStats)
        .innerJoin(players, eq(playerWeekStats.playerId, players.id))
        .where(and(ilike(col, `%${pattern}%`), eq(playerWeekStats.season, season), eq(playerWeekStats.week, week)))
        .limit(1);
      return rows.length > 0 ? { ...rows[0].stat, player: rows[0].player } : null;
    };

    // Pass 1: exact name as given
    const r1 = (await run(players.name, playerName)) ?? (await run(players.displayName, playerName));
    if (r1) return r1;

    // Pass 2: normalized name (strips suffixes/punctuation)
    if (norm !== playerName.toLowerCase()) {
      const r2 = (await run(players.name, norm)) ?? (await run(players.displayName, norm));
      if (r2) return r2;
    }

    // Pass 3: each significant word of the name (catches "Henry" matching "Derrick Henry")
    // Only use this if we have at least 2 words to avoid too-broad single-word matches
    const words = norm.split(" ").filter(w => w.length > 2);
    if (words.length >= 2) {
      const lastName = words[words.length - 1]; // most distinctive word
      const candidateRows = await db
        .select({ stat: playerWeekStats, player: players })
        .from(playerWeekStats)
        .innerJoin(players, eq(playerWeekStats.playerId, players.id))
        .where(and(
          ilike(players.displayName, `%${lastName}%`),
          eq(playerWeekStats.season, season),
          eq(playerWeekStats.week, week)
        ))
        .limit(20);

      // Among candidates, find the one whose normalized display name best matches
      for (const row of candidateRows) {
        const candidateNorm = normalize(row.player.displayName ?? row.player.name);
        if (candidateNorm.includes(norm) || norm.includes(candidateNorm)) {
          return { ...row.stat, player: row.player };
        }
      }
    }

    return null;
  }

  async setLegEnrichmentLog(legId: number, log: string): Promise<void> {
    await db.update(parlayLegs).set({ enrichmentLog: log } as any).where(eq(parlayLegs.id, legId));
  }

  // ===== Custom indexes =====

  async createCustomIndex(ownerId: string, input: InsertCustomIndex): Promise<CustomIndex> {
    const [created] = await db.insert(customIndexes)
      .values({
        ownerId,
        displayName: input.displayName,
        scope: input.scope ?? 'private',
        publishedLeagueId: input.scope === 'league' ? input.publishedLeagueId ?? null : null,
        filters: input.filters,
      })
      .returning();
    return created;
  }

  /**
   * Every index the user may see: their own, ones shared with them, and league
   * defaults published in a league they belong to. Deduped, owner-first.
   */
  async listVisibleCustomIndexes(userId: string): Promise<CustomIndexWithAccess[]> {
    const memberships = await db
      .select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userId));
    const myLeagueIds = memberships.map(m => m.leagueId);

    const owned = await db.select().from(customIndexes).where(eq(customIndexes.ownerId, userId));

    const sharedRows = await db.select({ idx: customIndexes })
      .from(customIndexShares)
      .innerJoin(customIndexes, eq(customIndexShares.customIndexId, customIndexes.id))
      .where(eq(customIndexShares.sharedWithUserId, userId));

    const published = myLeagueIds.length > 0
      ? await db.select().from(customIndexes)
          .where(and(eq(customIndexes.scope, 'league'), inArray(customIndexes.publishedLeagueId, myLeagueIds)))
      : [];

    const byId = new Map<number, CustomIndexWithAccess>();
    const add = (idx: CustomIndex, access: CustomIndexWithAccess['access']) => {
      if (byId.has(idx.id)) return; // first writer wins: owner > shared > league
      byId.set(idx.id, { ...idx, isOwner: idx.ownerId === userId, access });
    };

    owned.forEach(i => add(i, 'owner'));
    sharedRows.forEach(r => add(r.idx, 'shared'));
    published.forEach(i => add(i, 'league'));

    // Attach share lists so owners can manage them without an extra round trip
    const ownedIds = owned.map(i => i.id);
    if (ownedIds.length > 0) {
      const shares = await db.select().from(customIndexShares)
        .where(inArray(customIndexShares.customIndexId, ownedIds));
      for (const share of shares) {
        const entry = byId.get(share.customIndexId);
        if (entry) entry.sharedWithUserIds = [...(entry.sharedWithUserIds ?? []), share.sharedWithUserId];
      }
    }

    return Array.from(byId.values());
  }

  async getCustomIndex(id: number): Promise<CustomIndex | undefined> {
    const [row] = await db.select().from(customIndexes).where(eq(customIndexes.id, id));
    return row;
  }

  async updateCustomIndex(id: number, updates: UpdateCustomIndex): Promise<CustomIndex> {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.displayName !== undefined) set.displayName = updates.displayName;
    if (updates.filters !== undefined) set.filters = updates.filters;
    if (updates.scope !== undefined) {
      set.scope = updates.scope;
      // Demoting to private clears the publish target so it can't leak league-wide
      set.publishedLeagueId = updates.scope === 'league' ? updates.publishedLeagueId ?? null : null;
    } else if (updates.publishedLeagueId !== undefined) {
      set.publishedLeagueId = updates.publishedLeagueId;
    }

    const [updated] = await db.update(customIndexes)
      .set(set)
      .where(eq(customIndexes.id, id))
      .returning();
    return updated;
  }

  async deleteCustomIndex(id: number): Promise<void> {
    await db.delete(customIndexes).where(eq(customIndexes.id, id));
  }

  async shareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void> {
    await db.insert(customIndexShares)
      .values({ customIndexId, sharedWithUserId })
      .onConflictDoNothing();
  }

  async unshareCustomIndex(customIndexId: number, sharedWithUserId: string): Promise<void> {
    await db.delete(customIndexShares)
      .where(and(
        eq(customIndexShares.customIndexId, customIndexId),
        eq(customIndexShares.sharedWithUserId, sharedWithUserId),
      ));
  }

  async getCustomIndexShares(customIndexId: number): Promise<string[]> {
    const rows = await db.select({ userId: customIndexShares.sharedWithUserId })
      .from(customIndexShares)
      .where(eq(customIndexShares.customIndexId, customIndexId));
    return rows.map(r => r.userId);
  }

  // ─── Story Studio ──────────────────────────────────────────────────────

  async createStoryReport(userId: string, input: InsertStoryReport): Promise<StoryReport> {
    const [created] = await db.insert(storyReports)
      .values({
        leagueId: input.leagueId,
        weekId: input.weekId,
        userId,
        selectedStory: input.selectedStory,
        thesis: input.thesis,
        tone: input.tone,
      })
      .returning();
    return created;
  }

  async getStoryReportWithSections(id: number): Promise<StoryReportWithSections | undefined> {
    const [report] = await db.select().from(storyReports).where(eq(storyReports.id, id));
    if (!report) return undefined;
    const sections = await db.select().from(storySections)
      .where(eq(storySections.reportId, id))
      .orderBy(storySections.order);
    return { ...report, sections };
  }

  async updateStoryReport(id: number, updates: UpdateStoryReport): Promise<StoryReport> {
    const [updated] = await db.update(storyReports)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(storyReports.id, id))
      .returning();
    return updated;
  }

  async upsertStorySection(
    reportId: number,
    kind: StorySectionKind,
    order: number,
    data: { content?: string; generatedContent?: string; promptVersion?: string },
  ): Promise<StorySection> {
    const [section] = await db.insert(storySections)
      .values({ reportId, kind, order, ...data })
      .onConflictDoUpdate({
        target: [storySections.reportId, storySections.kind],
        set: { ...data, updatedAt: new Date() },
      })
      .returning();
    return section;
  }

  /** True when both users belong to at least one league in common. */
  async usersShareALeague(userIdA: string, userIdB: string): Promise<boolean> {
    const a = db.select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, userIdA));
    const [row] = await db.select({ leagueId: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(and(
        eq(leagueMembers.userId, userIdB),
        inArray(leagueMembers.leagueId, a),
      ))
      .limit(1);
    return !!row;
  }
}

export const storage = new DatabaseStorage();
