import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  leagues,
  leagueMembers,
  weeks,
  games,
  parlays,
  parlayLegs,
} from "@shared/schema";
import { setupTestDatabase, skipIfNoDb } from "./helpers/test-db";

describe("DatabaseStorage integration", () => {
  setupTestDatabase();

  test("createParlay is transactional: invalid leg gameId rolls back entire write", async ({
    skip,
  }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const userId = "test-user-parlay";
    await db.insert(users).values({ id: userId, email: "parlaytest@example.com" });

    const [week] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 1, label: "Week 1" })
      .returning();

    const [league] = await db
      .insert(leagues)
      .values({ name: "L", inviteCode: "PARLAY1" })
      .returning();

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId,
      role: "admin",
    });

    const [game] = await db
      .insert(games)
      .values({
        weekId: week.id,
        homeTeam: "A",
        awayTeam: "B",
        gameTime: new Date(),
      })
      .returning();

    await expect(
      storage.createParlay(
        userId,
        { leagueId: league.id, weekId: week.id },
        [
          {
            gameId: game.id,
            betType: "spread",
            pick: "home",
            line: "-3",
          },
          {
            gameId: 999_999,
            betType: "spread",
            pick: "away",
            line: "+3",
          },
        ],
      ),
    ).rejects.toThrow();

    const rows = await db.select().from(parlays).where(eq(parlays.userId, userId));
    expect(rows.length).toBe(0);
  });

  test("createParlay replaces legs for same user/league/week", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const userId = "test-user-parlay-2";
    await db.insert(users).values({ id: userId, email: "parlaytest2@example.com" });

    const [week] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 2, label: "Week 2" })
      .returning();

    const [league] = await db
      .insert(leagues)
      .values({ name: "L2", inviteCode: "PARLAY2" })
      .returning();

    await db.insert(leagueMembers).values({
      leagueId: league.id,
      userId,
      role: "admin",
    });

    const [game] = await db
      .insert(games)
      .values({
        weekId: week.id,
        homeTeam: "C",
        awayTeam: "D",
        gameTime: new Date(),
      })
      .returning();

    await storage.createParlay(userId, { leagueId: league.id, weekId: week.id }, [
      { gameId: game.id, betType: "spread", pick: "home", line: "-1" },
    ]);

    await storage.createParlay(userId, { leagueId: league.id, weekId: week.id }, [
      { gameId: game.id, betType: "moneyline", pick: "away", line: null },
    ]);

    const [parlay] = await db.select().from(parlays).where(eq(parlays.userId, userId));
    expect(parlay).toBeDefined();

    const legs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, parlay!.id));

    expect(legs.length).toBe(1);
    expect(legs[0]!.betType).toBe("moneyline");
  });

  test("rollupLeagueParlayStatuses: a single loss makes the whole parlay a loss, but a push alone is still a win", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const userId = "test-user-rollup";
    await db.insert(users).values({ id: userId, email: "rolluptest@example.com" });

    // A second user is needed for the second parlay below — parlays are unique
    // on (user_id, league_id, week_id), so two parlays in the same league/week
    // can't share a user.
    const userId2 = "test-user-rollup-2";
    await db.insert(users).values({ id: userId2, email: "rolluptest2@example.com" });

    const [week] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 3, label: "Week 3" })
      .returning();

    const [league] = await db
      .insert(leagues)
      .values({ name: "L3", inviteCode: "ROLLUP1" })
      .returning();

    await db.insert(leagueMembers).values({ leagueId: league.id, userId, role: "admin" });
    await db.insert(leagueMembers).values({ leagueId: league.id, userId: userId2, role: "member" });

    const [gameA] = await db
      .insert(games)
      .values({ weekId: week.id, homeTeam: "A", awayTeam: "B", gameTime: new Date() })
      .returning();
    const [gameB] = await db
      .insert(games)
      .values({ weekId: week.id, homeTeam: "C", awayTeam: "D", gameTime: new Date() })
      .returning();

    // Parlay 1: win + push, zero losses — should roll up to 'win'.
    const [winPushParlay] = await db
      .insert(parlays)
      .values({ userId, leagueId: league.id, weekId: week.id, status: "approved" })
      .returning();
    await db.insert(parlayLegs).values([
      { parlayId: winPushParlay.id, userId, gameId: gameA.id, betType: "spread", pick: "home", result: "win" },
      { parlayId: winPushParlay.id, userId, gameId: gameB.id, betType: "spread", pick: "away", result: "push" },
    ]);

    // Parlay 2: win + loss — should roll up to 'loss'. Uses userId2 since a parlay
    // is unique per (user_id, league_id, week_id).
    const [lossParlay] = await db
      .insert(parlays)
      .values({ userId: userId2, leagueId: league.id, weekId: week.id, status: "approved" })
      .returning();
    await db.insert(parlayLegs).values([
      { parlayId: lossParlay.id, userId: userId2, gameId: gameA.id, betType: "moneyline", pick: "home", result: "win" },
      { parlayId: lossParlay.id, userId: userId2, gameId: gameB.id, betType: "moneyline", pick: "away", result: "loss" },
    ]);

    const result = await storage.rollupLeagueParlayStatuses(league.id);
    expect(result.updated).toBe(2);

    const [updatedWinPush] = await db.select().from(parlays).where(eq(parlays.id, winPushParlay.id));
    const [updatedLoss] = await db.select().from(parlays).where(eq(parlays.id, lossParlay.id));
    expect(updatedWinPush!.status).toBe("win");
    expect(updatedLoss!.status).toBe("loss");

    // Backfill: recomputeTerminal should be able to flip an already-'push' parlay to 'win'
    // under the new rule (no losses = win), but leave already-'loss' parlays alone.
    await db.update(parlays).set({ status: "push" }).where(eq(parlays.id, winPushParlay.id));
    const backfill = await storage.rollupLeagueParlayStatuses(league.id, true);
    expect(backfill.updated).toBe(2);
    const [recomputed] = await db.select().from(parlays).where(eq(parlays.id, winPushParlay.id));
    expect(recomputed!.status).toBe("win");
  });
});
