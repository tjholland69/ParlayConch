import { describe, expect, test } from "vitest";
import {
  insertWeekSchema,
  insertGameSchema,
  insertLeagueSchema,
  insertParlayLegSchema,
} from "../../shared/db-schema";

describe("shared/schema insert Zod validators", () => {
  describe("insertWeekSchema", () => {
    test("parses minimal valid week payload", () => {
      expect(
        insertWeekSchema.parse({
          season: 2025,
          weekNumber: 3,
          label: "Week 3",
        }),
      ).toMatchObject({ season: 2025, weekNumber: 3, label: "Week 3" });
    });

    test("allows optional flags with defaults from DB layer omitted", () => {
      expect(
        insertWeekSchema.parse({
          season: 2025,
          weekNumber: 1,
          label: "W1",
          isActive: false,
        }).isActive,
      ).toBe(false);
    });
  });

  describe("insertGameSchema", () => {
    test("requires core fields and parses optional nullable scores", () => {
      const gameTime = new Date("2026-09-07T23:15:00.000Z");
      const parsed = insertGameSchema.parse({
        weekId: 12,
        homeTeam: "KC",
        awayTeam: "BAL",
        gameTime,
      });
      expect(parsed.homeTeam).toBe("KC");
      expect(parsed.awayTeam).toBe("BAL");
      expect(parsed.homeScore === null || parsed.homeScore === undefined).toBe(true);
    });
  });

  describe("insertLeagueSchema", () => {
    test("parses league name-only create body", () => {
      expect(insertLeagueSchema.parse({ name: "Sunday crew" }).name).toBe(
        "Sunday crew",
      );
    });
  });

  describe("insertParlayLegSchema", () => {
    test("accepts typical spread leg payload", () => {
      expect(
        insertParlayLegSchema.parse({
          parlayId: 1,
          gameId: 10,
          betType: "spread",
          pick: "home",
          line: "-3",
        }),
      ).toMatchObject({ betType: "spread", pick: "home", line: "-3" });
    });

    test("allows player prop nullable gameId", () => {
      expect(
        insertParlayLegSchema.parse({
          parlayId: 99,
          gameId: null,
          betType: "player_prop",
          pick: "over",
          line: "64.5",
          playerName: "Player",
          propType: "rec_yards",
        }).gameId,
      ).toBeNull();
    });

    test("omits inferred parlay linkage fields not in omit list only where schema allows", () => {
      expect(() =>
        insertParlayLegSchema.parse({
          betType: "moneyline",
          pick: "away",
        }),
      ).toThrow();
    });
  });
});
