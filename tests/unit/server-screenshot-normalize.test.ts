import { describe, expect, test } from "vitest";
import {
  normalizeBetType,
  normalizePick,
  normalizePropType,
  normalizeResult,
} from "../../server/services/screenshotParser";

describe("server/services/screenshotParser normalization helpers", () => {
  describe("normalizeBetType", () => {
    test("defaults null or blank to spread", () => {
      expect(normalizeBetType(null)).toBe("spread");
      expect(normalizeBetType("unknown")).toBe("spread");
    });

    test("detects aliases", () => {
      expect(normalizeBetType("moneyline")).toBe("moneyline");
      expect(normalizeBetType("ml")).toBe("moneyline");
      expect(normalizeBetType("Game Total OVER")).toBe("over");
      expect(normalizeBetType("TOTAL UNDER")).toBe("under");
      expect(normalizeBetType("Player prop")).toBe("player_prop");
    });
  });

  describe("normalizePick", () => {
    test("defaults to home when missing", () => {
      expect(normalizePick(null)).toBe("home");
      expect(normalizePick("")).toBe("home");
      expect(normalizePick("anything else")).toBe("home");
    });

    test("handles canonical pick tokens", () => {
      expect(normalizePick("AWAY")).toBe("away");
      expect(normalizePick("OVER")).toBe("over");
      expect(normalizePick("UNDER")).toBe("under");
      expect(normalizePick("Yes")).toBe("yes");
      expect(normalizePick("NO")).toBe("no");
    });
  });

  describe("normalizeResult", () => {
    test("returns null for unrecognized values", () => {
      expect(normalizeResult(null)).toBeNull();
      expect(normalizeResult("void")).toBeNull();
    });

    test("maps common settlement strings", () => {
      expect(normalizeResult("WIN")).toBe("win");
      expect(normalizeResult("lost")).toBe("loss");
      expect(normalizeResult("tie")).toBe("push");
    });
  });

  describe("normalizePropType", () => {
    test("maps common label variants to snake_case codes", () => {
      expect(normalizePropType("Receiving Yards")).toBe("rec_yards");
      expect(normalizePropType("rush yards")).toBe("rush_yards");
      expect(normalizePropType("PASSING TDs")).toBe("pass_tds");
      expect(normalizePropType("kicking pts")).toBe("kicking_pts");
    });

    test("passes through unknown labels unchanged", () => {
      expect(normalizePropType("custom prop xyz")).toBe("custom prop xyz");
      expect(normalizePropType(null)).toBeNull();
    });
  });
});
