import { vi, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";

export const HTTP_TEST_USER = "http-test-user";

const mockStorage = vi.hoisted(() => ({
  isLeagueAdmin: vi.fn(),
  isSuperUser: vi.fn(),
  getParlay: vi.fn(),
  updateParlay: vi.fn(),
  updateUserSettings: vi.fn(),
  updateLeagueSettings: vi.fn(),
  getLeague: vi.fn(),
  addParlayLeg: vi.fn(),
  deleteParlay: vi.fn(),
  setUserDemoFlag: vi.fn(),
  setLeagueDemoFlag: vi.fn(),
  getLeagueMembers: vi.fn(),
  pokeMember: vi.fn(),
}));

vi.mock("../../server/storage", () => ({ storage: mockStorage }));

vi.mock("../../server/auth", () => ({
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
      mockStorage.isSuperUser.mockResolvedValue(true);

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", pick: "home", line: "-3" });

      expect(res.status).toBe(403);
      expect(mockStorage.addParlayLeg).not.toHaveBeenCalled();
    });

    // Regression test: requireDemoAdmin used to check isLeagueAdmin, letting
    // any regular league admin (not just a super user) use the demo data
    // editor tooling on a demo league. Demo-data actions are super-user-only.
    test("returns 403 when caller is a league admin but not a super user", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: true });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);
      mockStorage.isSuperUser.mockResolvedValue(false);

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", pick: "home", line: "-3" });

      expect(res.status).toBe(403);
      expect(mockStorage.addParlayLeg).not.toHaveBeenCalled();
    });

    test("returns 400 for invalid body", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: true });
      mockStorage.isSuperUser.mockResolvedValue(true);

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", gameId: 99 });

      expect(res.status).toBe(400);
      expect(mockStorage.addParlayLeg).not.toHaveBeenCalled();
    });

    test("returns 200 and normalizes empty line to null", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 3, leagueId: 7, weekId: 1, userId: HTTP_TEST_USER });
      mockStorage.getLeague.mockResolvedValue({ id: 7, isDemo: true });
      mockStorage.isSuperUser.mockResolvedValue(true);
      mockStorage.addParlayLeg.mockResolvedValue({ id: 99, betType: "spread", pick: "home", line: null });

      const res = await request(testApp)
        .post("/api/parlays/3/legs")
        .send({ betType: "spread", pick: "home", line: "" });

      expect(res.status).toBe(200);
      expect(mockStorage.addParlayLeg).toHaveBeenCalledWith(3, {
        gameId: null,
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

  describe("PATCH /api/users/me/demo", () => {
    // Regression test: this route previously had no authorization check at
    // all — any authenticated user could flag their own account as demo.
    test("returns 403 for a non-super-user", async () => {
      mockStorage.isSuperUser.mockResolvedValue(false);

      const res = await request(testApp)
        .patch("/api/users/me/demo")
        .send({ isDemo: true });

      expect(res.status).toBe(403);
      expect(mockStorage.setUserDemoFlag).not.toHaveBeenCalled();
    });

    test("returns 200 for a super user", async () => {
      mockStorage.isSuperUser.mockResolvedValue(true);
      mockStorage.setUserDemoFlag.mockResolvedValue(undefined);

      const res = await request(testApp)
        .patch("/api/users/me/demo")
        .send({ isDemo: true });

      expect(res.status).toBe(200);
      expect(mockStorage.setUserDemoFlag).toHaveBeenCalledWith(HTTP_TEST_USER, true);
    });
  });

  describe("PATCH /api/leagues/:id/demo", () => {
    // Regression test: this route used to authorize on isLeagueAdmin, letting
    // any regular league admin ("Parlay Maestro") flag/unflag a whole league
    // as demo — not just a super user.
    test("returns 403 for a league admin who is not a super user", async () => {
      mockStorage.isSuperUser.mockResolvedValue(false);

      const res = await request(testApp)
        .patch("/api/leagues/7/demo")
        .send({ isDemo: true });

      expect(res.status).toBe(403);
      expect(mockStorage.setLeagueDemoFlag).not.toHaveBeenCalled();
    });

    test("returns 200 for a super user", async () => {
      mockStorage.isSuperUser.mockResolvedValue(true);
      mockStorage.setLeagueDemoFlag.mockResolvedValue(undefined);

      const res = await request(testApp)
        .patch("/api/leagues/7/demo")
        .send({ isDemo: true });

      expect(res.status).toBe(200);
      expect(mockStorage.setLeagueDemoFlag).toHaveBeenCalledWith(7, true);
    });
  });

  describe("DELETE /api/parlays/:id", () => {
    // Regression test: this route used to reuse requireDemoAdmin (meant for
    // the demo-only Data Editor tools) and 403'd any admin deleting a parlay
    // in a real, non-demo league — the delete button never worked outside
    // demo leagues. It must now only require league-admin, regardless of
    // the league's isDemo flag.
    test("returns 200 for a league admin in a real (non-demo) league", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 5, leagueId: 12, weekId: 1, userId: "other" });
      mockStorage.getLeague.mockResolvedValue({ id: 12, isDemo: false });
      mockStorage.isLeagueAdmin.mockResolvedValue(true);
      mockStorage.deleteParlay.mockResolvedValue(undefined);

      const res = await request(testApp).delete("/api/parlays/5");

      expect(res.status).toBe(200);
      expect(mockStorage.deleteParlay).toHaveBeenCalledWith(5);
    });

    test("returns 403 when caller is not a league admin", async () => {
      mockStorage.getParlay.mockResolvedValue({ id: 5, leagueId: 12, weekId: 1, userId: "other" });
      mockStorage.getLeague.mockResolvedValue({ id: 12, isDemo: false });
      mockStorage.isLeagueAdmin.mockResolvedValue(false);

      const res = await request(testApp).delete("/api/parlays/5");

      expect(res.status).toBe(403);
      expect(mockStorage.deleteParlay).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/leagues/:id/pokes", () => {
    const members = [{ userId: HTTP_TEST_USER }, { userId: "friend" }];

    test("rejects poking yourself", async () => {
      const res = await request(testApp).post("/api/leagues/7/pokes").send({ toUserId: HTTP_TEST_USER });

      expect(res.status).toBe(400);
      expect(mockStorage.pokeMember).not.toHaveBeenCalled();
    });

    test("returns 403 when caller isn't in the league", async () => {
      mockStorage.getLeagueMembers.mockResolvedValue([{ userId: "friend" }, { userId: "other" }]);

      const res = await request(testApp).post("/api/leagues/7/pokes").send({ toUserId: "friend" });

      expect(res.status).toBe(403);
      expect(mockStorage.pokeMember).not.toHaveBeenCalled();
    });

    test("returns 404 when the target isn't in the league", async () => {
      mockStorage.getLeagueMembers.mockResolvedValue(members);

      const res = await request(testApp).post("/api/leagues/7/pokes").send({ toUserId: "stranger" });

      expect(res.status).toBe(404);
      expect(mockStorage.pokeMember).not.toHaveBeenCalled();
    });

    test("returns 409 on a repeat poke", async () => {
      mockStorage.getLeagueMembers.mockResolvedValue(members);
      mockStorage.pokeMember.mockResolvedValue("already_poked");

      const res = await request(testApp).post("/api/leagues/7/pokes").send({ toUserId: "friend" });

      expect(res.status).toBe(409);
    });

    test("returns 201 and pokes the member", async () => {
      mockStorage.getLeagueMembers.mockResolvedValue(members);
      mockStorage.pokeMember.mockResolvedValue("poked");

      const res = await request(testApp).post("/api/leagues/7/pokes").send({ toUserId: "friend" });

      expect(res.status).toBe(201);
      expect(mockStorage.pokeMember).toHaveBeenCalledWith(7, HTTP_TEST_USER, "friend");
    });
  });
});
