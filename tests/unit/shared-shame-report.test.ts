import { describe, expect, test } from "vitest";
import { buildShameReport, shameReportText } from "../../shared/shameReport";

const game = { homeTeam: "Chiefs", awayTeam: "Bills", spread: "-3.5", overUnder: "47.5" };
const leg = (id: number, owner: string, result: string | null, extra: Record<string, unknown> = {}) => ({
  id, owner, result, betType: "spread", pick: "home", line: "-3.5", propType: null, game, ...extra,
});

describe("shared/shameReport", () => {
  const legs = [
    leg(1, "Zed", "loss"),
    leg(2, "Amy", "win"),
    leg(3, "Bo", "loss", { betType: "player_prop", pick: "over", line: "74.5", propType: "rush_yards", playerName: "Josh Allen" }),
    leg(4, "Cal", "loss", { betType: "over", pick: "over", line: "47.5" }),
  ];
  const build = (bustedLegId: number | null) =>
    buildShameReport({ legs, bustedLegId, nameOf: (l) => l.owner, weekLabel: "Week 5", loserLabel: "Parlay Loser" });

  test("leads with the parlay loser, then the other losing bets by name", () => {
    const report = build(4)!;
    expect(report.loserName).toBe("Cal");
    expect(report.loserPick).toBe("Over 47.5 (Total)");
    expect(report.losers.map((l) => l.name)).toEqual(["Cal", "Bo", "Zed"]);
    expect(report.losers.map((l) => l.isParlayLoser)).toEqual([true, false, false]);
    expect(report.losers[1].pick).toBe("Josh Allen (Rushing Over 74.5 Yds)");
  });

  test("winning legs are left out", () => {
    expect(build(1)!.losers.some((l) => l.name === "Amy")).toBe(false);
  });

  test("no report without a busted losing leg", () => {
    expect(build(null)).toBeNull();
    expect(build(2)).toBeNull();
  });

  test("text version lists the loser and every losing bet", () => {
    const text = shameReportText(build(1)!);
    expect(text).toContain("Week 5 Shame Report");
    expect(text).toContain("Parlay Loser: Zed (Chiefs (Spread -3.5))");
    expect(text).toContain("• Bo: Josh Allen (Rushing Over 74.5 Yds)");
  });
});
