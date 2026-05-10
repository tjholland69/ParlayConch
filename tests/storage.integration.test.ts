import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import { fileURLToPath } from "url";
import { eq } from "drizzle-orm";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import {
  users,
  leagues,
  leagueMembers,
  weeks,
  games,
  parlays,
  parlayLegs,
} from "@shared/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.join(__dirname, "..", "migrations");

describe("DatabaseStorage integration", () => {
  let container: StartedPostgreSqlContainer | undefined;
  let dbReady = false;

  beforeAll(async () => {
    if (process.env.CI === "true") {
      if (!process.env.DATABASE_URL) {
        throw new Error("CI requires DATABASE_URL for integration tests");
      }
      const { db } = await import("../server/db");
      await migrate(db, { migrationsFolder });
      dbReady = true;
      return;
    }

    try {
      container = await new PostgreSqlContainer("postgres:16-alpine").start();
    } catch {
      console.warn(
        "[integration tests] No container runtime (start Docker) or use CI with DATABASE_URL — skipping.",
      );
      return;
    }

    process.env.DATABASE_URL = container.getConnectionUri();
    const { db } = await import("../server/db");
    await migrate(db, { migrationsFolder });
    dbReady = true;
  }, 180_000);

  afterAll(async () => {
    if (!dbReady) return;
    const { pool } = await import("../server/db");
    await pool.end();
    if (container) await container.stop();
  });

  test("createParlay is transactional: invalid leg gameId rolls back entire write", async ({
    skip,
  }) => {
    skip(!dbReady, "database not available");
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
    skip(!dbReady, "database not available");
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
