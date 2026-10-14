import { describe, expect, it } from "vitest";
import { calculateLegResult, deriveApproximateLine, lineNumber } from "@shared/legGrading";

const game = (homeScore: number, awayScore: number, extra: Record<string, string | null> = {}) => ({ homeScore, awayScore, ...extra });

describe("lineNumber", () => {
  it.each([
    ["U54.5 (-105)", 54.5],
    ["O47.5 (-110)", 47.5],
    ["o47", 47],
    ["u 41.5", 41.5],
    ["-3.5 (-110)", -3.5],
    ["+3", 3],
    ["54½", 54.5],
    ["PK (-110)", 0],
    ["44.5", 44.5],
  ])("reads %s as %s", (line, expected) => {
    expect(lineNumber(line)).toBe(expected);
  });

  it.each([null, undefined, "", "TBD", "(-110)"])("has no number in %s", (line) => {
    expect(lineNumber(line)).toBeNull();
  });
});

describe("calculateLegResult", () => {
  it("grades a total against a line stored with its side letter and price", () => {
    // Bills @ Rams 34-37: 71 points against an under of 54.5.
    expect(calculateLegResult("under", "under", game(37, 34), "U54.5 (-105)")).toBe("loss");
    expect(calculateLegResult("over", "over", game(37, 34), "O54.5 (-105)")).toBe("win");
    expect(calculateLegResult("under", "under", game(20, 17), "U54.5 (-105)")).toBe("win");
  });

  it("only pushes a total that lands exactly on the line", () => {
    expect(calculateLegResult("over", "over", game(27, 20), "O47 (-110)")).toBe("push");
    expect(calculateLegResult("under", "under", game(27, 20), "u47")).toBe("push");
  });

  it("falls back to the game's total when the leg's line has no number", () => {
    expect(calculateLegResult("under", "under", game(37, 34, { overUnder: "54.5" }), "TBD")).toBe("loss");
    expect(calculateLegResult("over", "over", game(37, 34, { overUnder: "54.5" }), null)).toBe("win");
  });

  it("leaves a total or spread ungraded when no line can be read", () => {
    expect(calculateLegResult("under", "under", game(37, 34), "TBD")).toBeNull();
    expect(calculateLegResult("spread", "home", game(37, 34), null)).toBeNull();
  });

  it("grades a spread from the picked team's side", () => {
    expect(calculateLegResult("spread", "away", game(37, 34), "+3.5 (-110)")).toBe("win");
    expect(calculateLegResult("spread", "home", game(37, 34), "-3.5 (-110)")).toBe("loss");
    expect(calculateLegResult("spread", "home", game(37, 34), "-3 (-110)")).toBe("push");
    // game.spread is the home team's; an away pick takes the other side.
    expect(calculateLegResult("spread", "away", game(37, 34, { spread: "-3.5" }))).toBe("win");
    expect(calculateLegResult("spread", "home", game(37, 34, { spread: "-3.5" }))).toBe("loss");
  });

  it("grades a moneyline on the score alone", () => {
    expect(calculateLegResult("moneyline", "home", game(37, 34), "-150")).toBe("win");
    expect(calculateLegResult("moneyline", "away", game(37, 34))).toBe("loss");
    expect(calculateLegResult("moneyline", "home", game(20, 20))).toBe("push");
  });

  it("waits for a score", () => {
    expect(calculateLegResult("under", "under", { homeScore: null, awayScore: null }, "U54.5")).toBeNull();
  });
});

describe("deriveApproximateLine", () => {
  it("puts the game's spread on the picked team's side", () => {
    expect(deriveApproximateLine("spread", "home", { spread: "-3.5" })).toBe("-3.5");
    expect(deriveApproximateLine("spread", "away", { spread: "-3.5" })).toBe("3.5");
  });
});
