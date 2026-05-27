import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users, leagues, leagueMembers, weeks, parlays } from "@shared/schema";
import { countParlayOutcomes } from "../shared/statsAggregation";
import { setupTestDatabase, skipIfNoDb } from "./helpers/test-db";

describe("global stats aggregation", () => {
  setupTestDatabase();

  test("getStats excludes null and pending parlays like countParlayOutcomes", async ({
    skip,
  }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const userId = "global-stats-user";
    await db.insert(users).values({ id: userId, email: "stats@example.com", isDemo: false });

    const [week1] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 20, label: "Week 20" })
      .returning();
    const [week2] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 21, label: "Week 21" })
      .returning();
    const [week3] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 22, label: "Week 22" })
      .returning();
    const [week4] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 23, label: "Week 23" })
      .returning();
    const [week5] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 24, label: "Week 24" })
      .returning();
    const [league] = await db
      .insert(leagues)
      .values({ name: "Stats League", inviteCode: "STATSLEAGUE20" })
      .returning();
    await db.insert(leagueMembers).values({ leagueId: league.id, userId, role: "admin" });

    await db.insert(parlays).values([
      { userId, leagueId: league.id, weekId: week1.id, status: "win" },
      { userId, leagueId: league.id, weekId: week2.id, status: "loss" },
      { userId, leagueId: league.id, weekId: week3.id, status: "push" },
      { userId, leagueId: league.id, weekId: week4.id, status: "pending" },
      { userId, leagueId: league.id, weekId: week5.id, status: null },
    ]);

    const allParlays = await db.select().from(parlays).where(eq(parlays.userId, userId));
    const expected = countParlayOutcomes(allParlays);

    const globalStats = await storage.getStats();
    const userStat = globalStats.find((s) => s.userId === userId);
    expect(userStat).toBeDefined();
    expect(userStat!.wins).toBe(expected.wins);
    expect(userStat!.losses).toBe(expected.losses);
    expect(userStat!.pushes).toBe(expected.pushes);

    const leagueStats = await storage.getLeagueStats(league.id);
    const leagueUserStat = leagueStats.find((s) => s.userId === userId);
    expect(leagueUserStat!.wins).toBe(expected.wins);
    expect(leagueUserStat!.losses).toBe(expected.losses);
    expect(leagueUserStat!.pushes).toBe(expected.pushes);
  });
});
