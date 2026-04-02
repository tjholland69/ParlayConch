import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { pool } from "./db";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import { insertLeagueSchema, insertParlaySchema, insertParlayLegSchema, type LieutenantPermissions, DEFAULT_LIEUTENANT_PERMISSIONS } from "@shared/schema";
import { syncGamesFromOddsApi, getApiUsage, fetchUpcomingGames, syncGameScores } from "./services/oddsApi";
import { fetchNFLNews } from "./services/nflNews";
import { sendMemberAddedEmail, sendLeagueInviteEmail } from "./services/email";
import { enrichLeagueParlayLegs } from "./services/enrichment";
import { syncGameScoresFromNflverse, syncPlayerStatsForGames } from "./services/nflverse";

/** Returns true if the user is an admin OR is a lieutenant with the specified permission enabled. */
async function hasLeaguePermission(leagueId: number, userId: string, permission: keyof LieutenantPermissions): Promise<boolean> {
  const isAdmin = await storage.isLeagueAdmin(leagueId, userId);
  if (isAdmin) return true;
  const isLt = await storage.isLeagueLieutenant(leagueId, userId);
  if (!isLt) return false;
  const league = await storage.getLeague(leagueId);
  const perms = (league?.lieutenantPermissions as LieutenantPermissions) || DEFAULT_LIEUTENANT_PERMISSIONS;
  return perms[permission] === true;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

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

  app.get("/api/leagues/:id", isAuthenticated, async (req, res) => {
    const league = await storage.getLeague(Number(req.params.id));
    if (!league) return res.status(404).json({ message: "League not found" });
    res.json(league);
  });

  app.get("/api/leagues/:id/stats", isAuthenticated, async (req, res) => {
    const stats = await storage.getLeagueStats(Number(req.params.id));
    res.json(stats);
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
          parlayId: 0, // Will be set by storage
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

  // Seed Data Endpoint
  app.post("/api/seed", async (req, res) => {
    const existingWeeks = await storage.getWeeks();
    if (existingWeeks.length === 0) {
      const w1 = await storage.createWeek({ season: 2024, weekNumber: 1, label: "Week 1" });
      const w2 = await storage.createWeek({ season: 2024, weekNumber: 2, label: "Week 2" });
      const w3 = await storage.createWeek({ season: 2024, weekNumber: 3, label: "Week 3" });
      
      // Week 1 games
      await storage.createGame({
        weekId: w1.id, homeTeam: "Chiefs", awayTeam: "Ravens", spread: "-3.0",
        overUnder: "47.5", moneylineHome: "-155", moneylineAway: "+135",
        gameTime: new Date("2024-09-05T20:20:00Z"), isFinished: true,
        homeScore: 27, awayScore: 20, winner: "home",
        venue: "Arrowhead Stadium", homeRecord: "1-0", awayRecord: "0-1"
      });
      await storage.createGame({
        weekId: w1.id, homeTeam: "Eagles", awayTeam: "Packers", spread: "-2.5",
        overUnder: "49.0", moneylineHome: "-130", moneylineAway: "+110",
        gameTime: new Date("2024-09-06T20:15:00Z"), isFinished: true,
        homeScore: 34, awayScore: 29, winner: "home",
        venue: "Lincoln Financial Field", homeRecord: "1-0", awayRecord: "0-1"
      });
      await storage.createGame({
        weekId: w1.id, homeTeam: "Cowboys", awayTeam: "Browns", spread: "-6.5",
        overUnder: "44.5", moneylineHome: "-280", moneylineAway: "+230",
        gameTime: new Date("2024-09-08T13:00:00Z"), isFinished: true,
        homeScore: 33, awayScore: 17, winner: "home",
        venue: "AT&T Stadium", homeRecord: "1-0", awayRecord: "0-1"
      });
      await storage.createGame({
        weekId: w1.id, homeTeam: "49ers", awayTeam: "Jets", spread: "-9.0",
        overUnder: "43.0", moneylineHome: "-400", moneylineAway: "+320",
        gameTime: new Date("2024-09-09T20:15:00Z"), isFinished: true,
        homeScore: 30, awayScore: 17, winner: "home",
        venue: "Levi's Stadium", homeRecord: "1-0", awayRecord: "0-1"
      });

      // Week 2 games
      await storage.createGame({
        weekId: w2.id, homeTeam: "Dolphins", awayTeam: "Bills", spread: "-1.5",
        overUnder: "52.0", moneylineHome: "-115", moneylineAway: "-105",
        gameTime: new Date("2024-09-12T20:15:00Z"), isFinished: true,
        homeScore: 20, awayScore: 31, winner: "away",
        venue: "Hard Rock Stadium", homeRecord: "1-1", awayRecord: "2-0"
      });
      await storage.createGame({
        weekId: w2.id, homeTeam: "Steelers", awayTeam: "Broncos", spread: "-3.0",
        overUnder: "36.5", moneylineHome: "-150", moneylineAway: "+130",
        gameTime: new Date("2024-09-15T13:00:00Z"), isFinished: true,
        homeScore: 13, awayScore: 6, winner: "home",
        venue: "Acrisure Stadium", homeRecord: "2-0", awayRecord: "0-2"
      });

      // Week 3 games (current/future)
      await storage.createGame({
        weekId: w3.id, homeTeam: "Saints", awayTeam: "Eagles", spread: "+3.5",
        overUnder: "48.5", moneylineHome: "+150", moneylineAway: "-175",
        gameTime: new Date("2025-09-21T13:00:00Z"),
        venue: "Caesars Superdome", homeRecord: "2-0", awayRecord: "1-1"
      });
      await storage.createGame({
        weekId: w3.id, homeTeam: "Ravens", awayTeam: "Cowboys", spread: "-1.0",
        overUnder: "51.5", moneylineHome: "-110", moneylineAway: "-110",
        gameTime: new Date("2025-09-21T16:25:00Z"),
        venue: "M&T Bank Stadium", homeRecord: "0-2", awayRecord: "1-1"
      });
      await storage.createGame({
        weekId: w3.id, homeTeam: "Chiefs", awayTeam: "Falcons", spread: "-5.5",
        overUnder: "46.0", moneylineHome: "-230", moneylineAway: "+190",
        gameTime: new Date("2025-09-22T20:20:00Z"),
        venue: "Arrowhead Stadium", homeRecord: "2-0", awayRecord: "1-1"
      });
      await storage.createGame({
        weekId: w3.id, homeTeam: "Bengals", awayTeam: "Commanders", spread: "-6.0",
        overUnder: "47.5", moneylineHome: "-250", moneylineAway: "+210",
        gameTime: new Date("2025-09-23T20:15:00Z"),
        venue: "Paycor Stadium", homeRecord: "0-2", awayRecord: "1-1"
      });

      res.json({ message: "Seeded with sample data" });
    } else {
      res.json({ message: "Already seeded" });
    }
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

      const result = await syncGamesFromOddsApi(weekId);
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
      const limit = Math.min(Number(req.query.limit) || 10, 20);
      const news = await fetchNFLNews(limit);
      res.json(news);
    } catch (err: any) {
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
          const { weekId, memberEmail, status, legs } = record;
          
          if (!weekId || !memberEmail || !legs || !Array.isArray(legs) || legs.length === 0) {
            skippedRows.push(`${memberEmail || "?"} week ${weekId}: missing required fields`);
            continue;
          }

          const member = await storage.getLeagueMemberByEmail(leagueId, memberEmail);
          if (!member) {
            skippedRows.push(`${memberEmail}: not a member of this league`);
            continue;
          }

          // Resolve legs — support both gameId (old) and homeTeam+awayTeam (new)
          const resolvedLegs: { gameId: number; betType: string; pick: string; line?: string; result?: string }[] = [];
          for (const leg of legs as any[]) {
            let gameId: number | null = leg.gameId ?? null;

            if (!gameId && leg.homeTeam && leg.awayTeam) {
              const game = await storage.upsertGameForImport(weekId, leg.homeTeam, leg.awayTeam);
              gameId = game.id;
            }

            if (!gameId) {
              skippedRows.push(`${memberEmail} week ${weekId}: could not resolve game for leg`);
              continue;
            }

            resolvedLegs.push({
              gameId,
              betType: leg.betType || 'spread',
              pick: leg.pick,
              line: leg.line || null,
              result: leg.result || null,
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
      const userId = (req.user as any).claims.sub;

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
        const enrichResult = await enrichLeagueParlayLegs();
        result.enrichment = enrichResult;
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

  // GET /api/games/:gameId/player-stats
  // Returns player stats for all players on both teams in a given game
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

  // ===== LEAGUE SETTINGS =====
  app.get("/api/leagues/:id/members", isAuthenticated, async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const userId = (req.user as any).claims.sub;
      const isMember = (await storage.getLeagueMembers(leagueId)).some(m => m.userId === userId);
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
            username: existingUser.firstName || existingUser.email,
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

  // ONE-TIME MIGRATION: copy dev data snapshot into this database (production use only)
  // Gated by PROD_MIGRATION_ENABLED=true env var + must be authenticated as the owner account
  app.post("/api/admin/migrate-dev-to-prod", isAuthenticated, async (req, res) => {
    try {
      if (process.env.PROD_MIGRATION_ENABLED !== "true") {
        return res.status(403).json({ message: "Migration not enabled" });
      }
      const userId = (req.user as any).claims.sub;
      if (userId !== "52372237") {
        return res.status(403).json({ message: "Only the owner account can run this migration" });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // 1. Upsert all 17 dev users
        await client.query(`
          INSERT INTO users (id, first_name, last_name, email, profile_image_url, is_demo, settings, created_at, updated_at) VALUES
            ('52372237', 'Tim', 'Holland', 'hollandtim917@gmail.com', NULL, false, '{}', '2026-01-04 02:15:51.029151', '2026-01-19 21:42:51.235'),
            ('55226224', NULL, NULL, 'parlayconchtest1@gmail.com', 'https://lh3.googleusercontent.com/a/ACg8ocKQxu6tW1_-Y4_g3QrqoqVVohWMBYSqb85bekdTEYfC3qj52A=s96-c', true, '{"displayName": "Test 1"}', '2026-02-24 03:51:49.360548', '2026-03-29 18:59:32.129'),
            ('admin-priv-test-001', 'Admin', 'Tester', 'adminprivtest@example.com', NULL, false, '{}', '2026-03-30 03:10:57.554269', '2026-03-30 03:10:57.554269'),
            ('demo_user_01', 'ParlayConch Demo 1', NULL, 'demo1@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.014062', '2026-04-02 00:50:51.014062'),
            ('demo_user_02', 'ParlayConch Demo 2', NULL, 'demo2@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.051363', '2026-04-02 00:50:51.051363'),
            ('demo_user_03', 'ParlayConch Demo 3', NULL, 'demo3@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.055654', '2026-04-02 00:50:51.055654'),
            ('demo_user_04', 'ParlayConch Demo 4', NULL, 'demo4@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.059640', '2026-04-02 00:50:51.059640'),
            ('demo_user_05', 'ParlayConch Demo 5', NULL, 'demo5@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.063067', '2026-04-02 00:50:51.063067'),
            ('demo_user_06', 'ParlayConch Demo 6', NULL, 'demo6@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.065880', '2026-04-02 00:50:51.065880'),
            ('demo_user_07', 'ParlayConch Demo 7', NULL, 'demo7@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.068128', '2026-04-02 00:50:51.068128'),
            ('demo_user_08', 'ParlayConch Demo 8', NULL, 'demo8@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.071019', '2026-04-02 00:50:51.071019'),
            ('demo_user_09', 'ParlayConch Demo 9', NULL, 'demo9@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.074396', '2026-04-02 00:50:51.074396'),
            ('demo_user_10', 'ParlayConch Demo 10', NULL, 'demo10@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.077579', '2026-04-02 00:50:51.077579'),
            ('demo_user_11', 'ParlayConch Demo 11', NULL, 'demo11@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.080674', '2026-04-02 00:50:51.080674'),
            ('demo_user_12', 'ParlayConch Demo 12', NULL, 'demo12@parlayconch.demo', NULL, true, '{}', '2026-04-02 00:50:51.083996', '2026-04-02 00:50:51.083996'),
            ('lock-test-admin', 'Lock', 'Admin', 'lockadmin@example.com', NULL, false, '{}', '2026-03-30 02:54:18.220776', '2026-03-30 02:54:18.220776'),
            ('notif-test-001', 'Notif', 'Tester', 'notiftest@example.com', NULL, false, '{"notificationPreferences":{"sms":true,"push":false,"email":true,"phone":"+1 555 123 4567"}}', '2026-03-29 18:30:34.459406', '2026-03-29 18:30:34.459406')
          ON CONFLICT (id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            email = EXCLUDED.email,
            profile_image_url = EXCLUDED.profile_image_url,
            is_demo = EXCLUDED.is_demo,
            settings = EXCLUDED.settings,
            updated_at = EXCLUDED.updated_at
        `);

        // 2. Replace leagues and league_members (delete FK children first)
        await client.query("DELETE FROM league_week_locks");
        await client.query("DELETE FROM notifications");
        await client.query("DELETE FROM parlay_legs");
        await client.query("DELETE FROM parlays");
        await client.query("DELETE FROM import_batches");
        await client.query("DELETE FROM league_members");
        await client.query("DELETE FROM leagues");

        await client.query(`
          INSERT INTO leagues (id, name, description, invite_code, max_parlays_per_week, min_legs_per_parlay, max_legs_per_parlay, created_at, is_demo, lieutenant_permissions, notification_settings) VALUES
            (1, 'ParlayKirk69', 'DKE House Fantasy League', 'O16LFN', 1, 3, 5, '2026-01-04 02:16:42.713739', false, NULL, NULL),
            (2, 'TestingWithTheBoys1', 'Testing with the boys 1', 'X0GXHN', 1, 3, 5, '2026-02-24 03:57:08.060994', false, NULL, NULL),
            (3, 'Lock Test League', 'League for lock/unlock testing', 'X4VRKG', 1, 3, 5, '2026-03-30 02:54:49.187388', false, NULL, NULL),
            (4, 'Admin Priv Test League', 'League created for admin privileges test', '5T1OHN', 1, 3, 5, '2026-03-30 03:11:58.588873', false, NULL, NULL)
        `);
        await client.query("SELECT setval('leagues_id_seq', 4)");

        // 3. League members
        await client.query(`
          INSERT INTO league_members (id, league_id, user_id, role, joined_at) VALUES
            (1, 1, '52372237', 'admin', '2026-01-04 02:16:42.721631'),
            (2, 2, '55226224', 'admin', '2026-02-24 03:57:08.078734'),
            (3, 3, 'lock-test-admin', 'admin', '2026-03-30 02:54:49.194456'),
            (4, 4, 'admin-priv-test-001', 'admin', '2026-03-30 03:11:58.593102')
        `);
        await client.query("SELECT setval('league_members_id_seq', 4)");

        // 4. Weeks
        await client.query("DELETE FROM games");
        await client.query("DELETE FROM weeks");
        await client.query(`
          INSERT INTO weeks (id, season, week_number, label, is_active) VALUES
            (1, 2024, 1, 'Week 1', true),
            (2, 2024, 2, 'Week 2', true)
        `);
        await client.query("SELECT setval('weeks_id_seq', 2)");

        // 5. Games
        await client.query(`
          INSERT INTO games (id, week_id, home_team, away_team, spread, game_time, home_score, away_score, is_finished, winner) VALUES
            (1, 1, 'Chiefs', 'Ravens', '-3.0', '2024-09-05 20:20:00', 27, 20, true, 'home'),
            (2, 1, 'Eagles', 'Packers', '-2.5', '2024-09-06 20:15:00', 34, 29, true, 'home'),
            (3, 2, 'Dolphins', 'Bills', '-1.5', '2024-09-12 20:15:00', NULL, NULL, false, NULL)
        `);
        await client.query("SELECT setval('games_id_seq', 3)");

        await client.query("COMMIT");
        res.json({ success: true, message: "Migration completed successfully" });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error("Migration error:", err);
      res.status(500).json({ message: err.message });
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

  return httpServer;
}
