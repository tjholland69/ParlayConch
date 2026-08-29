import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { logger } from "./logger";
import { db } from "./db";
import { setupAuth, registerAuthRoutes, isAuthenticated, registerLocalAuthRoutes } from "./replit_integrations/auth";
import { z } from "zod";
import { insertLeagueSchema, type LieutenantPermissions, DEFAULT_LIEUTENANT_PERMISSIONS, users, leagueMembers, parlayLegs, parlays, insertCustomIndexSchema, updateCustomIndexSchema, customIndexFiltersEqual, type CustomIndexFilters } from "@shared/schema";
import { ilike, eq, and, or, inArray, sql as drizzleSql } from "drizzle-orm";
import { getApiUsage, fetchUpcomingGames, syncGameScores, syncGamesFromOddsApi } from "./services/oddsApi";
import { runOddsSyncQueued, startOddsSyncWorker, getOddsSyncJobStatus } from "./jobs/odds-sync-queue";
import {
  enqueueNflverseSync,
  getNflverseSyncJobStatus,
  startNflverseSyncWorker,
} from "./jobs/nflverse-sync-queue";
import { startSeasonRolloverWorker, runSeasonRolloverCheckNow } from "./jobs/season-rollover-queue";
import { connectSessionRedis, isRedisConfigured } from "./redis-clients";
import { registerRealtimeWebSocket } from "./realtime-ws";
import { fetchNFLNews, fetchNFLInjuries, fetchNFLScores } from "./services/nflNews";
import { getUserInsights, getLeagueInsights, type InsightFocus } from "./services/bettingInsights";
import { getUserSummary, getUserPatterns, getWinRateTimeSeries, computeWinRateSeries, getLeagueWeeklyWinRates } from "./services/dashboardAnalytics";
import { getLeagueRecords } from "./services/leagueRecords";
import { getGameForecast } from "./services/weatherApi";
import { cacheGetJson, cacheSetJson } from "./cache";
import { getWeeklyAnalyticsReport } from "./services/storyStudio/analyticsEngine";
import { discoverStories } from "./services/storyStudio/storyDiscovery";
import { generateSection } from "./services/storyStudio/editorialGeneration";
import { insertStoryReportSchema, updateStoryReportSchema, STORY_SECTION_KINDS, type StorySectionKind } from "@shared/schema";
import { resolvePropsFromStats, fetchPropLinesFromOddsApi } from "./services/propEnrichment";
import { auditLog, recordAuditEvent } from "./services/audit";
import { uploadDisputeScreenshot, getDisputeScreenshotUrl, deleteDisputeScreenshot } from "./disputeStorage";
import { sendMemberAddedEmail, sendLeagueInviteEmail } from "./services/email";
import { enrichLeagueParlayLegs } from "./services/enrichment";
import { enrichSingleLeg } from "./services/legEnrich";
import { syncGameFinishTimesFromPlayByPlay } from "./services/playByPlay";
import { detectExactDecisionMoments, detectHeuristicDecisionMoments } from "./services/decisionDetection";
import { parseTicketImages } from "./services/screenshotParser";
import { emptyToNull, normalizeAddParlayLegInput, normalizeImportLegFields, normalizeUpdateParlayInput } from "@shared/dataIntegrity";
import {
  addParlayLegInputSchema,
  createParlayInputSchema,
  draftParlayLegInputSchema,
  updateLeagueNotificationSettingsSchema,
  updateLeagueSettingsSchema,
  updateParlayInputSchema,
  updateParlayLegInputSchema,
  updateUserSettingsSchema,
} from "@shared/routeValidation";
import multer from "multer";

