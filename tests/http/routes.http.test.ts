import { vi, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";

export const HTTP_TEST_USER = "http-test-user";

const mockStorage = vi.hoisted(() => ({
  isLeagueAdmin: vi.fn(),
  getParlay: vi.fn(),
  updateParlay: vi.fn(),
  updateUserSettings: vi.fn(),
  updateLeagueSettings: vi.fn(),
  getLeague: vi.fn(),
  addParlayLeg: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: mockStorage }));

vi.mock("../../server/replit_integrations/auth", () => ({
  setupAuth: vi.fn().mockResolvedValue(undefined),
  registerAuthRoutes: vi.fn(),
  registerLocalAuthRoutes: vi.fn(),
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = {
      claims: { sub: HTTP_TEST_USER },
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    };
    req.isAuthenticated = () => true;
    next();
  },
}));

vi.mock("../../server/redis-clients", () => ({
  connectSessionRedis: vi.fn().mockResolvedValue(undefined),
  isRedisConfigured: () => false,
  getSessionRedis: () => null,
  redisKeyPrefix: () => "test:",
}));

vi.mock("../../server/realtime-ws", () => ({
  registerRealtimeWebSocket: vi.fn(),
}));

vi.mock("../../server/jobs/odds-sync-queue", () => ({
  startOddsSyncWorker: vi.fn(),
  runOddsSyncQueued: vi.fn(),
}));

import { buildHttpTestApp } from "../helpers/http-test-app";

let testApp: Awaited<ReturnType<typeof buildHttpTestApp>>;

beforeEach(async () => {
  vi.clearAllMocks();
  testApp = await buildHttpTestApp();
});

describe("HTTP route validation and auth", () => {
  describe("PATCH /api/parlays/:id", () => {
    test("returns 403 when caller is not league admin", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 1, leagueId: 10, weekId: 2, userId: "other" });
      mockStorage.isLeagueAdmin.mockResolvedValue(false);

      const res = await request(testApp)
        .patch("/api/parlays/1")
        .send({ status: "win" });

      expect(res.status).toBe(403);
      expect(mockStorage.updateParlay).not.toHaveBeenCalled();
    });

    test("returns 400 for invalid body", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 1, leagueId: 10, weekId: 2, userId: "other" });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);

      const res = await request(testApp)
        .patch("/api/parlays/1")
        .send({ status: "maybe" });

      expect(res.status).toBe(400);
      expect(mockStorage.updateParlay).not.toHaveBeenCalled();
    });

    test("returns 200 for valid admin update", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 1, leagueId: 10, weekId: 2, userId: "other" });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);
      mockStorage.updateParlay.mockResolvedValue({ id: 1, status: "win", leagueId: 10, weekId: 2 });

      const res = await request(testApp)
        .patch("/api/parlays/1")
        .send({ status: "win", legs: [{ id: 5, result: null }] });

      expect(res.status).toBe(200);
      expect(mockStorage.updateParlay).toHaveBeenCalledWith(1, {
        status: "win",
        legs: [{ id: 5, result: null }],
      });
    });
  });

  describe("PATCH /api/users/me/settings", () => {
    test("returns 400 for invalid theme", async () => {
      const res = await request(testApp)
        .patch("/api/users/me/settings")
        .send({ theme: "neon" });

      expect(res.status).toBe(400);
      expect(mockStorage.updateUserSettings).not.toHaveBeenCalled();
    });

    test("returns 200 for valid settings patch", async () => {
      mockStorage.updateUserSettings.mockResolvedValue(undefined);

      const res = await request(testApp)
        .patch("/api/users/me/settings")
        .send({ theme: "dark", region: "US" });

      expect(res.status).toBe(200);
      expect(mockStorage.updateUserSettings).toHaveBeenCalledWith(HTTP_TEST_USER, {
        theme: "dark",
        region: "US",
      });
    });
  });

  describe("PATCH /api/leagues/:id/settings", () => {
    test("returns 403 when caller is not admin", async () => {
      mockStorage.isLeagueAdmin.mockResolvedValue(false);

      const res = await request(testApp)
        .patch("/api/leagues/5/settings")
        .send({ name: "Renamed" });

      expect(res.status).toBe(403);
      expect(mockStorage.updateLeagueSettings).not.toHaveBeenCalled();
    });

    test("returns 400 for minLegs exceeding maxLegs", async () => {
      mockStorage.isLeagueAdmin.mockResolvedValue(true);

      const res = await request(testApp)
        .patch("/api/leagues/5/settings")
        .send({ minLegsPerParlay: 8, maxLegsPerParlay: 3 });

      expect(res.status).toBe(400);
      expect(mockStorage.updateLeagueSettings).not.toHaveBeenCalled();
    });

    test("returns 200 for valid league settings", async () => {
      mockStorage.isLeagueAdmin.mockResolvedValue(true);
      mockStorage.updateLeagueSettings.mockResolvedValue({ id: 5, name: "Renamed" });

      const res = await request(testApp)
        .patch("/api/leagues/5/settings")
        .send({ name: "Renamed", insightsEnabled: true });

      expect(res.status).toBe(200);
      expect(mockStorage.updateLeagueSettings).toHaveBeenCalledWith(5, {
        name: "Renamed",
        insightsEnabled: true,
      });
    });
  });

  describe("POST /api/parlays/:id/legs (demo editor)", () => {
    test("returns 403 when league is not demo", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: false });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", pick: "home", line: "-3" });

      expect(res.status).toBe(403);
      expect(mockStorage.addParlayLeg).not.toHaveBeenCalled();
    });

    test("returns 400 for invalid body", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: true });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", gameId: 99 });

      expect(res.status).toBe(400);
      expect(mockStorage.addParlayLeg).not.toHaveBeenCalled();
    });

    test("returns 200 and normalizes empty line to null", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: true });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);
      mockStorage.addParlayLeg.mockResolvedValue({ id: 99, betType: "spread", pick: "home", line: null });

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", pick: "home", line: "" });

      expect(res.status).toBe(200);
      expect(mockStorage.addParlayLeg).toHaveBeenCalledWith(3, {
        betType: "spread",
        pick: "home",
        line: null,
        odds: null,
        oddsSource: null,
        playerName: null,
        propType: null,
        notes: null,
        gameSegment: null,
        userId: HTTP_TEST_USER,
      });
    });
  });
});
