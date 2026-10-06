import { describe, expect, test } from "vitest";
import { hasGameStarted, isParlayInProgress, legTally } from "../../shared/parlayProgress";

const now = new Date("2026-10-04T18:00:00Z");
const past = { gameTime: "2026-10-04T17:00:00Z", isFinished: false };
const future = { gameTime: "2026-10-04T20:25:00Z", isFinished: false };

describe("shared/parlayProgress", () => {
  test("a game has started once kickoff passes or it's final", () => {
    expect(hasGameStarted(past, now)).toBe(true);
    expect(hasGameStarted(future, now)).toBe(false);
    expect(hasGameStarted({ gameTime: null, isFinished: true }, now)).toBe(true);
    expect(hasGameStarted(null, now)).toBe(false);
  });

  test("only an open parlay with a started game is in progress", () => {
    const legs = [{ game: future }, { game: past }];
    expect(isParlayInProgress({ status: "approved", legs }, now)).toBe(true);
    expect(isParlayInProgress({ status: "approved", legs: [{ game: future }] }, now)).toBe(false);
    expect(isParlayInProgress({ status: "loss", legs }, now)).toBe(false);
    expect(isParlayInProgress({ status: "draft", legs }, now)).toBe(false);
  });

  test("the tally keeps a pending count beside wins/settled", () => {
    expect(legTally([{ result: "win" }, { result: "loss" }, { result: null }, {}]).label).toBe("1/2 (50%) (2 Pending)");
    expect(legTally([{ result: "win" }, { result: "push" }]).label).toBe("1/2 (50%)");
    expect(legTally([{ result: null }]).label).toBe("0/0 (1 Pending)");
  });
});
