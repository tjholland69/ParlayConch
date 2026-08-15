import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  leagues,
  leagueMembers,
  weeks,
  games,
  importBatches,
  parlayLegs,
} from "@shared/schema";
import { setupTestDatabase, skipIfNoDb } from "./helpers/test-db";
import { expectDbNull, expectNormalizedGameJoin } from "./helpers/null-assertions";
import {
  PARLAY_UPDATE_NULL_SCENARIOS,
  STORAGE_NULL_INTEGRITY_SCENARIOS,
} from "./rules/storage-null-integrity.rules";

describe("storage null integrity", () => {
  setupTestDatabase();

  let nextWeekNumber = 1;

  async function seedImportContext(userId: string) {
    const { db } = await import("../../server/db");
    await db.insert(users).values({ id: userId, email: `${userId}@example.com` });

    const weekNumber = nextWeekNumber++;
    const [week] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber, label: `Week ${weekNumber}` })
      .returning();

    const [league] = await db
      .insert(leagues)
      .values({
        name: "Null Test League",
        inviteCode: userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "NULLTEST",
      })
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
        homeTeam: "KC",
        awayTeam: "BAL",
        gameTime: new Date(),
      })
      .returning();

    const [batch] = await db
      .insert(importBatches)
      .values({
        leagueId: league.id,
        uploadedBy: userId,
        originalFilename: "null-test.csv",
      })
      .returning();

    return { db, week, league, game, batch };
  }

  for (const scenario of STORAGE_NULL_INTEGRITY_SCENARIOS) {
    test(`${scenario.id}: ${scenario.description}`, async ({ skip }) => {
      skipIfNoDb(skip);
      const { storage } = await import("../../server/storage");
      const userId = `null-${scenario.id}`;
      const { week, league, game, batch } = await seedImportContext(userId);

      const legs = scenario.legs.map((leg) => ({
        ...leg,
        gameId: leg.gameId === 1 ? game.id : leg.gameId,
      }));

      const parlay = await storage.createImportedParlay(
        userId,
        { leagueId: league.id, weekId: week.id },
        legs,
        batch.id,
        "approved",
      );

      const { db } = await import("../../server/db");
      const [storedLeg] = await db
        .select()
        .from(parlayLegs)
        .where(eq(parlayLegs.parlayId, parlay.id));

      expect(storedLeg).toBeDefined();
      scenario.assertLeg(storedLeg!);
    });
  }

  test("getUserParlayForWeek normalizes missing game join to null", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../../server/storage");
    const userId = "null-join-normalize";
    const { week, league, batch } = await seedImportContext(userId);

    await storage.createImportedParlay(
      userId,
      { leagueId: league.id, weekId: week.id },
      [
        {
          gameId: null,
          betType: "player_prop",
          pick: "over",
          line: "50.5",
          playerName: "Test Player",
          propType: "rec_yards",
        },
      ],
      batch.id,
      "approved",
    );

    const parlay = await storage.getUserParlayForWeek(userId, league.id, week.id);
    expect(parlay).not.toBeNull();
    expect(parlay!.legs.length).toBe(1);
    expectNormalizedGameJoin(parlay!.legs[0]!.game);
    expectDbNull(parlay!.legs[0]!.game, null, "game");
  });

  test("createParlay resubmit clears approval null fields", async ({ skip }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../../server/storage");
    const userId = "null-resubmit";
    const { week, league, game } = await seedImportContext(userId);

    const first = await storage.createParlay(
      userId,
      { leagueId: league.id, weekId: week.id },
      [{ parlayId: 0, gameId: game.id, betType: "spread", pick: "home", line: "-3" }],
    );

    await storage.approveParlay(first.id, userId);

    const second = await storage.createParlay(
      userId,
      { leagueId: league.id, weekId: week.id },
      [{ parlayId: 0, gameId: game.id, betType: "spread", pick: "away", line: "+3" }],
    );

    expectDbNull(second.approvedBy, null, "approvedBy");
    expectDbNull(second.approvedAt, null, "approvedAt");
    expect(second.status).toBe("pending");
  });

  for (const scenario of PARLAY_UPDATE_NULL_SCENARIOS) {
    test(`${scenario.id}: ${scenario.description}`, async ({ skip }) => {
      skipIfNoDb(skip);
      const { storage } = await import("../../server/storage");
      const { db } = await import("../../server/db");
      const userId = `update-${scenario.id}`;
      const { week, league, game } = await seedImportContext(userId);

      const parlay = await storage.createParlay(
        userId,
        { leagueId: league.id, weekId: week.id },
        [{ parlayId: 0, gameId: game.id, betType: "spread", pick: "home", line: "-3" }],
      );

      const [leg] = await db
        .select()
        .from(parlayLegs)
        .where(eq(parlayLegs.parlayId, parlay.id));

      if (scenario.initialResult !== null) {
        await db
          .update(parlayLegs)
          .set({ result: scenario.initialResult })
          .where(eq(parlayLegs.id, leg!.id));
      }

      await storage.updateParlay(parlay.id, {
        legs: [{ id: leg!.id, result: scenario.updateResult }],
      });

      const [updated] = await db
        .select()
        .from(parlayLegs)
        .where(eq(parlayLegs.id, leg!.id));

      expectDbNull(updated!.result, scenario.expectedResult, "result");
    });
  }

  test("FK ON DELETE SET NULL: deleting game nulls leg gameId without corrupting other fields", async ({
    skip,
  }) => {
    skipIfNoDb(skip);
    const { storage } = await import("../../server/storage");
    const { db } = await import("../../server/db");
    const userId = "null-fk-cascade";
    const { week, league, game, batch } = await seedImportContext(userId);

    const parlay = await storage.createImportedParlay(
      userId,
      { leagueId: league.id, weekId: week.id },
      [
        {
          gameId: game.id,
          betType: "spread",
          pick: "home",
          line: "-3",
          odds: "-110",
          result: null,
        },
      ],
      batch.id,
      "approved",
    );

    await db.delete(games).where(eq(games.id, game.id));

    const [leg] = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, parlay.id));

    expectDbNull(leg!.gameId, null, "gameId");
    expect(leg!.line).toBe("-3");
    expect(leg!.odds).toBe("-110");
    expect(leg!.betType).toBe("spread");
  });
});