/** Returns true if the user is an admin OR is a lieutenant with the specified permission enabled. */
async function hasLeaguePermission(leagueId: number, userId: string, permission: keyof LieutenantPermissions): Promise<boolean> {
  const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
  if (isAdmin) return true;
  const isLt = await storage.isLeagueLieutenant(leagueId, userId);
  if (!isLt) return false;
  const league = await storage.getLeague(leagueId);
  const perms = (league?.lieutenantPermissions as LieutenantPermissions) || DEFAULT_LIEUTENANT_PERMISSIONS;
  return perms[permission];
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await connectSessionRedis();

  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);
  registerLocalAuthRoutes(app);

  if (isRedisConfigured()) {
    startOddsSyncWorker();
    startNflverseSyncWorker();
    await startSeasonRolloverWorker();
  }
  registerRealtimeWebSocket(httpServer, app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // === Act-As middleware for super users ===
  // Overrides req.user.claims.sub for all routes except /api/superuser/* and /api/auth/user.
  // The override is only applied when a super user has set an active act-as session.
  //
  // IMPORTANT: req.user is the same object reference as req.session.passport.user
  // (passport's deserializeUser passes it through unchanged). Mutating it in place
  // would permanently rewrite the real super user's identity in the persisted
  // session — replace req.user with a shallow copy instead of mutating it.
  app.use((req, _res, next) => {
    const session = req.session as any;
    if (
      session?.actingAsUserId &&
      req.user &&
      !req.path.startsWith("/api/superuser") &&
      req.path !== "/api/auth/user"
    ) {
      const realUser = req.user as any;
      req.user = {
        ...realUser,
        claims: { ...realUser.claims, sub: session.actingAsUserId },
      } as Express.User;
    }
    next();
  });

  // === Super User endpoints ===
  // All of these intentionally bypass the act-as override (path starts with /api/superuser).

  app.get("/api/superuser/acting-as", isAuthenticated, async (req, res) => {
    try {
      const realUserId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(realUserId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const actingAsUserId = (req.session as any).actingAsUserId as string | undefined;
      if (!actingAsUserId) return res.json({ actingAs: null });
      const [actingAsUser] = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName, settings: users.settings })
        .from(users)
        .where(eq(users.id, actingAsUserId));
      res.json({ actingAs: actingAsUser || null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/superuser/users", isAuthenticated, async (req, res) => {
    try {
      const realUserId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(realUserId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const q = (req.query.q as string || "").trim();
      const userFields = {
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        settings: users.settings,
      };
      let results;
      if (q) {
        results = await db
          .select(userFields)
          .from(users)
          .where(or(
            ilike(users.email, `%${q}%`),
            ilike(users.firstName, `%${q}%`),
            ilike(users.lastName, `%${q}%`),
            ilike(drizzleSql`${users.settings}->>'displayName'`, `%${q}%`),
          ))
          .limit(10);
      } else {
        // Default: return users who are admins in at least one league
        results = await db
          .selectDistinct(userFields)
          .from(users)
          .innerJoin(leagueMembers, and(eq(leagueMembers.userId, users.id), eq(leagueMembers.role, "admin")))
          .limit(20);
      }
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/superuser/act-as", isAuthenticated, async (req, res) => {
    try {
      const realUserId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(realUserId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const { userId } = z.object({ userId: z.string() }).parse(req.body);
      const [targetUser] = await db
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, userId));
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      (req.session as any).actingAsUserId = userId;
      await recordAuditEvent({
        eventType: "superuser.act_as.start",
        actorUserId: realUserId,
        targetType: "user",
        targetId: userId,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
        metadata: { targetEmail: targetUser.email },
      });
      res.json({ actingAs: targetUser });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.delete("/api/superuser/act-as", isAuthenticated, async (req, res) => {
    try {
      const realUserId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(realUserId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      // Captured before deletion — auditLog's res.on('finish') pattern reads
      // the session too late to see this, so it's recorded explicitly here.
      const endedActingAsUserId = (req.session as any).actingAsUserId ?? null;
      delete (req.session as any).actingAsUserId;
      await recordAuditEvent({
        eventType: "superuser.act_as.end",
        actorUserId: realUserId,
        targetType: "user",
        targetId: endedActingAsUserId,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? undefined,
      });
      res.json({ actingAs: null });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Weeks
  app.get("/api/weeks", async (req, res) => {
    const weeks = await storage.getWeeks();
    res.json(weeks);
  });

  app.get("/api/weeks/:id", async (req, res) => {
    const week = await storage.getWeek(Number(req.params.id));
    if (!week) return res.status(404).json({ message: "Week not found" });
    res.json(week);
  });

  // Games
  app.get("/api/weeks/:id/games", async (req, res) => {
    const weekId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub;
    const games = await storage.getGamesByWeek(weekId, userId);
    res.json(games);
  });

  // Stats
  app.get("/api/stats", async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // ===== DASHBOARD =====
  app.get("/api/dashboard/summary", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    const cacheKey = `dashboard:summary:${userId}:${leagueId ?? "all"}`;
    const cached = await cacheGetJson<Awaited<ReturnType<typeof getUserSummary>>>(cacheKey);
    if (cached) return res.json(cached);
    const summary = await getUserSummary(userId, leagueId);
    await cacheSetJson(cacheKey, summary, 60);
    res.json(summary);
  });

  app.get("/api/dashboard/patterns", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    const cacheKey = `dashboard:patterns:v2:${userId}:${leagueId ?? "all"}`;
    const cached = await cacheGetJson<Awaited<ReturnType<typeof getUserPatterns>>>(cacheKey);
    if (cached) return res.json(cached);
    const patterns = await getUserPatterns(userId, leagueId);
    await cacheSetJson(cacheKey, patterns, 60);
    res.json(patterns);
  });

  app.get("/api/dashboard/performance", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    const startDate = typeof req.query.startDate === "string" && req.query.startDate ? new Date(req.query.startDate) : undefined;
    const endDate = typeof req.query.endDate === "string" && req.query.endDate ? new Date(req.query.endDate) : undefined;
    const season = typeof req.query.season === "string" && req.query.season ? Number(req.query.season) : undefined;
    const series = await getWinRateTimeSeries(userId, leagueId, { startDate, endDate, season });
    res.json(series);
  });

  // Ad-hoc, nothing persisted — the "Advanced Filters" view.
  app.get("/api/dashboard/performance/advanced", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;

    const csvNumbers = (v: unknown): number[] | undefined => {
      if (typeof v !== "string" || !v.trim()) return undefined;
      const nums = v.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n));
      return nums.length > 0 ? nums : undefined;
    };
    const csvStrings = (v: unknown): string[] | undefined => {
      if (typeof v !== "string" || !v.trim()) return undefined;
      const parts = v.split(",").map(s => s.trim()).filter(Boolean);
      return parts.length > 0 ? parts : undefined;
    };
    const str = (v: unknown): string | undefined =>
      typeof v === "string" && v.trim() ? v.trim() : undefined;

    const dateVal = (v: unknown): Date | undefined => {
      const s = str(v);
      return s ? new Date(s) : undefined;
    };

    const series = await computeWinRateSeries(userId, {
      leagueIds: csvNumbers(req.query.leagueIds),
      memberUserIds: csvStrings(req.query.memberUserIds),
      betTypes: csvStrings(req.query.betTypes),
      propTypes: csvStrings(req.query.propTypes),
      playerName: str(req.query.playerName),
      teamName: str(req.query.teamName),
      startDate: dateVal(req.query.startDate),
      endDate: dateVal(req.query.endDate),
    });
    res.json(series);
  });

  // ===== CUSTOM INDEXES =====

  /** Visibility rule shared by list and per-index reads. */
  async function canViewCustomIndex(index: { id: number; ownerId: string; scope: string | null; publishedLeagueId: number | null }, userId: string): Promise<boolean> {
    if (index.ownerId === userId) return true;
    const shares = await storage.getCustomIndexShares(index.id);
    if (shares.includes(userId)) return true;
    if (index.scope === 'league' && index.publishedLeagueId) {
      const members = await storage.getLeagueMembers(index.publishedLeagueId);
      return members.some(m => m.userId === userId);
    }
    return false;
  }

  app.get("/api/custom-indexes", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const indexes = await storage.listVisibleCustomIndexes(userId);
    res.json(indexes);
  });

  app.post("/api/custom-indexes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertCustomIndexSchema.parse(req.body);

      if (input.scope === 'league') {
        if (!input.publishedLeagueId) {
          return res.status(400).json({ message: "A league must be selected to publish a league default index" });
        }
        const isAdmin = await storage.isLeagueAdmin(input.publishedLeagueId, userId);
        if (!isAdmin) return res.status(403).json({ message: "Only the Parlay Maestro can publish a league default index" });
      }

      // Block duplicates against anything already in the user's list (owned, shared,
      // or league-published) — an identical filter set just clutters the dropdown.
      const visible = await storage.listVisibleCustomIndexes(userId);
      const dupe = visible.find((idx) => customIndexFiltersEqual(idx.filters, input.filters));
      if (dupe) {
        return res.status(409).json({
          message: `You already have an index with these exact filters: "${dupe.displayName}"`,
          existingId: dupe.id,
        });
      }

      const created = await storage.createCustomIndex(userId, input);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.errors?.[0]?.message ?? err.message });
    }
  });

  app.patch("/api/custom-indexes/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = Number(req.params.id);

      const existing = await storage.getCustomIndex(id);
      if (!existing) return res.status(404).json({ message: "Custom index not found" });
      if (existing.ownerId !== userId) return res.status(403).json({ message: "Only the owner can edit this index" });

      const updates = updateCustomIndexSchema.parse(req.body);

      if (updates.scope === 'league') {
        const leagueId = updates.publishedLeagueId ?? existing.publishedLeagueId;
        if (!leagueId) {
          return res.status(400).json({ message: "A league must be selected to publish a league default index" });
        }
        const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
        if (!isAdmin) return res.status(403).json({ message: "Only the Parlay Maestro can publish a league default index" });
        updates.publishedLeagueId = leagueId;
      }

      if (updates.filters) {
        const visible = await storage.listVisibleCustomIndexes(userId);
        const dupe = visible.find((idx) => idx.id !== id && customIndexFiltersEqual(idx.filters, updates.filters!));
        if (dupe) {
          return res.status(409).json({
            message: `You already have an index with these exact filters: "${dupe.displayName}"`,
            existingId: dupe.id,
          });
        }
      }

      const updated = await storage.updateCustomIndex(id, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.errors?.[0]?.message ?? err.message });
    }
  });

  app.delete("/api/custom-indexes/:id", isAuthenticated, auditLog("custom_index.delete", { targetParam: "id", targetType: "custom_index" }), async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const id = Number(req.params.id);

    const existing = await storage.getCustomIndex(id);
    if (!existing) return res.status(404).json({ message: "Custom index not found" });
    if (existing.ownerId !== userId) return res.status(403).json({ message: "Only the owner can delete this index" });

    await storage.deleteCustomIndex(id);
    res.status(204).end();
  });

  app.post("/api/custom-indexes/:id/share", isAuthenticated, async (req, res) => {
    try {
      const ownerId = (req.user as any).claims.sub;
      const id = Number(req.params.id);

      const existing = await storage.getCustomIndex(id);
      if (!existing) return res.status(404).json({ message: "Custom index not found" });
      if (existing.ownerId !== ownerId) return res.status(403).json({ message: "Only the owner can share this index" });

      const { userId: targetUserId } = z.object({ userId: z.string().min(1) }).parse(req.body);
      if (targetUserId === ownerId) return res.status(400).json({ message: "You already own this index" });

      const shareALeague = await storage.usersShareALeague(ownerId, targetUserId);
      if (!shareALeague) return res.status(403).json({ message: "You can only share with members of your leagues" });

      await storage.shareCustomIndex(id, targetUserId);
      res.status(201).json({ customIndexId: id, sharedWithUserId: targetUserId });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.errors?.[0]?.message ?? err.message });
    }
  });

  app.delete("/api/custom-indexes/:id/share/:userId", isAuthenticated, auditLog("custom_index.unshare", { targetParam: "id", targetType: "custom_index" }), async (req, res) => {
    const ownerId = (req.user as any).claims.sub;
    const id = Number(req.params.id);

    const existing = await storage.getCustomIndex(id);
    if (!existing) return res.status(404).json({ message: "Custom index not found" });
    if (existing.ownerId !== ownerId) return res.status(403).json({ message: "Only the owner can unshare this index" });

    await storage.unshareCustomIndex(id, req.params.userId);
    res.status(204).end();
  });

  app.get("/api/custom-indexes/:id/performance", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const id = Number(req.params.id);

    const index = await storage.getCustomIndex(id);
    if (!index) return res.status(404).json({ message: "Custom index not found" });

    const visible = await canViewCustomIndex(index, userId);
    if (!visible) return res.status(403).json({ message: "You don't have access to this index" });

    const filters = (index.filters ?? {}) as CustomIndexFilters;
    const series = await computeWinRateSeries(userId, {
      leagueIds: filters.leagueIds,
      memberUserIds: filters.memberUserIds,
      betTypes: filters.betTypes,
      propTypes: filters.propTypes,
      playerName: filters.playerName,
      teamName: filters.teamName,
    });
    res.json(series);
  });

  // ===== LEAGUES =====
  app.get("/api/leagues", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagues = await storage.getUserLeagues(userId);
    res.json(leagues);
  });

  app.post("/api/leagues", isAuthenticated, async (req, res) => {
    try {
      const input = insertLeagueSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const league = await storage.createLeague(userId, input);
      res.status(201).json(league);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post("/api/leagues/join", isAuthenticated, async (req, res) => {
    const { inviteCode } = req.body;
    if (!inviteCode) return res.status(400).json({ message: "Invite code required" });
    
    const userId = (req.user as any).claims.sub;
    const member = await storage.joinLeague(userId, inviteCode);
    if (!member) return res.status(404).json({ message: "Invalid invite code" });
    res.json(member);
  });

  // Must be before /api/leagues/:id to avoid route conflict
  app.get("/api/leagues/overview-stats", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userLeagues = await storage.getUserLeagues(userId);
    const leagueIds = userLeagues.map(l => l.id);
    const stats = await storage.getLeagueOverviewStats(leagueIds);
    res.json(stats);
  });

  // Must be before /api/leagues/:id to avoid route conflict
  app.get("/api/leagues/weekly-win-rates", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userLeagues = await storage.getUserLeagues(userId);
    const leagueIds = userLeagues.map(l => l.id);
    const series = await getLeagueWeeklyWinRates(leagueIds);
    res.json(series);
  });

  app.get("/api/leagues/active-week-status", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const userLeagues = await storage.getUserLeagues(userId);
    const leagueIds = userLeagues.map(l => l.id);
    const status = await storage.getActiveWeekParlayStatus(leagueIds, userId);
    res.json(status);
  });

  app.get("/api/leagues/:id", isAuthenticated, async (req, res) => {
    const league = await storage.getLeague(Number(req.params.id));
    if (!league) return res.status(404).json({ message: "League not found" });
    res.json(league);
  });

  app.get("/api/leagues/:id/stats", isAuthenticated, async (req, res) => {
    const stats = await storage.getLeagueStats(Number(req.params.id));
    res.json(stats);
  });

  app.get("/api/leagues/:id/data-stats", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const stats = await storage.getLeagueDataStats(leagueId);
    res.json(stats);
  });

  app.get("/api/leagues/:id/records", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const records = await getLeagueRecords(leagueId);
    res.json(records);
  });

  // Member-facing read-only view of all parlays across all weeks (no demo/admin gating)
  app.get("/api/leagues/:id/parlays", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const weekIds = typeof req.query.weekIds === "string" && req.query.weekIds
      ? req.query.weekIds.split(",").map(Number).filter((n) => Number.isFinite(n))
      : undefined;
    const page = await storage.getAllLeagueParlays(leagueId, { limit, offset, weekIds });
    res.json(page);
  });

  app.get("/api/leagues/:leagueId/weeks/:weekId/popular-picks", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const weekId = Number(req.params.weekId);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const picks = await storage.getPopularPicksForWeek(leagueId, weekId, userId);
    res.json(picks);
  });

  // The picks-grid exclusivity set: every pick a DIFFERENT league member has
  // already locked in (submitted) for this week, so the client can gray out
  // those tiles. See storage.getTakenPicksForWeek.
  app.get("/api/leagues/:leagueId/weeks/:weekId/taken-picks", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const weekId = Number(req.params.weekId);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const picks = await storage.getTakenPicksForWeek(leagueId, weekId, userId);
    res.json(picks);
  });

  // ===== PARLAYS =====
  app.post("/api/parlays", isAuthenticated, async (req, res) => {
    try {
      const input = createParlayInputSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;

      // Validate league membership
      const leagues = await storage.getUserLeagues(userId);
      const league = leagues.find(l => l.id === input.leagueId);
      if (!league) return res.status(403).json({ message: "Not a member of this league" });

      // Validate leg count
      if (input.legs.length < (league.minLegsPerParlay || 3)) {
        return res.status(400).json({ message: `Parlay must have at least ${league.minLegsPerParlay || 3} legs` });
      }
      if (input.legs.length > (league.maxLegsPerParlay || 5)) {
        return res.status(400).json({ message: `Parlay cannot have more than ${league.maxLegsPerParlay || 5} legs` });
      }

      const parlay = await storage.createParlay(
        userId,
        { leagueId: input.leagueId, weekId: input.weekId },
        input.legs.map(l => ({
          userId,
          gameId: l.gameId,
          betType: l.betType,
          pick: l.pick,
          line: emptyToNull(l.line)
        }))
      );
      res.status(201).json(parlay);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // POST /api/leagues/:leagueId/weeks/:weekId/draft-parlay/legs — adds ONE leg
  // to (or starts) the caller's in-progress draft parlay for this league/week.
  // Unlike POST /api/parlays (full-replace, requires minLegsPerParlay already
  // met), this is the "pick one leg at a time, it joins a queue" flow — the
  // draft can sit below minLegsPerParlay until /submit is called. Returns the
  // full parlay (with legs) via the same shape as GET .../my-parlay.
  app.post("/api/leagues/:leagueId/weeks/:weekId/draft-parlay/legs", isAuthenticated, async (req, res) => {
    try {
      const leg = draftParlayLegInputSchema.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const leagueId = Number(req.params.leagueId);
      const weekId = Number(req.params.weekId);

      const leagues = await storage.getUserLeagues(userId);
      const league = leagues.find(l => l.id === leagueId);
      if (!league) return res.status(403).json({ message: "Not a member of this league" });

      await storage.addLegToDraftParlay(
        userId,
        leagueId,
        weekId,
        {
          gameId: leg.gameId,
          betType: leg.betType,
          pick: leg.pick,
          line: emptyToNull(leg.line),
          playerName: leg.playerName ?? null,
          propType: leg.propType ?? null,
        },
        league.maxLegsPerParlay || 5,
        league.maxBetsPerGame || 1,
      );

      const parlay = await storage.getUserParlayForWeek(userId, leagueId, weekId);
      res.status(201).json(parlay);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message });
    }
  });

  // DELETE /api/parlays/:id/legs/:legId — removes one leg from the caller's
  // own draft parlay (only draft — once submitted, edits go through the
  // existing full-replace POST /api/parlays flow instead).
  app.delete("/api/parlays/:id/legs/:legId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const parlay = await storage.removeDraftParlayLeg(userId, Number(req.params.id), Number(req.params.legId));
      res.json({ parlay });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // POST /api/parlays/:id/submit — finalizes the caller's own draft parlay:
  // enforces minLegsPerParlay (deferred until now) and flips it to 'pending',
  // entering the normal approve/reject workflow.
  app.post("/api/parlays/:id/submit", isAuthenticated, auditLog("parlay.submit_draft", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const parlayId = Number(req.params.id);

      const existing = await storage.getParlay(parlayId);
      if (!existing) return res.status(404).json({ message: "Parlay not found" });

      const leagues = await storage.getUserLeagues(userId);
      const league = leagues.find(l => l.id === existing.leagueId);
      if (!league) return res.status(403).json({ message: "Not a member of this league" });

      const parlay = await storage.submitDraftParlay(
        userId,
        parlayId,
        league.minLegsPerParlay || 3,
        league.maxLegsPerParlay || 5,
      );
      res.json(parlay);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/parlays/my", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    // Optional bound to a specific set of weeks (e.g. "active week + last 3
    // completed weeks") so the mobile Picks tab isn't forced to load every
    // parlay the user has ever placed just to show what's currently open.
    const weekIds = typeof req.query.weekIds === "string" && req.query.weekIds
      ? req.query.weekIds.split(",").map(Number).filter((n) => Number.isFinite(n))
      : undefined;
    const history = await storage.getUserParlayHistory(userId, leagueId, weekIds);
    res.json(history);
  });

  app.get("/api/parlay-legs/my", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    res.json(await storage.getUserLegHistory(userId, leagueId));
  });

  app.get("/api/leagues/:leagueId/weeks/:weekId/parlays", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.leagueId);
    const weekId = Number(req.params.weekId);
    const parlays = await storage.getLeagueParlaysForWeek(leagueId, weekId);
    res.json(parlays);
  });

  app.get("/api/leagues/:leagueId/weeks/:weekId/my-parlay", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = Number(req.params.leagueId);
    const weekId = Number(req.params.weekId);
    const parlay = await storage.getUserParlayForWeek(userId, leagueId, weekId);
    res.json(parlay);
  });

  // Admin: Approve/Reject parlays
  app.post("/api/parlays/:id/approve", isAuthenticated, auditLog("parlay.approve", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    const parlayId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    // Get the parlay first to find its league
    const parlay = await storage.getParlay(parlayId);
    if (!parlay) {
      return res.status(404).json({ message: "Parlay not found" });
    }

    // Check if user is admin of this specific league
    const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only the Parlay Maestro can approve parlays" });
    }

    // A draft (still being built, never hit submit) can't be approved — it
    // may have fewer legs than minLegsPerParlay, which submitDraftParlay is
    // the only path that's supposed to enforce.
    if (parlay.status === "draft") {
      return res.status(400).json({ message: "This parlay hasn't been submitted yet." });
    }

    const updated = await storage.approveParlay(parlayId, userId);
    res.json(updated);
  });

  app.post("/api/parlays/:id/reject", isAuthenticated, auditLog("parlay.reject", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    const parlayId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    // Get the parlay first to find its league
    const parlay = await storage.getParlay(parlayId);
    if (!parlay) {
      return res.status(404).json({ message: "Parlay not found" });
    }

    // Check if user is admin of this specific league
    const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only the Parlay Maestro can reject parlays" });
    }

    const updated = await storage.rejectParlay(parlayId, userId);
    res.json(updated);
  });

  // Maestro confirms the deep link successfully launched their sportsbook app.
  app.post("/api/parlays/:id/mark-sent", isAuthenticated, auditLog("parlay.mark_sent", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    const parlayId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    const parlay = await storage.getParlay(parlayId);
    if (!parlay) {
      return res.status(404).json({ message: "Parlay not found" });
    }

    const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only the Parlay Maestro can send parlays to a sportsbook" });
    }

    try {
      const updated = await storage.markParlaySent(parlayId, userId);
      res.json(updated);
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // Maestro self-confirms they actually placed the bet with the sportsbook.
  app.post("/api/parlays/:id/mark-placed", isAuthenticated, auditLog("parlay.mark_placed", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    const parlayId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    const parlay = await storage.getParlay(parlayId);
    if (!parlay) {
      return res.status(404).json({ message: "Parlay not found" });
    }

    const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only the Parlay Maestro can confirm a placed bet" });
    }

    try {
      const updated = await storage.markParlayPlaced(parlayId, userId);
      res.json(updated);
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // "No, I didn't place it" — reverts a sent parlay back to approved so it can be re-sent.
  app.post("/api/parlays/:id/revert-to-approved", isAuthenticated, auditLog("parlay.revert_to_approved", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    const parlayId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;

    const parlay = await storage.getParlay(parlayId);
    if (!parlay) {
      return res.status(404).json({ message: "Parlay not found" });
    }

    const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only the Parlay Maestro can update a sent parlay" });
    }

    try {
      const updated = await storage.revertParlayToApproved(parlayId, userId);
      res.json(updated);
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // Parlays this user approved that are awaiting placement confirmation —
  // used to prompt "did you place this bet?" when the app resumes.
  app.get("/api/users/me/sent-parlays", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const sentParlays = await storage.getSentParlaysForUser(userId);
    res.json(sentParlays);
  });

  // ===== ODDS API INTEGRATION =====
  app.get("/api/odds/upcoming", isAuthenticated, async (req, res) => {
    try {
      const games = await fetchUpcomingGames();
      res.json(games);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/odds/sync", isAuthenticated, async (req, res) => {
    try {
      const { weekId } = req.body;
      if (!weekId) return res.status(400).json({ message: "weekId required" });
      
      const userId = (req.user as any).claims.sub;
      const leagues = await storage.getUserLeagues(userId);
      const isAdmin = leagues.some(l => l.isAdmin);
      
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can sync odds data" });
      }

      const result = await runOddsSyncQueued(weekId);
      if (result.queued) {
        return res.status(202).json({
          message: "Odds sync queued",
          jobId: result.jobId,
          queued: true,
        });
      }
      res.json({
        message: `Synced games: ${result.added} added, ${result.updated} updated`,
        queued: false,
        added: result.added,
        updated: result.updated,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/odds/sync/:jobId", isAuthenticated, async (req, res) => {
    try {
      const status = await getOddsSyncJobStatus(req.params.jobId);
      if (!status) return res.status(404).json({ message: "Job not found" });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/odds/usage", isAuthenticated, async (req, res) => {
    try {
      const usage = await getApiUsage();
      res.json(usage);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== NFL NEWS =====
  app.get("/api/news", async (req, res) => {
    try {
      const feed = (req.query.feed as string) || "headlines";
      const limit = Math.min(Number(req.query.limit) || 12, 60);
      const cacheKey = `news:${feed}:${limit}`;
      const cached = await cacheGetJson<unknown>(cacheKey);
      if (cached) return res.json(cached);

      let news;
      if (feed === "injuries") {
        news = (await fetchNFLInjuries()).slice(0, limit);
      } else if (feed === "scores") {
        news = await fetchNFLScores();
      } else {
        news = await fetchNFLNews(limit);
      }

      await cacheSetJson(cacheKey, news, 90);
      res.json(news);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== BETTING INSIGHTS =====

  const VALID_FOCUSES: InsightFocus[] = ["general", "bet_types", "teams", "props", "trends"];

  app.get("/api/users/me/insights", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as any;
      const focus = (VALID_FOCUSES.includes(req.query.focus as InsightFocus)
        ? req.query.focus
        : "general") as InsightFocus;
      const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;

      // If a specific league is requested, gate by that league's insightsEnabled flag
      if (leagueId) {
        const league = await storage.getLeague(leagueId);
        if (!league) return res.status(404).json({ message: "League not found" });
        if (!league.insightsEnabled) {
          return res.json({ disabled: true, leagueName: league.name });
        }
      }

      const displayName =
        (user?.settings as any)?.displayName || user?.firstName || user?.email || "You";
      const result = await getUserInsights(user.id, displayName, focus, leagueId);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "[insights] user error:");
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/leagues/:leagueId/insights", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const focus = (VALID_FOCUSES.includes(req.query.focus as InsightFocus)
        ? req.query.focus
        : "general") as InsightFocus;
      const league = await storage.getLeague(leagueId);
      if (!league) return res.status(404).json({ message: "League not found" });
      if (!league.insightsEnabled) {
        return res.json({ disabled: true, leagueName: league.name });
      }
      const result = await getLeagueInsights(leagueId, league.name, focus);
      res.json(result);
    } catch (err: any) {
      logger.error({ err }, "[insights] league error:");
      res.status(500).json({ message: err.message });
    }
  });

  // ===== CSV IMPORT (Admin only) =====
  app.post("/api/leagues/:leagueId/import", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can import data" });
      }

      const { filename, records } = req.body;
      if (!records || !Array.isArray(records)) {
        return res.status(400).json({ message: "Invalid import data" });
      }

      const batch = await storage.createImportBatch({
        leagueId,
        uploadedBy: userId,
        originalFilename: filename || "import.csv",
        recordCount: records.length
      });

      let imported = 0;
      const skippedRows: string[] = [];

      for (const record of records) {
        try {
          const { weekNumber, year, memberEmail, status, legs } = record;
          const isVoid = status === 'void' || status === 'missed';

          if (!weekNumber || !year || !memberEmail) {
            skippedRows.push(`${memberEmail || "?"} week ${weekNumber} (${year}): missing required fields`);
            continue;
          }

          // Non-void records must have at least one leg
          if (!isVoid && (!legs || !Array.isArray(legs) || legs.length === 0)) {
            skippedRows.push(`${memberEmail || "?"} week ${weekNumber} (${year}): missing required fields`);
            continue;
          }

          // Resolve or auto-create the week row for this season + week number
          let week = await storage.getWeekBySeasonAndNumber(year, weekNumber);
          if (!week) {
            week = await storage.createWeek({
              season: year,
              weekNumber,
              label: `${year} Week ${weekNumber}`,
              isActive: false,
            });
          }
          const weekId = week.id;

          const member = await storage.getLeagueMemberByEmail(leagueId, memberEmail);
          if (!member) {
            skippedRows.push(`${memberEmail}: not a member of this league`);
            continue;
          }

          // Void/missed records: create a 0-leg parlay and skip leg resolution
          if (isVoid) {
            await storage.createImportedParlay(
              member.userId,
              { leagueId, weekId },
              [],
              batch.id,
              'void'
            );
            imported++;
            continue;
          }

          // Resolve legs — support both gameId (old) and homeTeam+awayTeam (new)
          // Player prop legs may omit game identification entirely.
          const resolvedLegs: { gameId: number | null; betType: string; pick: string; line?: string | null; odds?: string | null; gameSegment?: string | null; result?: string | null; playerName?: string | null; propType?: string | null; notes?: string | null }[] = [];
          for (const leg of legs as any[]) {
            const betType = leg.betType || 'spread';
            const isPlayerProp = betType === 'player_prop';
            let gameId: number | null = leg.gameId ?? null;

            if (!gameId && leg.homeTeam && leg.awayTeam) {
              const game = await storage.upsertGameForImport(weekId, leg.homeTeam, leg.awayTeam);
              gameId = game.id;
            }

            // For non-prop bets, game identification is required
            if (!gameId && !isPlayerProp) {
              skippedRows.push(`${memberEmail} week ${weekId}: could not resolve game for leg`);
              continue;
            }

            resolvedLegs.push({
              gameId: gameId ?? null,
              betType,
              pick: leg.pick,
              ...normalizeImportLegFields(leg, isPlayerProp),
            });
          }

          if (resolvedLegs.length === 0) continue;

          await storage.createImportedParlay(
            member.userId,
            { leagueId, weekId },
            resolvedLegs as any,
            batch.id,
            status || 'approved'
          );
          imported++;
        } catch (e) {
          logger.error({ e }, "Import record error:");
          skippedRows.push(`Error processing a record: ${(e as Error).message}`);
        }
      }

      // Trigger enrichment in the background (don't block the response)
      enrichLeagueParlayLegs(leagueId).then(result => {
        logger.info(`[Enrichment] league ${leagueId}: enriched=${result.enriched} resultsFilled=${result.resultsFilled} linesFilled=${result.linesFilled} skipped=${result.skipped}`);
      }).catch(err => {
        logger.error({ err }, "[Enrichment] background error:");
      });

      res.json({
        message: `Imported ${imported} of ${records.length} records`,
        batchId: batch.id,
        skipped: skippedRows.length,
        skippedDetails: skippedRows.slice(0, 10),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== SCREENSHOT IMPORT — Parse images with OpenAI Vision =====
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 20 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Only image files are accepted.`));
      }
    },
  });

  app.post(
    "/api/leagues/:leagueId/import/screenshots",
    isAuthenticated,
    upload.array("images", 20),
    async (req, res) => {
      try {
        const leagueId = Number(req.params.leagueId);
        const userId = (req.user as any).claims.sub;

        const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
        const isSuperUser = await storage.isSuperUser(userId);
        if (!isAdmin && !isSuperUser) {
          return res.status(403).json({ message: "Parlay Maestro access required" });
        }

        const files = req.files as Express.Multer.File[];
        if (!files || files.length === 0) {
          return res.status(400).json({ message: "No image files uploaded" });
        }

        const tickets = await parseTicketImages(
          files.map((f) => ({
            buffer: f.buffer,
            mimetype: f.mimetype,
            originalname: f.originalname,
          }))
        );

        res.json(tickets);
      } catch (err: any) {
        logger.error({ err }, "[Screenshot Import] error:");
        res.status(500).json({ message: err.message ?? "Screenshot parsing failed" });
      }
    }
  );

  // ===== MANUAL ENRICHMENT (Admin only) =====
  app.post("/api/leagues/:leagueId/enrich", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Parlay Maestro access required" });
      }

      const result = await enrichLeagueParlayLegs(leagueId);
      res.json({
        message: `Enrichment complete: ${result.enriched} legs processed, ${result.resultsFilled} results filled, ${result.linesFilled} lines filled`,
        ...result,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== SYNC GAME SCORES (Admin only) =====
  app.post("/api/leagues/:leagueId/sync-scores", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Parlay Maestro access required" });
      }

      const { weekId, daysFrom = 3 } = req.body;
      if (!weekId) {
        return res.status(400).json({ message: "weekId is required" });
      }

      const scoreResult = await syncGameScores(Number(weekId), Number(daysFrom));
      const enrichResult = await enrichLeagueParlayLegs(leagueId);

      res.json({
        message: `Scores synced: ${scoreResult.updated} games updated. Enrichment: ${enrichResult.enriched} legs processed, ${enrichResult.resultsFilled} results filled.`,
        scores: scoreResult,
        enrichment: enrichResult,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== nflverse SYNC (Admin only) =====

  // POST /api/admin/sync-nflverse
  // Body: { season, week?, mode: 'scores' | 'players' | 'all' }
  // Enqueues a background job (202) when Redis is available; otherwise runs inline.
  app.post("/api/admin/sync-nflverse", isAuthenticated, auditLog("admin.sync_nflverse"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }

      const { season, week, mode = "all" } = req.body;

      if (!season || isNaN(Number(season))) {
        return res.status(400).json({ message: "season (number) is required" });
      }

      const seasonNum = Number(season);
      const weekNum = week != null && week !== "" ? Number(week) : undefined;
      const syncMode = (mode === "scores" || mode === "players" || mode === "all" ? mode : "all") as
        | "scores"
        | "players"
        | "all";

      if (syncMode === "players" && weekNum == null) {
        return res.status(400).json({ message: "week is required for player stats sync" });
      }

      const enqueued = await enqueueNflverseSync({
        season: seasonNum,
        week: weekNum,
        mode: syncMode,
      });

      if (enqueued.queued) {
        return res.status(202).json({
          message: "nflverse sync queued",
          jobId: enqueued.jobId,
          queued: true,
        });
      }

      res.json({ message: "nflverse sync complete", queued: false, ...enqueued.result });
    } catch (err: any) {
      logger.error({ err }, "[nflverse] sync error:");
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/admin/sync-nflverse/:jobId", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }

      const status = await getNflverseSyncJobStatus(req.params.jobId);
      if (!status) return res.status(404).json({ message: "Job not found" });
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/resolve-props
  // Resolves all pending player-prop legs using already-synced nflverse player stats.
  // No body required — scans every prop leg across all leagues.
  app.post("/api/admin/resolve-props", isAuthenticated, auditLog("admin.resolve_props"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }

      const result: Record<string, unknown> = { ...(await resolvePropsFromStats()) };

      try {
        result.decisionMoments = await detectExactDecisionMoments();
      } catch (err) {
        logger.warn({ err }, "[decision-detection] prop sync failed; legs stay at 'final' confidence");
      }

      res.json({ message: "Prop resolution complete", ...result });
    } catch (err: any) {
      logger.error({ err }, "[prop-resolve] error:");
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/fetch-prop-lines
  // Fetches player prop lines/odds from The Odds API for a specific league+week.
  // Body: { leagueId: number, weekId: number }
  app.post("/api/admin/fetch-prop-lines", isAuthenticated, auditLog("admin.fetch_prop_lines"), async (req, res) => {
    try {
      const { leagueId, weekId } = req.body;
      if (!leagueId || !weekId) {
        return res.status(400).json({ message: "leagueId and weekId are required" });
      }
      // Scoped to the target league (like /enrich and /sync-scores above) rather
      // than requiring global super-user access, since this only affects that
      // league's prop lines and league admins already trigger similar syncs.
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(Number(leagueId), userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Parlay Maestro access required" });
      }
      const result = await fetchPropLinesFromOddsApi(Number(leagueId), Number(weekId));
      res.json({ message: "Prop lines fetch complete", ...result });
    } catch (err: any) {
      logger.error({ err }, "[prop-lines] error:");
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/games/:gameId/player-stats
  // Returns player stats for all players on both teams in a given game
  // Backfill: promote all fully-resolved parlays from 'approved'/'pending' to win/loss/push
  // POST /api/admin/weeks — creates (or returns the existing) week row for a season +
  // week number, e.g. for standing up the next season ahead of any picks import.
  // Body: { season: number, weekNumber: number, label?: string }
  app.post("/api/admin/weeks", isAuthenticated, auditLog("admin.week_create"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const { season, weekNumber, label } = req.body;
      if (!season || !weekNumber) {
        return res.status(400).json({ message: "season and weekNumber are required" });
      }
      const existing = await storage.getWeekBySeasonAndNumber(Number(season), Number(weekNumber));
      if (existing) {
        return res.json({ message: "Week already exists", week: existing });
      }
      const week = await storage.createWeek({
        season: Number(season),
        weekNumber: Number(weekNumber),
        label: label || `${season} Week ${weekNumber}`,
        isActive: false,
      });
      res.json({ message: "Week created", week });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/weeks/:id/sync-games — pulls the current OddsAPI board (upcoming
  // games) into this week, matching by team names. Safe to re-run to pick up line moves.
  app.post("/api/admin/weeks/:id/sync-games", isAuthenticated, auditLog("admin.week_sync_games", { targetParam: "id", targetType: "week" }), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const result = await syncGamesFromOddsApi(Number(req.params.id));
      res.json({ message: "Games sync complete", ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/weeks/:id/activate", isAuthenticated, auditLog("admin.week_activate", { targetParam: "id", targetType: "week" }), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      await storage.setActiveWeek(Number(req.params.id));
      res.json({ message: "Active week updated" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/check-new-season — manually triggers the same nflverse
  // schedule check the weekly job runs automatically. Creates every
  // regular-season week (+ games) for the next season if its schedule has
  // been published and we don't have it yet. Safe to re-run.
  app.post("/api/admin/check-new-season", isAuthenticated, auditLog("admin.season_rollover_check"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const result = await runSeasonRolloverCheckNow();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/teams — full team reference list, for team-picker dropdowns (e.g. Advanced Filters).
  app.get("/api/teams", isAuthenticated, async (_req, res) => {
    try {
      const results = await storage.getAllTeams();
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/games/:id/weather — best-effort forecast for kickoff at the home
  // team's city (see server/services/weatherApi.ts). Null body (200) for an
  // indoor venue, missing game time, unconfigured API, or any upstream
  // failure — weather is decoration on the picks matrix, never load-bearing.
  app.get("/api/games/:id/weather", isAuthenticated, async (req, res) => {
    try {
      const gameId = Number(req.params.id);
      const game = await storage.getGame(gameId);
      if (!game || !game.gameTime) return res.json(null);

      const cacheKey = `game-weather:${gameId}:${new Date(game.gameTime).toISOString()}`;
      const cached = await cacheGetJson<Awaited<ReturnType<typeof getGameForecast>>>(cacheKey);
      if (cached) return res.json(cached);

      const teams = await storage.getAllTeams();
      const homeTeam = teams.find((t) => t.abbreviation === game.homeTeam);
      if (!homeTeam || (homeTeam.stadiumType && homeTeam.stadiumType !== "outdoor")) {
        return res.json(null);
      }

      const forecast = await getGameForecast(homeTeam.abbreviation, new Date(game.gameTime));
      if (forecast) await cacheSetJson(cacheKey, forecast, 60 * 60);
      res.json(forecast);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/players?q=<search> — for player-picker dropdowns (e.g. Advanced Filters).
  app.get("/api/players", isAuthenticated, async (req, res) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const results = await storage.searchPlayers(q);
      res.json(results);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/rollup-parlay-statuses", isAuthenticated, auditLog("admin.rollup_parlay_statuses"), async (req, res) => {
    try {
      const { leagueId, recomputeTerminal } = req.body;
      const userId = (req.user as any).claims.sub;
      // leagueId is optional (omitted = rolls up every league), so this can't
      // be scoped to a single league's admin the way /enrich and /sync-scores
      // are — require super-user access instead.
      if (leagueId) {
        const isAdmin = await storage.isLeagueAdmin(Number(leagueId), userId);
        if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });
      } else if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const result = await storage.rollupLeagueParlayStatuses(leagueId ? Number(leagueId) : undefined, !!recomputeTerminal);
      res.json({ message: "Rollup complete", ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/backfill-game-finished-at", isAuthenticated, auditLog("admin.backfill_game_finished_at"), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }

      // Precision pass first: for every season we have games in, try to
      // replace finishedAt with the real last-play timestamp from
      // play-by-play data. Best-effort per season — a season nflverse
      // doesn't have pbp for (very old, or not yet published) is skipped.
      const seasons = await storage.getDistinctSeasons();
      const finishTimeSync = { updated: 0, noMatch: 0, notYetFinished: 0 };
      for (const season of seasons) {
        try {
          const r = await syncGameFinishTimesFromPlayByPlay(season);
          finishTimeSync.updated += r.updated;
          finishTimeSync.noMatch += r.noMatch;
          finishTimeSync.notYetFinished += r.notYetFinished;
        } catch (err) {
          logger.warn({ err, season }, "[play-by-play] backfill pass failed for season; continuing");
        }
      }

      // Fallback estimate (kickoff + 3.5h) for anything still missing
      // finishedAt entirely — games pbp coverage didn't reach.
      const result = await storage.backfillGameFinishedAt();
      res.json({ message: "Backfill complete", finishTimeSync, ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/games/:gameId/player-stats", isAuthenticated, async (req, res) => {
    try {
      const gameId = Number(req.params.gameId);
      const stats = await storage.getPlayerStatsForGame(gameId);
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/leagues/:leagueId/imports", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Parlay Maestro access required" });
      }

      const imports = await storage.getLeagueImportHistory(leagueId);
      res.json(imports);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== ROLLBACK IMPORT BATCH (Admin only) =====
  app.delete("/api/leagues/:leagueId/imports/:batchId", isAuthenticated, auditLog("import_batch.delete", { targetParam: "batchId", targetType: "import_batch" }), async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const batchId = Number(req.params.batchId);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can roll back imports" });
      }

      await storage.deleteImportBatch(batchId, leagueId);
      res.json({ message: "Import batch rolled back successfully" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== LEAGUE SETTINGS =====
  app.get("/api/leagues/:id/members", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const superUser = await storage.isSuperUser(userId);
      const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
      if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
      // Only a maestro can see inactive/departed members (needed for the
      // League Members subtab's active/inactive toggle and purge flow).
      const isAdmin = superUser || (await storage.isLeagueAdmin(leagueId, userId));
      const includeInactive = isAdmin && req.query.includeInactive === "true";
      const members = await storage.getLeagueMembersWithUsers(leagueId, { includeInactive });
      res.json(members);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Invite members by email — sends automated emails via Resend
  app.post("/api/leagues/:id/invite-by-email", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const { emails } = z.object({
        emails: z.array(z.string().email()).min(1).max(5),
      }).parse(req.body);

      // Fetch league + inviter info once for email templates
      const [league, inviter] = await Promise.all([
        storage.getLeague(leagueId),
        storage.getUser(userId),
      ]);
      if (!league) return res.status(404).json({ message: "League not found" });

      const inviterName =
        inviter?.firstName
          ? `${inviter.firstName}${inviter.lastName ? " " + inviter.lastName : ""}`
          : inviter?.email ?? "Your friend";

      const results = await Promise.all(
        emails.map(async (email) => {
          // Check if they already have an account
          const existingUser = await storage.getUserByEmail(email);

          if (!existingUser) {
            // Not a member yet — send invite email with the join code
            try {
              await sendLeagueInviteEmail({
                toEmail: email,
                leagueName: league.name,
                inviterName,
                inviteCode: league.inviteCode,
              });
              return { email, status: "invited" as const };
            } catch (emailErr) {
              logger.error({ emailErr }, `Failed to send invite email to ${email}:`);
              return { email, status: "invited" as const }; // still report invited even if email fails
            }
          }

          // Already has an account — check if already in the league
          const existing = await storage.getLeagueMemberByEmail(leagueId, email);
          if (existing) return { email, status: "already_member" as const };

          // Add them and send a "you've been added" email
          await storage.addMemberToLeague(leagueId, existingUser.id);

          try {
            await sendMemberAddedEmail({
              toEmail: email,
              toName: existingUser.firstName ?? null,
              leagueName: league.name,
              inviterName,
              leagueId,
            });
          } catch (emailErr) {
            logger.error({ emailErr }, `Failed to send added email to ${email}:`);
          }

          return {
            email,
            status: "added" as const,
            username: (existingUser.settings as any)?.displayName || existingUser.firstName || existingUser.email,
          };
        })
      );

      res.json({ results });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/settings", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const updates = updateLeagueSettingsSchema.parse(req.body);
      const league = await storage.updateLeagueSettings(leagueId, updates);
      res.json(league);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/members/:userId/role", isAuthenticated, auditLog("league_member.role_change", { targetParam: "userId", targetType: "league_member" }), async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const targetUserId = req.params.userId;
      const adminId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, adminId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const { role } = z.object({ role: z.enum(['member', 'lieutenant']) }).parse(req.body);

      // Enforce max 2 lieutenants
      if (role === 'lieutenant') {
        const current = await storage.getLieutenants(leagueId);
        const alreadyLt = current.some(m => m.userId === targetUserId);
        if (!alreadyLt && current.length >= 2) {
          return res.status(400).json({ message: "Maximum 2 Parlay Lieutenants allowed per league" });
        }
      }

      const member = await storage.setMemberRole(leagueId, targetUserId, role);
      res.json(member);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/lieutenant-permissions", isAuthenticated, auditLog("league.lieutenant_permissions_change", { targetParam: "id", targetType: "league" }), async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const schema = z.object({
        approveRejectParlays: z.boolean(),
        editParlays: z.boolean(),
        lockParlay: z.boolean(),
        unlockParlay: z.boolean(),
        unselectUserPick: z.boolean(),
        approveMemberInvites: z.boolean(),
        importHistory: z.boolean(),
        markLeagueDemo: z.boolean(),
      });
      const permissions = schema.parse(req.body);
      const league = await storage.updateLieutenantPermissions(leagueId, permissions);
      res.json(league);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // ===== USER SETTINGS =====
  app.patch("/api/users/me/settings", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const settings = updateUserSettingsSchema.parse(req.body);
      await storage.updateUserSettings(userId, settings);
      res.json({ success: true });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // ===== DEMO FLAGS =====
  app.patch("/api/users/me/demo", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { isDemo } = z.object({ isDemo: z.boolean() }).parse(req.body);
      await storage.setUserDemoFlag(userId, isDemo);
      res.json({ success: true, isDemo });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/demo", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const { isDemo } = z.object({ isDemo: z.boolean() }).parse(req.body);

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can change demo status" });
      }

      await storage.setLeagueDemoFlag(leagueId, isDemo);
      res.json({ success: true, isDemo });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/demo-week-data", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const { useDemoWeekData } = z.object({ useDemoWeekData: z.boolean() }).parse(req.body);

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can change this setting" });
      }

      const league = await storage.getLeague(leagueId);
      if (!league?.isDemo) {
        return res.status(400).json({ message: "Dummy week data can only be enabled on demo leagues" });
      }

      await storage.setLeagueDemoWeekData(leagueId, useDemoWeekData);
      res.json({ success: true, useDemoWeekData });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // ===== PARLAY EDIT (Admin only, for imported/manual entries) =====
  app.patch("/api/parlays/:id", isAuthenticated, async (req, res) => {
    try {
      const parlayId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const parlay = await storage.getParlay(parlayId);
      if (!parlay) {
        return res.status(404).json({ message: "Parlay not found" });
      }

      const isAdmin = await storage.isLeagueAdmin(parlay.leagueId, userId);
      if (!isAdmin) {
        return res.status(403).json({ message: "Only the Parlay Maestro can edit parlays" });
      }

      const input = updateParlayInputSchema.parse(req.body);
      const updated = await storage.updateParlay(parlayId, normalizeUpdateParlayInput(input));
      res.json(updated);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // ===== DEMO DATA EDITOR (Admin + Demo League only) =====

  // Helper: verify admin of a demo league
  async function requireDemoAdmin(req: any, res: any, leagueId: number): Promise<string | null> {
    const userId = (req.user as any).claims.sub;
    const league = await storage.getLeague(leagueId);
    if (!league) { res.status(404).json({ message: "League not found" }); return null; }
    if (!league.isDemo) { res.status(403).json({ message: "Data editor only available in demo leagues" }); return null; }
    const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
    if (!isAdmin) { res.status(403).json({ message: "Only the Parlay Maestro can use the data editor" }); return null; }
    return userId;
  }

  app.post("/api/leagues/:leagueId/parlays/merge", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const uid = await requireDemoAdmin(req, res, leagueId);
      if (!uid) return;
      const { targetParlayId, sourceParlayIds } = req.body;
      if (!targetParlayId || !Array.isArray(sourceParlayIds) || sourceParlayIds.length === 0) {
        return res.status(400).json({ message: "targetParlayId and sourceParlayIds[] are required" });
      }
      if (sourceParlayIds.includes(targetParlayId)) {
        return res.status(400).json({ message: "Target parlay cannot also be a source" });
      }
      await storage.mergeParlays(leagueId, targetParlayId, sourceParlayIds);
      res.json({ message: `Merged ${sourceParlayIds.length} parlay(s) into parlay #${targetParlayId}` });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/leagues/:leagueId/parlays/historical", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const uid = await requireDemoAdmin(req, res, leagueId);
      if (!uid) return;
      const { userId, weekId, legs } = req.body;
      if (!userId || !weekId) {
        return res.status(400).json({ message: "userId and weekId are required" });
      }
      const parlay = await storage.createHistoricalParlay(userId, leagueId, Number(weekId), legs ?? []);
      res.json(parlay);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/leagues/:leagueId/parlays/:parlayId/split", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const parlayId = Number(req.params.parlayId);
      const uid = await requireDemoAdmin(req, res, leagueId);
      if (!uid) return;
      const { legIds } = req.body;
      if (!Array.isArray(legIds) || legIds.length === 0) {
        return res.status(400).json({ message: "legIds[] is required and must be non-empty" });
      }
      const newParlay = await storage.splitParlayLegs(leagueId, parlayId, legIds);
      res.json({ message: `Split ${legIds.length} leg(s) into new parlay #${newParlay.id}`, newParlayId: newParlay.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/leagues/:id/parlays/all", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const uid = await requireDemoAdmin(req, res, leagueId);
      if (!uid) return;
      const all = req.query.all === "1" || req.query.all === "true";
      const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
      const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
      const page = await storage.getAllLeagueParlays(leagueId, { limit, offset, all });
      res.json(page);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Same admin check as requireDemoAdmin, minus the isDemo restriction — the
  // missing-bettor detection/backfill below is safe (and useful) in real
  // leagues too, unlike the rest of the Data Editor's destructive tooling.
  async function requireLeagueAdmin(req: any, res: any, leagueId: number): Promise<string | null> {
    const userId = (req.user as any).claims.sub;
    const league = await storage.getLeague(leagueId);
    if (!league) { res.status(404).json({ message: "League not found" }); return null; }
    const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
    if (!isAdmin) { res.status(403).json({ message: "Only a league admin can do this" }); return null; }
    return userId;
  }

  app.get("/api/leagues/:leagueId/weeks/:weekId/missing-parlay-members", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const weekId = Number(req.params.weekId);
      const uid = await requireLeagueAdmin(req, res, leagueId);
      if (!uid) return;
      const missing = await storage.getMissingParlayMembers(leagueId, weekId);
      res.json(missing);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/leagues/:leagueId/weeks/:weekId/backfill-missing-parlays", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const weekId = Number(req.params.weekId);
      const uid = await requireLeagueAdmin(req, res, leagueId);
      if (!uid) return;
      const created = await storage.backfillMissingParlays(leagueId, weekId);
      res.json({ message: `Backfilled ${created.length} missing parlay(s) as Void`, parlays: created });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const CLONEABLE_PARLAY_STATUSES = ["approved", "win", "loss", "push"];

  app.post("/api/parlays/:id/clone", isAuthenticated, auditLog("parlay.clone", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const parlayId = Number(req.params.id);
      const source = await storage.getParlay(parlayId);
      if (!source) return res.status(404).json({ message: "Parlay not found" });
      if (source.userId !== userId) {
        return res.status(403).json({ message: "You can only clone your own parlays" });
      }
      if (!CLONEABLE_PARLAY_STATUSES.includes(source.status ?? "")) {
        return res.status(400).json({ message: "Only approved, won, lost, or pushed parlays can be cloned" });
      }
      const activeWeek = await storage.getActiveWeek();
      if (!activeWeek) {
        return res.status(400).json({ message: "No active week to clone into right now" });
      }
      const cloned = await storage.cloneParlay(parlayId, activeWeek.id);
      res.status(201).json(cloned);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/parlays/:id", isAuthenticated, auditLog("parlay.delete", { targetParam: "id", targetType: "parlay" }), async (req, res) => {
    try {
      const parlayId = Number(req.params.id);
      const parlay = await storage.getParlay(parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      await storage.deleteParlay(parlayId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/parlay-legs/:legId", isAuthenticated, auditLog("parlay_leg.delete", { targetParam: "legId", targetType: "parlay_leg" }), async (req, res) => {
    try {
      const legId = Number(req.params.legId);
      const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
      if (!leg) return res.status(404).json({ message: "Leg not found" });
      const parlay = await storage.getParlay(leg.parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      await storage.deleteParlayLeg(legId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // ===== LEG DISPUTES ("Dispute this bet" — member-facing) =====
  const DISPUTE_REASON_TYPES = ["result_wrong", "entered_incorrectly"];

  const disputeUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Only image files are accepted.`));
      }
    },
  });

  app.get("/api/parlay-legs/:legId/disputes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const legId = Number(req.params.legId);
      const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
      if (!leg) return res.status(404).json({ message: "Leg not found" });
      if (leg.userId !== userId) {
        return res.status(403).json({ message: "You can only view disputes on your own legs" });
      }
      const disputes = await storage.getDisputesForLeg(legId);
      res.json(disputes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(
    "/api/parlay-legs/:legId/disputes",
    isAuthenticated,
    disputeUpload.single("screenshot"),
    auditLog("parlay_leg.dispute", { targetParam: "legId", targetType: "parlay_leg" }),
    async (req, res) => {
      try {
        const userId = (req.user as any).claims.sub;
        const legId = Number(req.params.legId);
        const { reasonType, justification } = req.body;

        if (!DISPUTE_REASON_TYPES.includes(reasonType)) {
          return res.status(400).json({ message: "Invalid reason type" });
        }
        if (!justification || !justification.trim()) {
          return res.status(400).json({ message: "Justification is required" });
        }

        const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
        if (!leg) return res.status(404).json({ message: "Leg not found" });
        if (leg.userId !== userId) {
          return res.status(403).json({ message: "You can only dispute your own legs" });
        }

        const existing = await storage.getOpenDisputeForLeg(legId);
        if (existing) {
          return res.status(409).json({ message: "This leg already has an open dispute" });
        }

        const file = req.file as Express.Multer.File | undefined;
        if (reasonType === "entered_incorrectly" && !file) {
          return res.status(400).json({ message: "A screenshot is required when disputing an incorrectly entered bet" });
        }

        const screenshotKey = file ? await uploadDisputeScreenshot(file.buffer, file.mimetype) : null;

        const dispute = await storage.createDispute({
          parlayLegId: legId,
          raisedByUserId: userId,
          reasonType,
          justification: justification.trim(),
          screenshotKey,
        });
        res.status(201).json(dispute);
      } catch (err: any) {
        logger.error({ err }, "[disputes] create error");
        res.status(500).json({ message: err.message ?? "Failed to file dispute" });
      }
    }
  );

  // ===== EXCEPTIONS QUEUE (support-only — superuser gated, unlisted route) =====
  app.get("/api/exceptions/disputes", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Support access required" });
      }
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const disputes = await storage.listDisputes(status);
      res.json(disputes);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/exceptions/disputes/:id/screenshot", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Support access required" });
      }
      const dispute = await storage.getDispute(Number(req.params.id));
      if (!dispute || !dispute.screenshotKey) {
        return res.status(404).json({ message: "No screenshot for this dispute" });
      }
      const url = await getDisputeScreenshotUrl(dispute.screenshotKey);
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(
    "/api/exceptions/disputes/:id/resolve",
    isAuthenticated,
    auditLog("dispute.resolve", { targetParam: "id", targetType: "parlay_leg_dispute" }),
    async (req, res) => {
      try {
        const userId = (req.user as any).claims.sub;
        if (!(await storage.isSuperUser(userId))) {
          return res.status(403).json({ message: "Support access required" });
        }
        const { status, notes } = req.body as { status: string; notes?: string };
        if (status !== "resolved" && status !== "dismissed") {
          return res.status(400).json({ message: "status must be 'resolved' or 'dismissed'" });
        }
        const disputeId = Number(req.params.id);
        const dispute = await storage.getDispute(disputeId);
        if (!dispute) return res.status(404).json({ message: "Dispute not found" });

        const updated = await storage.resolveDispute(disputeId, userId, status, notes);

        // Dismissed disputes are hard-deleted (see storage.resolveDispute) —
        // clean up the screenshot evidence in the bucket along with the row.
        if (status === "dismissed" && dispute.screenshotKey) {
          await deleteDisputeScreenshot(dispute.screenshotKey).catch((err) => {
            logger.error({ err }, "[disputes] failed to delete screenshot on dismiss");
          });
        }

        res.json(updated);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  app.patch("/api/parlay-legs/:legId", isAuthenticated, async (req, res) => {
    try {
      const legId = Number(req.params.legId);
      const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
      if (!leg) return res.status(404).json({ message: "Leg not found" });
      const parlay = await storage.getParlay(leg.parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      const input = updateParlayLegInputSchema.parse(req.body);

      if (input.userId !== undefined && input.userId !== leg.userId) {
        const members = await storage.getLeagueMembers(parlay.leagueId);
        if (!members.some(m => m.userId === input.userId)) {
          return res.status(400).json({ message: "Selected user is not a member of this league" });
        }
        const siblingLegs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, leg.parlayId));
        if (siblingLegs.some(l => l.id !== legId && l.userId === input.userId)) {
          return res.status(400).json({ message: "This member already has a leg in this parlay" });
        }
      }

      const updated = await storage.updateParlayLeg(legId, input);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const BULK_EDITABLE_LEG_FIELDS = ['betType', 'pick', 'line', 'odds', 'oddsSource', 'result', 'playerName', 'propType', 'notes', 'gameSegment', 'userId'] as const;

  app.post("/api/leagues/:leagueId/parlay-legs/bulk-update", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.leagueId);
      const uid = await requireDemoAdmin(req, res, leagueId);
      if (!uid) return;

      const { legIds, field, value } = req.body as { legIds: number[]; field: string; value: string | null };
      if (!Array.isArray(legIds) || legIds.length === 0) {
        return res.status(400).json({ message: "legIds[] is required" });
      }
      if (!(BULK_EDITABLE_LEG_FIELDS as readonly string[]).includes(field)) {
        return res.status(400).json({ message: "Unsupported field" });
      }

      const targetLegs = await db.select().from(parlayLegs).where(inArray(parlayLegs.id, legIds));
      if (targetLegs.length !== legIds.length) {
        return res.status(404).json({ message: "One or more legs not found" });
      }
      const parlayIds = [...new Set(targetLegs.map(l => l.parlayId))];
      const targetParlays = await db.select().from(parlays).where(inArray(parlays.id, parlayIds));
      if (targetParlays.some(p => p.leagueId !== leagueId)) {
        return res.status(403).json({ message: "Legs must all belong to this league" });
      }

      if (field === "userId") {
        const members = await storage.getLeagueMembers(leagueId);
        if (!members.some(m => m.userId === value)) {
          return res.status(400).json({ message: "Selected user is not a member of this league" });
        }
        const selectedIdSet = new Set(legIds);
        const allLegsInAffectedParlays = await db.select().from(parlayLegs).where(inArray(parlayLegs.parlayId, parlayIds));
        for (const parlayId of parlayIds) {
          const legsInThisParlay = allLegsInAffectedParlays.filter(l => l.parlayId === parlayId);
          const selectedInThisParlay = legsInThisParlay.filter(l => selectedIdSet.has(l.id));
          const alreadyOwnedByTarget = legsInThisParlay.some(l => !selectedIdSet.has(l.id) && l.userId === value);
          if (selectedInThisParlay.length > 1 || alreadyOwnedByTarget) {
            return res.status(400).json({ message: "This member already has a leg in at least one of the affected parlays" });
          }
        }
      }

      const updated = await storage.bulkUpdateParlayLegs(legIds, field as any, value);
      res.json(updated);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.post("/api/parlay-legs/:legId/enrich", isAuthenticated, async (req, res) => {
    try {
      const legId = Number(req.params.legId);
      const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
      if (!leg) return res.status(404).json({ message: "Leg not found" });
      const parlay = await storage.getParlay(leg.parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      const log = await enrichSingleLeg(legId);
      res.json(log);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/parlays/:id/legs", isAuthenticated, async (req, res) => {
    try {
      const parlayId = Number(req.params.id);
      const parlay = await storage.getParlay(parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      const input = addParlayLegInputSchema.parse(req.body);
      const newLeg = await storage.addParlayLeg(parlayId, { ...normalizeAddParlayLegInput(input), userId: parlay.userId });
      res.json(newLeg);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // ===== NOTIFICATIONS =====
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const notifs = await storage.getNotifications(userId);
      res.json(notifs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const id = Number(req.params.id);
      await storage.markNotificationRead(id, userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/read-all", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Parlay Maestro: send ad hoc announcement to all league members
  app.post("/api/leagues/:id/notifications/announce", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Only the Parlay Maestro can send league announcements" });

      const { title, message } = z.object({
        title: z.string().min(1).max(120),
        message: z.string().max(500).optional(),
      }).parse(req.body);

      await storage.createLeagueAnnouncement(leagueId, title, message || "");
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Parlay Maestro: configure scheduled reminder settings
  app.patch("/api/leagues/:id/notification-settings", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const settings = updateLeagueNotificationSettingsSchema.parse(req.body);

      const league = await storage.updateLeagueNotificationSettings(leagueId, settings);
      res.json(league);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // User: update notification delivery preferences
  app.patch("/api/users/me/notification-preferences", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const prefs = z.object({
        email: z.boolean(),
        sms: z.boolean(),
        push: z.boolean(),
        phone: z.string().optional(),
      }).parse(req.body);

      await storage.updateUserSettings(userId, { notificationPreferences: prefs });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Parlay week lock: get status
  app.get("/api/leagues/:id/weeks/:weekId/lock", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const weekId = Number(req.params.weekId);
      const status = await storage.getWeekLockStatus(leagueId, weekId);
      res.json(status);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Parlay week lock: lock the week
  app.post("/api/leagues/:id/weeks/:weekId/lock", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const leagueId = Number(req.params.id);
      const weekId = Number(req.params.weekId);

      const canLock = await hasLeaguePermission(leagueId, userId, "lockParlay");
      if (!canLock) return res.status(403).json({ message: "Only the Parlay Maestro (or a Lieutenant with Lock permission) can lock the parlay." });

      const current = await storage.getWeekLockStatus(leagueId, weekId);
      if (current.isLocked) return res.status(409).json({ message: "This week's parlay is already locked." });

      const { hadMissingBets } = z.object({ hadMissingBets: z.boolean() }).parse(req.body);
      const lock = await storage.lockWeekParlay(leagueId, weekId, userId, hadMissingBets);
      res.json(lock);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Parlay week lock: unlock
  app.delete("/api/leagues/:id/weeks/:weekId/lock", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const leagueId = Number(req.params.id);
      const weekId = Number(req.params.weekId);

      const canUnlock = await hasLeaguePermission(leagueId, userId, "unlockParlay");
      if (!canUnlock) return res.status(403).json({ message: "Only the Parlay Maestro (or a Lieutenant with Unlock permission) can unlock the parlay." });

      await storage.unlockWeekParlay(leagueId, weekId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // Leave league — available to members and lieutenants; blocked for the admin
  app.delete("/api/leagues/:id/members/me", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (isAdmin) {
        return res.status(400).json({
          message: "Parlay Maestros must transfer admin rights before leaving. Use the transfer-and-leave endpoint.",
        });
      }

      const members = await storage.getLeagueMembers(leagueId);
      const isMember = members.some(m => m.userId === userId);
      if (!isMember) return res.status(404).json({ message: "You are not a member of this league" });

      await storage.leaveLeagueMember(leagueId, userId);
      res.json({ message: "You have left the league" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Transfer admin rights to another member and leave — Parlay Maestro only
  app.post("/api/leagues/:id/transfer-and-leave", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Only the Parlay Maestro can transfer admin rights" });

      const { newAdminUserId } = z.object({ newAdminUserId: z.string().min(1) }).parse(req.body);

      if (newAdminUserId === userId) {
        return res.status(400).json({ message: "You cannot transfer admin rights to yourself" });
      }

      const members = await storage.getLeagueMembers(leagueId);
      const targetIsMember = members.some(m => m.userId === newAdminUserId);
      if (!targetIsMember) {
        return res.status(400).json({ message: "The selected user is not a member of this league" });
      }

      await storage.transferLeagueAdmin(leagueId, userId, newAdminUserId);
      res.json({ message: "Admin rights transferred and you have left the league" });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // Maestro removes another member. If they own parlay_legs in this league,
  // the removal is blocked (409, with the list of orphaned legs) unless the
  // caller passes bypass:true — in which case the member is soft-purged and
  // their legs surface on the exceptions blotter for later cleanup.
  app.post("/api/leagues/:id/members/:userId/remove", isAuthenticated, auditLog("league_member.remove", { targetParam: "userId", targetType: "league_member" }), async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const targetUserId = req.params.userId;
      const adminId = (req.user as any).claims.sub;

      const isAdmin = await storage.isLeagueAdmin(leagueId, adminId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });
      if (targetUserId === adminId) {
        return res.status(400).json({ message: "Transfer admin rights before removing yourself — use transfer-and-leave" });
      }

      const { bypass } = z.object({ bypass: z.boolean().optional() }).parse(req.body ?? {});

      const orphanedLegs = await storage.getOrphanedLegsForMember(leagueId, targetUserId);
      if (orphanedLegs.length === 0) {
        await storage.removeLeagueMember(leagueId, targetUserId);
        return res.json({ message: "Member removed", orphanedLegs: [] });
      }

      if (!bypass) {
        return res.status(409).json({
          message: "This member has parlay legs in this league that must be reassigned or deleted first",
          orphanedLegs,
        });
      }

      await storage.purgeLeagueMemberBypass(leagueId, targetUserId);
      res.json({
        message: "Member purged; unresolved legs moved to the exceptions blotter",
        orphanedLegs,
      });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // Exceptions blotter — orphaned legs left behind by bypassed purges.
  app.get("/api/leagues/:id/orphaned-legs", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const orphanedLegs = await storage.getOrphanedLegsForLeague(leagueId);
      res.json(orphanedLegs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Resolve orphaned legs one at a time — reassign to an active member or delete.
  app.post("/api/leagues/:id/orphaned-legs/resolve", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
      if (!isAdmin) return res.status(403).json({ message: "Parlay Maestro access required" });

      const { resolutions } = z.object({
        resolutions: z.array(z.object({
          legId: z.number().int(),
          action: z.enum(['reassign', 'delete']),
          newUserId: z.string().optional(),
        })).min(1),
      }).parse(req.body);

      const activeMembers = await storage.getLeagueMembers(leagueId);
      for (const r of resolutions) {
        if (r.action === 'reassign') {
          if (!r.newUserId) return res.status(400).json({ message: "newUserId is required to reassign a leg" });
          if (!activeMembers.some(m => m.userId === r.newUserId)) {
            return res.status(400).json({ message: "Reassignment target must be an active member of this league" });
          }
        }
        await storage.resolveOrphanedLeg(leagueId, r.legId, r.action, r.newUserId);
      }

      res.json({ message: "Resolved" });
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  // ===== STORY STUDIO =====
  const SECTION_ORDER: Record<StorySectionKind, number> = {
    headline: 0,
    opening: 1,
    winnerSummary: 2,
    closing: 3,
  };

  async function assertLeagueMember(leagueId: number, userId: string, res: any): Promise<boolean> {
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) res.status(403).json({ message: "Not a member of this league" });
    return isMember;
  }

  app.get("/api/story-studio/analytics", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.query.leagueId);
      const weekId = Number(req.query.weekId);
      const userId = (req.user as any).claims.sub;
      if (!(await assertLeagueMember(leagueId, userId, res))) return;

      const report = await getWeeklyAnalyticsReport(leagueId, weekId);
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/story-studio/candidates", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.query.leagueId);
      const weekId = Number(req.query.weekId);
      const userId = (req.user as any).claims.sub;
      if (!(await assertLeagueMember(leagueId, userId, res))) return;

      const report = await getWeeklyAnalyticsReport(leagueId, weekId);
      res.json(discoverStories(report));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/story-studio/reports", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const input = insertStoryReportSchema.parse(req.body);
      if (!(await assertLeagueMember(input.leagueId, userId, res))) return;

      const report = await storage.createStoryReport(userId, input);
      res.json(report);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.get("/api/story-studio/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const report = await storage.getStoryReportWithSections(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!(await assertLeagueMember(report.leagueId, userId, res))) return;
      res.json(report);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/story-studio/reports/:id/sections/:kind/generate", isAuthenticated, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const kind = req.params.kind as StorySectionKind;
      const userId = (req.user as any).claims.sub;
      if (!STORY_SECTION_KINDS.includes(kind)) return res.status(400).json({ message: "Invalid section kind" });

      const report = await storage.getStoryReportWithSections(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!(await assertLeagueMember(report.leagueId, userId, res))) return;

      const analytics = await getWeeklyAnalyticsReport(report.leagueId, report.weekId);
      const generated = await generateSection(kind, {
        report: analytics,
        candidate: report.selectedStory,
        thesis: report.thesis,
        tone: report.tone as any,
      });

      const section = await storage.upsertStorySection(reportId, kind, SECTION_ORDER[kind], {
        content: generated.content,
        generatedContent: generated.content,
        promptVersion: generated.promptVersion,
      });
      res.json(section);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/story-studio/reports/:id/sections/:kind", isAuthenticated, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const kind = req.params.kind as StorySectionKind;
      const userId = (req.user as any).claims.sub;
      if (!STORY_SECTION_KINDS.includes(kind)) return res.status(400).json({ message: "Invalid section kind" });

      const { content } = z.object({ content: z.string() }).parse(req.body);
      const report = await storage.getStoryReportWithSections(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!(await assertLeagueMember(report.leagueId, userId, res))) return;

      const section = await storage.upsertStorySection(reportId, kind, SECTION_ORDER[kind], { content });
      res.json(section);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.patch("/api/story-studio/reports/:id", isAuthenticated, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const updates = updateStoryReportSchema.parse(req.body);

      const report = await storage.getStoryReportWithSections(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!(await assertLeagueMember(report.leagueId, userId, res))) return;

      const updated = await storage.updateStoryReport(reportId, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.get("/api/story-studio/reports/:id/export", isAuthenticated, async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const report = await storage.getStoryReportWithSections(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (!(await assertLeagueMember(report.leagueId, userId, res))) return;

      const byKind = new Map(report.sections.map(s => [s.kind, s.content ?? ""]));
      const md = [
        `# ${byKind.get("headline") ?? report.selectedStory.title}`,
        "",
        byKind.get("opening") ?? "",
        "",
        byKind.get("winnerSummary") ?? "",
        "",
        byKind.get("closing") ?? "",
      ].join("\n").trim() + "\n";

      res.json({ markdown: md });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  return httpServer;
}
