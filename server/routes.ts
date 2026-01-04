import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";
import { insertLeagueSchema, insertParlaySchema, insertParlayLegSchema } from "@shared/schema";

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
      return res.status(403).json({ message: "Only league admins can approve parlays" });
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
      return res.status(403).json({ message: "Only league admins can reject parlays" });
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

  return httpServer;
}
