import { describe, expect, test } from "vitest";
import { stepLine } from "../../shared/propLines";

describe("shared/propLines stepLine", () => {
  test("moves half a point at a time", () => {
    expect(stepLine("74.5", 1, "rec_yards")).toBe("75");
    expect(stepLine("75", -1, "rec_yards")).toBe("74.5");
  });

  test("an empty box starts at the prop's usual line", () => {
    expect(stepLine("", 1, "pass_yards")).toBe("224.5");
    expect(stepLine("abc", -1, null)).toBe("9.5");
  });

  test("an off-grid value snaps to the next half point in that direction", () => {
    expect(stepLine("74.3", 1, "rec_yards")).toBe("74.5");
    expect(stepLine("74.3", -1, "rec_yards")).toBe("74");
  });

  test("stays inside the prop's range", () => {
    expect(stepLine("0.5", -1, "rush_tds")).toBe("0.5");
    expect(stepLine("4.5", 1, "rush_tds")).toBe("4.5");
  });
});
