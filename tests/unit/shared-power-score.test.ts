import { describe, expect, test } from "vitest";
import {
  averagePowerScore,
  computeBar,
  legPowerContribution,
  oddsFactor,
  oddsFactorFromRaw,
  parseAmericanOdds,
  participationRate,
  withBar,
} from "../../shared/powerScore";

describe("shared/powerScore", () => {
  test("parseAmericanOdds handles signs and junk", () => {
    expect(parseAmericanOdds("+100")).toBe(100);
    expect(parseAmericanOdds("-525")).toBe(-525);
    expect(parseAmericanOdds("150")).toBe(150);
    expect(parseAmericanOdds(null)).toBeNull();
    expect(parseAmericanOdds("")).toBeNull();
  });

  test("oddsFactor: even money is 1 on both sides", () => {
    expect(oddsFactor(100)).toBe(1);
    expect(oddsFactor(-100)).toBe(1);
  });

  test("oddsFactor: longshots and chalk", () => {
    expect(oddsFactor(1000)).toBe(10);
    expect(oddsFactor(-525)).toBeCloseTo(100 / 525, 6);
  });

  test("oddsFactorFromRaw defaults missing to -110", () => {
    expect(oddsFactorFromRaw(null)).toBeCloseTo(100 / 110, 6);
    expect(oddsFactorFromRaw("+200")).toBe(2);
  });

  test("legPowerContribution: win/loss/exclude", () => {
    expect(legPowerContribution("win", "+1000")).toBe(10);
    expect(legPowerContribution("loss", "+1000")).toBe(0);
    expect(legPowerContribution("push", "+1000")).toBeNull();
    expect(legPowerContribution(null, "-110")).toBeNull();
  });

  test("averagePowerScore averages decided leg scores", () => {
    // one win at +100, one loss → (1 + 0) / 2 = 0.5
    expect(averagePowerScore([1, 0])).toBe(0.5);
    expect(averagePowerScore([])).toBe(0);
  });

  test("participationRate clamps to 0–1", () => {
    expect(participationRate(1, 2)).toBe(0.5);
    expect(participationRate(0, 0)).toBe(0);
    expect(participationRate(5, 4)).toBe(1);
  });

  test("BAR is user product minus league mean product", () => {
    const bar = computeBar(0.8, 1, 0.5, 0.5);
    expect(bar).toBeCloseTo(0.8 - 0.25, 6);
  });

  test("withBar uses unweighted cohort means", () => {
    const rows = withBar([
      { powerScore: 1, participationRate: 1 },
      { powerScore: 0, participationRate: 0 },
    ]);
    // means: PS=0.5, Part=0.5 → baseline 0.25
    expect(rows[0].bar).toBeCloseTo(1 - 0.25, 6);
    expect(rows[1].bar).toBeCloseTo(0 - 0.25, 6);
  });
});
