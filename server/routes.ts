import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Weeks
  app.get(api.weeks.list.path, async (req, res) => {
    const weeks = await storage.getWeeks();
    res.json(weeks);
  });

  app.get(api.weeks.get.path, async (req, res) => {
    const week = await storage.getWeek(Number(req.params.id));
    if (!week) return res.status(404).json({ message: "Week not found" });
    res.json(week);
  });

  // Games
  app.get(api.games.listByWeek.path, async (req, res) => {
    const weekId = Number(req.params.id);
    const userId = (req.user as any)?.claims?.sub;
    const games = await storage.getGamesByWeek(weekId, userId);
    res.json(games);
  });

  // Bets
  app.post(api.bets.create.path, isAuthenticated, async (req, res) => {
    try {
      const input = api.bets.create.input.parse(req.body);
      const userId = (req.user as any).claims.sub;
      const bet = await storage.createBet(userId, input);
      res.status(201).json(bet);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.bets.history.path, isAuthenticated, async (req, res) => {
    const userId = (req.user as any).claims.sub;
    const history = await storage.getBetHistory(userId);
    res.json(history);
  });

  // Stats
  app.get(api.stats.list.path, async (req, res) => {
    const stats = await storage.getStats();
    res.json(stats);
  });

  // Seed Data Endpoint (Hidden)
  app.post("/api/seed", async (req, res) => {
    const weeks = await storage.getWeeks();
    if (weeks.length === 0) {
      const w1 = await storage.createWeek({ season: 2024, weekNumber: 1, label: "Week 1" });
      const w2 = await storage.createWeek({ season: 2024, weekNumber: 2, label: "Week 2" });
      
      // Games for Week 1
      await storage.createGame({
        weekId: w1.id,
        homeTeam: "Chiefs",
        awayTeam: "Ravens",
        spread: "-3.0",
        gameTime: new Date("2024-09-05T20:20:00Z"),
        isFinished: true,
        homeScore: 27,
        awayScore: 20,
        winner: "home"
      });
      
      await storage.createGame({
        weekId: w1.id,
        homeTeam: "Eagles",
        awayTeam: "Packers",
        spread: "-2.5",
        gameTime: new Date("2024-09-06T20:15:00Z"),
        isFinished: true,
        homeScore: 34,
        awayScore: 29,
        winner: "home"
      });

      // Games for Week 2
      await storage.createGame({
        weekId: w2.id,
        homeTeam: "Dolphins",
        awayTeam: "Bills",
        spread: "-1.5",
        gameTime: new Date("2024-09-12T20:15:00Z"),
      });

      res.json({ message: "Seeded" });
    } else {
      res.json({ message: "Already seeded" });
    }
  });

  return httpServer;
}
