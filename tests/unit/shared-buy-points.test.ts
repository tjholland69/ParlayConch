import { describe, expect, test } from "vitest";
import { adjustedOdds, impliedPointsMoved, lineForBet } from "../../shared/buyPoints";

const game = { spread: "-3.5", spreadOdds: "-110", overUnder: "47.5", overOdds: "-110", underOdds: "-105", moneylineHome: "-165", moneylineAway: "+145" };

describe("shared/buyPoints", () => {
  test("buying points costs 10 cents a half point; selling them pays the same", () => {
    expect(adjustedOdds(-110, 0)).toBe(-110);
    expect(adjustedOdds(-110, 1)).toBe(-130);
    expect(adjustedOdds(-110, -0.5)).toBe(100);
    expect(adjustedOdds(-110, -1)).toBe(110);
    // Across the -100/+100 gap in both directions.
    expect(adjustedOdds(105, 0.5)).toBe(-105);
    expect(adjustedOdds(-105, -0.5)).toBe(105);
    expect(adjustedOdds(150, 1)).toBe(130);
  });

  test("an alternate line moves the number and the price together", () => {
    expect(lineForBet(game, "spread", "home")).toBe("-3.5 (-110)");
    expect(lineForBet(game, "spread", "home", 1)).toBe("-2.5 (-130)");
    expect(lineForBet(game, "spread", "home", -3)).toBe("-6.5 (+150)");
    expect(lineForBet(game, "spread", "away", 1)).toBe("+4.5 (-130)");
    expect(lineForBet(game, "over", "over", 1)).toBe("O46.5 (-130)");
    expect(lineForBet(game, "under", "under", -1)).toBe("U46.5 (+115)");
    expect(lineForBet(game, "moneyline", "home", 2)).toBe("-165");
  });

  test("the points moved can be read back off a stored line, totals included", () => {
    for (const [betType, pick] of [["spread", "home"], ["spread", "away"], ["over", "over"], ["under", "under"]]) {
      for (const moved of [-6, -1.5, 0, 0.5, 6]) {
        expect(impliedPointsMoved(betType, pick, game, lineForBet(game, betType, pick, moved))).toBe(moved);
      }
    }
    expect(impliedPointsMoved("moneyline", "home", game, "-165")).toBe(0);
  });
});
