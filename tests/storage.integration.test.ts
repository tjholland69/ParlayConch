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
});
