import { describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@shared/db-schema";
import { setupTestDatabase, skipIfNoDb } from "./helpers/test-db";
import { expectJsonbIntact } from "./helpers/null-assertions";

describe("user settings DB integrity", () => {
  setupTestDatabase();

  test("updateUserSettings deep-merges notificationPreferences without data loss", async ({
    skip,
  }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");

    const userId = "settings-merge-user";
    await db.insert(users).values({
      id: userId,
      email: "settings-merge@example.com",
      settings: {
        displayName: "Original",
        notificationPreferences: { email: true, sms: true, push: false },
        theme: "dark",
      },
    });

    await storage.updateUserSettings(userId, {
      notificationPreferences: { email: false },
    });

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    const settings = row!.settings as Record<string, unknown>;

    expect(settings.displayName).toBe("Original");
    expect(settings.theme).toBe("dark");
    expectJsonbIntact(settings, ["displayName", "theme", "notificationPreferences"]);
    expect(settings.notificationPreferences).toEqual({
      email: false,
      sms: true,
      push: false,
    });
  });

  test("updateParlayLeg stores empty line as SQL null", async ({ skip }) => {
    skipIfNoDb(skip);
    const { db } = await import("../server/db");
    const { storage } = await import("../server/storage");
    const { weeks, leagues, leagueMembers, games, parlayLegs } = await import("@shared/db-schema");

    const userId = "leg-patch-user";
    await db.insert(users).values({ id: userId, email: "legpatch@example.com" });

    const [week] = await db
      .insert(weeks)
      .values({ season: 2025, weekNumber: 11, label: "Week 11" })
      .returning();
    const [league] = await db
      .insert(leagues)
      .values({ name: "Patch League", inviteCode: "PATCHLEAGUE11" })
      .returning();
    await db.insert(leagueMembers).values({ leagueId: league.id, userId, role: "admin" });
    const [game] = await db
      .insert(games)
      .values({ weekId: week.id, homeTeam: "X", awayTeam: "Y", gameTime: new Date(Date.now() + 3600_000) })
      .returning();

    const parlay = await storage.createParlay(
      userId,
      { leagueId: league.id, weekId: week.id },
      [{ parlayId: 0, gameId: game.id, betType: "spread", pick: "home", line: "-3" }],
    );

    const [leg] = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, parlay.id));

    await storage.updateParlayLeg(leg!.id, { line: "", notes: "cleared line" });

    const [updated] = await db.select().from(parlayLegs).where(eq(parlayLegs.id, leg!.id));
    expect(updated!.line).toBeNull();
    expect(updated!.notes).toBe("cleared line");
  });
});
