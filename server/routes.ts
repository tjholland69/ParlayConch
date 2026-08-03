import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { setupAuth, registerAuthRoutes, isAuthenticated, registerLocalAuthRoutes } from "./replit_integrations/auth";
import { z } from "zod";
import { insertLeagueSchema, type LieutenantPermissions, DEFAULT_LIEUTENANT_PERMISSIONS, users, leagueMembers, parlayLegs, parlays, insertCustomIndexSchema, updateCustomIndexSchema, customIndexFiltersEqual, type CustomIndexFilters } from "@shared/schema";
import { ilike, eq, and, or, inArray, sql as drizzleSql } from "drizzle-orm";
import { getApiUsage, fetchUpcomingGames, syncGameScores } from "./services/oddsApi";
import { runOddsSyncQueued, startOddsSyncWorker } from "./jobs/odds-sync-queue";
import { connectSessionRedis, isRedisConfigured } from "./redis-clients";
import { registerRealtimeWebSocket } from "./realtime-ws";
import { fetchNFLNews, fetchNFLInjuries, fetchNFLScores } from "./services/nflNews";
import { getUserInsights, getLeagueInsights, type InsightFocus } from "./services/bettingInsights";
import { getUserSummary, getUserPatterns, getWinRateTimeSeries, computeWinRateSeries, getLeagueWeeklyWinRates } from "./services/dashboardAnalytics";
import { getWeeklyAnalyticsReport } from "./services/storyStudio/analyticsEngine";
import { discoverStories } from "./services/storyStudio/storyDiscovery";
import { generateSection } from "./services/storyStudio/editorialGeneration";
import { insertStoryReportSchema, updateStoryReportSchema, STORY_SECTION_KINDS, type StorySectionKind } from "@shared/schema";
import { resolvePropsFromStats, fetchPropLinesFromOddsApi } from "./services/propEnrichment";
import { sendMemberAddedEmail, sendLeagueInviteEmail } from "./services/email";
import { enrichLeagueParlayLegs } from "./services/enrichment";
import { enrichSingleLeg } from "./services/legEnrich";
import { syncGameScoresFromNflverse, syncPlayerStatsForGames } from "./services/nflverse";
import { parseTicketImages } from "./services/screenshotParser";
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
  }
  registerRealtimeWebSocket(httpServer, app);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // === Act-As middleware for super users ===
  // Overrides req.user.claims.sub for all routes except /api/superuser/* and /api/auth/user.
  // The override is only applied when a super user has set an active act-as session.
  app.use((req, _res, next) => {
    const session = req.session as any;
    if (
      session?.actingAsUserId &&
      req.user &&
      !req.path.startsWith("/api/superuser") &&
      req.path !== "/api/auth/user"
    ) {
      (req.user as any).claims.sub = session.actingAsUserId;
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
        .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
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
      delete (req.session as any).actingAsUserId;
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
    const summary = await getUserSummary(userId);
    res.json(summary);
  });

  app.get("/api/dashboard/patterns", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const patterns = await getUserPatterns(userId);
    res.json(patterns);
  });

  app.get("/api/dashboard/performance", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    const series = await getWinRateTimeSeries(userId, leagueId);
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

    const series = await computeWinRateSeries(userId, {
      leagueIds: csvNumbers(req.query.leagueIds),
      betTypes: csvStrings(req.query.betTypes),
      propTypes: csvStrings(req.query.propTypes),
      playerName: str(req.query.playerName),
      teamName: str(req.query.teamName),
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

  app.delete("/api/custom-indexes/:id", isAuthenticated, async (req, res) => {
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

  app.delete("/api/custom-indexes/:id/share/:userId", isAuthenticated, async (req, res) => {
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
    const series = await getLeagueWeeklyWinRates(userId, leagueIds);
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

  // Member-facing read-only view of all parlays across all weeks (no demo/admin gating)
  app.get("/api/leagues/:id/parlays", isAuthenticated, async (req, res) => {
    const leagueId = Number(req.params.id);
    const userId = (req.user as any).claims.sub;
    const superUser = await storage.isSuperUser(userId);
    const isMember = superUser || (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
    if (!isMember) return res.status(403).json({ message: "Not a member of this league" });
    const allParlays = await storage.getAllLeagueParlays(leagueId);
    res.json(allParlays);
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

  // ===== PARLAYS =====
  const createParlayInput = z.object({
    leagueId: z.number(),
    weekId: z.number(),
    legs: z.array(z.object({
      gameId: z.number(),
      betType: z.string(),
      pick: z.string(),
      line: z.string().optional()
    }))
  });

  app.post("/api/parlays", isAuthenticated, async (req, res) => {
    try {
      const input = createParlayInput.parse(req.body);
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
          line: l.line || null
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

  app.get("/api/parlays/my", isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const leagueId = req.query.leagueId ? Number(req.query.leagueId) : undefined;
    const history = await storage.getUserParlayHistory(userId, leagueId);
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
  app.post("/api/parlays/:id/approve", isAuthenticated, async (req, res) => {
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

    const updated = await storage.approveParlay(parlayId, userId);
    res.json(updated);
  });

  app.post("/api/parlays/:id/reject", isAuthenticated, async (req, res) => {
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
      res.json({ message: `Synced games: ${result.added} added, ${result.updated} updated` });
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

      let news;
      if (feed === "injuries") {
        news = (await fetchNFLInjuries()).slice(0, limit);
      } else if (feed === "scores") {
        news = await fetchNFLScores();
      } else {
        news = await fetchNFLNews(limit);
      }

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
      console.error("[insights] user error:", err);
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
      console.error("[insights] league error:", err);
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
              line: leg.line || null,
              odds: leg.odds || null,
              gameSegment: leg.gameSegment || null,
              result: leg.result || null,
              playerName: isPlayerProp ? (leg.playerName || null) : null,
              propType: isPlayerProp ? (leg.propType || null) : null,
              notes: leg.notes || null,
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
          console.error("Import record error:", e);
          skippedRows.push(`Error processing a record: ${(e as Error).message}`);
        }
      }

      // Trigger enrichment in the background (don't block the response)
      enrichLeagueParlayLegs(leagueId).then(result => {
        console.log(`[Enrichment] league ${leagueId}: enriched=${result.enriched} resultsFilled=${result.resultsFilled} linesFilled=${result.linesFilled} skipped=${result.skipped}`);
      }).catch(err => {
        console.error("[Enrichment] background error:", err);
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
        console.error("[Screenshot Import] error:", err);
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
  // Syncs game scores and/or player stats from nflverse open data for the given
  // season (and optionally a specific week). Only touches games already in our DB.
  app.post("/api/admin/sync-nflverse", isAuthenticated, async (req, res) => {
    try {
      // Require the user to be an admin in at least one league (rough guard)
      // A dedicated global-admin check can be added later
      const { season, week, mode = "all" } = req.body;

      if (!season || isNaN(Number(season))) {
        return res.status(400).json({ message: "season (number) is required" });
      }

      const seasonNum = Number(season);
      const weekNums = week ? [Number(week)] : undefined;

      const result: Record<string, unknown> = { season: seasonNum, week: week ?? "all" };

      if (mode === "scores" || mode === "all") {
        const scoreSync = await syncGameScoresFromNflverse(seasonNum, weekNums);
        result.scores = scoreSync;
        console.log(`[nflverse] scores sync:`, scoreSync);

        // Re-run enrichment after scores are updated
        result.enrichment = await enrichLeagueParlayLegs();
      }

      if (mode === "players" || mode === "all") {
        if (!week) {
          return res.status(400).json({ message: "week is required for player stats sync" });
        }
        const playerSync = await syncPlayerStatsForGames(seasonNum, Number(week));
        result.players = playerSync;
        console.log(`[nflverse] player stats sync:`, playerSync);
      }

      res.json({ message: "nflverse sync complete", ...result });
    } catch (err: any) {
      console.error("[nflverse] sync error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/resolve-props
  // Resolves all pending player-prop legs using already-synced nflverse player stats.
  // No body required — scans every prop leg across all leagues.
  app.post("/api/admin/resolve-props", isAuthenticated, async (req, res) => {
    try {
      const result = await resolvePropsFromStats();
      res.json({ message: "Prop resolution complete", ...result });
    } catch (err: any) {
      console.error("[prop-resolve] error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/fetch-prop-lines
  // Fetches player prop lines/odds from The Odds API for a specific league+week.
  // Body: { leagueId: number, weekId: number }
  app.post("/api/admin/fetch-prop-lines", isAuthenticated, async (req, res) => {
    try {
      const { leagueId, weekId } = req.body;
      if (!leagueId || !weekId) {
        return res.status(400).json({ message: "leagueId and weekId are required" });
      }
      const result = await fetchPropLinesFromOddsApi(Number(leagueId), Number(weekId));
      res.json({ message: "Prop lines fetch complete", ...result });
    } catch (err: any) {
      console.error("[prop-lines] error:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/games/:gameId/player-stats
  // Returns player stats for all players on both teams in a given game
  // Backfill: promote all fully-resolved parlays from 'approved'/'pending' to win/loss/push
  app.post("/api/admin/weeks/:id/activate", isAuthenticated, async (req, res) => {
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

  app.post("/api/admin/rollup-parlay-statuses", isAuthenticated, async (req, res) => {
    try {
      const { leagueId, recomputeTerminal } = req.body;
      const result = await storage.rollupLeagueParlayStatuses(leagueId ? Number(leagueId) : undefined, !!recomputeTerminal);
      res.json({ message: "Rollup complete", ...result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/admin/backfill-game-finished-at", isAuthenticated, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      if (!(await storage.isSuperUser(userId))) {
        return res.status(403).json({ message: "Super user access required" });
      }
      const result = await storage.backfillGameFinishedAt();
      res.json({ message: "Backfill complete", ...result });
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
  app.delete("/api/leagues/:leagueId/imports/:batchId", isAuthenticated, async (req, res) => {
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
      const members = await storage.getLeagueMembersWithUsers(leagueId);
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
              console.error(`Failed to send invite email to ${email}:`, emailErr);
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
            console.error(`Failed to send added email to ${email}:`, emailErr);
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

      const schema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        maxParlaysPerWeek: z.number().int().positive().optional(),
        minLegsPerParlay: z.number().int().min(1).optional(),
        maxLegsPerParlay: z.number().int().min(1).optional(),
        insightsEnabled: z.boolean().optional(),
        loserLabel: z.enum(['parlay_loser', 'asshole']).optional(),
      });
      const updates = schema.parse(req.body);
      const league = await storage.updateLeagueSettings(leagueId, updates);
      res.json(league);
    } catch (err: any) {
      res.status(err instanceof z.ZodError ? 400 : 500).json({ message: err.message });
    }
  });

  app.patch("/api/leagues/:id/members/:userId/role", isAuthenticated, async (req, res) => {
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

  app.patch("/api/leagues/:id/lieutenant-permissions", isAuthenticated, async (req, res) => {
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
      await storage.updateUserSettings(userId, req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

      const { status, legs } = req.body;
      const updated = await storage.updateParlay(parlayId, { status, legs });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const allParlays = await storage.getAllLeagueParlays(leagueId);
      res.json(allParlays);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/parlays/:id", isAuthenticated, async (req, res) => {
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

  app.delete("/api/parlay-legs/:legId", isAuthenticated, async (req, res) => {
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

  app.patch("/api/parlay-legs/:legId", isAuthenticated, async (req, res) => {
    try {
      const legId = Number(req.params.legId);
      const [leg] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, legId));
      if (!leg) return res.status(404).json({ message: "Leg not found" });
      const parlay = await storage.getParlay(leg.parlayId);
      if (!parlay) return res.status(404).json({ message: "Parlay not found" });
      const uid = await requireDemoAdmin(req, res, parlay.leagueId);
      if (!uid) return;
      const { betType, pick, line, odds, result, playerName, propType, notes, gameSegment, userId } = req.body;

      if (userId !== undefined && userId !== leg.userId) {
        const members = await storage.getLeagueMembers(parlay.leagueId);
        if (!members.some(m => m.userId === userId)) {
          return res.status(400).json({ message: "Selected user is not a member of this league" });
        }
        const siblingLegs = await db.select().from(parlayLegs).where(eq(parlayLegs.parlayId, leg.parlayId));
        if (siblingLegs.some(l => l.id !== legId && l.userId === userId)) {
          return res.status(400).json({ message: "This member already has a leg in this parlay" });
        }
      }

      const updates: Record<string, unknown> = {};
      if (betType !== undefined) updates.betType = betType;
      if (pick !== undefined) updates.pick = pick;
      if (line !== undefined) updates.line = line;
      if (odds !== undefined) updates.odds = odds;
      if (result !== undefined) updates.result = result;
      if (playerName !== undefined) updates.playerName = playerName;
      if (propType !== undefined) updates.propType = propType;
      if (notes !== undefined) updates.notes = notes;
      if (gameSegment !== undefined) updates.gameSegment = gameSegment;
      if (userId !== undefined) updates.userId = userId;

      const updated = await storage.updateParlayLeg(legId, updates);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const BULK_EDITABLE_LEG_FIELDS = ['betType', 'pick', 'line', 'odds', 'result', 'playerName', 'propType', 'notes', 'gameSegment', 'userId'] as const;

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
      res.status(500).json({ message: err.message });
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
      const { betType, pick, line, odds, playerName, propType, notes, gameSegment } = req.body;
      if (!betType || !pick) return res.status(400).json({ message: "betType and pick are required" });
      const newLeg = await storage.addParlayLeg(parlayId, { userId: parlay.userId, betType, pick, line, odds, playerName, propType, notes, gameSegment });
      res.json(newLeg);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

      const settings = z.object({
        scheduledReminders: z.boolean(),
        reminderDaysBeforeDeadline: z.number().min(1).max(7),
        reminderMessage: z.string().max(500),
      }).parse(req.body);

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

      await storage.removeLeagueMember(leagueId, userId);
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
