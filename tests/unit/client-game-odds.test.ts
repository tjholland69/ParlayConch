import { describe, expect, test } from "vitest";
import { awaySpread, getLineForBet, spreadLabels } from "../../client/src/lib/gameOdds";
import type { Game } from "../../shared/schema";

const game = (spread: string | null) => ({ spread, spreadOdds: "-110" }) as Game;

describe("client/lib/gameOdds", () => {
  test("awaySpread flips the home line by value, whatever sign it's written with", () => {
    expect(awaySpread("-3.5")).toBe("3.5");
    expect(awaySpread("+3.5")).toBe("-3.5");
    expect(awaySpread("3.5")).toBe("-3.5");
    expect(awaySpread("0")).toBe("0");
    expect(awaySpread(null)).toBe("");
    expect(awaySpread("PK")).toBe("");
  });

  test("spreadLabels never doubles the plus sign for a home underdog", () => {
    expect(spreadLabels(game("+3.5"))).toEqual({ away: "-3.5", home: "+3.5" });
    expect(spreadLabels(game("-7"))).toEqual({ away: "+7", home: "-7" });
    expect(spreadLabels(game("2.5"))).toEqual({ away: "-2.5", home: "+2.5" });
    expect(spreadLabels(game(null))).toEqual({ away: null, home: null });
  });

  test("getLineForBet stores the picked side's line", () => {
    expect(getLineForBet(game("+3.5"), "spread", "away")).toBe("-3.5 (-110)");
    expect(getLineForBet(game("+3.5"), "spread", "home")).toBe("+3.5 (-110)");
    expect(getLineForBet(game(null), "spread", "home")).toBeUndefined();
  });
});
