import { describe, expect, test } from "vitest";
import { api, buildUrl } from "../../shared/routes";

describe("shared/routes", () => {
  describe("buildUrl", () => {
    test("substitutes colon-prefixed path params when present", () => {
      expect(
        buildUrl(api.leagues.get.path, { id: 42 }),
      ).toBe("/api/leagues/42");
      expect(
        buildUrl(api.parlays.forWeek.path, { leagueId: 1, weekId: 2 }),
      ).toBe("/api/leagues/1/weeks/2/parlays");
    });

    test("leaves unknown param keys untouched", () => {
      expect(buildUrl(api.weeks.list.path, { bogus: "x" })).toBe("/api/weeks");
    });

    test("handles paths without params when params omitted", () => {
      expect(buildUrl(api.weeks.list.path)).toBe("/api/weeks");
    });

    test("supports string and number param values", () => {
      expect(buildUrl(api.games.listByWeek.path, { id: "99" })).toBe(
        "/api/weeks/99/games",
      );
    });

    test("does not substitute when key lacks colon marker in template", () => {
      const path = "/api/static/item";
      expect(buildUrl(path, { item: "9" })).toBe(path);
    });
  });

  describe("api route shapes", () => {
    test("documents known HTTP verbs for core resources", () => {
      expect(api.weeks.list.method).toBe("GET");
      expect(api.leagues.create.method).toBe("POST");
      expect(api.parlays.create.method).toBe("POST");
      expect(api.parlays.approve.method).toBe("POST");
    });

    test("parlay endpoints use predictable path prefixes", () => {
      expect(api.parlays.create.path.startsWith("/api/parlays")).toBe(true);
      expect(api.parlays.myHistory.path).toBe("/api/parlays/my");
    });
  });
});
