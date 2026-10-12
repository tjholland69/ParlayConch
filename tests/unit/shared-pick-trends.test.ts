import { describe, expect, test } from "vitest";
import { buildPickTrends, legAngles, positionTrendGroup, trendSentence, type TrendLeg } from "@shared/pickTrends";

const prop = (count: number, result: string, extra: Partial<TrendLeg> = {}): TrendLeg[] =>
  Array.from({ length: count }, () => ({
    userId: "me", betType: "player_prop", pick: "over", line: "64.5", result,
    playerName: "Derrick Henry", propType: "rush_yards", position: "RB", ...extra,
  }));

describe("pick trends", () => {
  test("positions fold into the groups people talk about", () => {
    expect(positionTrendGroup("FB")).toEqual({ key: "RB", label: "running backs" });
    expect(positionTrendGroup(" te ")?.label).toBe("tight ends");
    expect(positionTrendGroup("OLB")?.label).toBe("defenders");
    expect(positionTrendGroup("LS")).toBeNull();
    expect(positionTrendGroup(null)).toBeNull();
  });

  test("a prop is filed under its position, stat, side and player", () => {
    expect(legAngles(prop(1, "win")[0]).map((a) => a.key)).toEqual([
      "type:player_prop", "position:RB", "stat:rush_yards", "prop-side:over", "player:derrick henry",
    ]);
    // No position on file: still counted everywhere else.
    expect(legAngles(prop(1, "win", { position: null })[0]).map((a) => a.key)).not.toContain("position:RB");
    // A touchdown prop is bet "yes": it has no over/under side.
    expect(legAngles(prop(1, "win", { pick: "yes", propType: "anytime_td" })[0]).map((a) => a.key)).not.toContain("prop-side:yes");
  });

  test("a game bet is filed under its kind, its type and the team backed", () => {
    const leg: TrendLeg = { userId: "me", betType: "spread", pick: "away", line: "+3.5 (-110)", result: "win", homeTeam: "Jets", awayTeam: "Bills" };
    expect(legAngles(leg).map((a) => a.key)).toEqual(["kind:spread:underdogs", "type:spread", "team:Bills"]);
  });

  test("\"You're 7-2 betting running backs\"", () => {
    const history = [...prop(7, "win"), ...prop(2, "loss")];
    const { you } = buildPickTrends({ userId: "me", history });
    const backs = you.find((t) => t.key === "position:RB")!;
    expect(backs).toMatchObject({ wins: 7, losses: 2, hot: true });
    expect(trendSentence(backs, "you")).toBe("You're 7-2 betting running backs");
    expect(trendSentence(backs, "league")).toBe("The league is 7-2 betting running backs");
  });

  test("cold trends show too; even or thin records, and pushes, don't", () => {
    const history = [
      ...prop(1, "win", { betType: "under", pick: "under", line: "U44.5 (-110)", playerName: null, propType: null, position: null }),
      ...prop(6, "loss", { betType: "under", pick: "under", line: "U44.5 (-110)", playerName: null, propType: null, position: null }),
      ...prop(2, "win", { position: "QB", playerName: "A", propType: "pass_yards" }),
      ...prop(2, "loss", { position: "QB", playerName: "A", propType: "pass_yards" }),
      ...prop(9, "push", { position: "K", playerName: "B", propType: "fg_made" }),
    ];
    const { you } = buildPickTrends({ userId: "me", history });
    expect(you.find((t) => t.key === "kind:under")).toMatchObject({ wins: 1, losses: 6, hot: false });
    expect(you.some((t) => t.key === "position:QB")).toBe(false);
    expect(you.some((t) => t.key === "position:K")).toBe(false);
  });

  test("the member's trends are theirs alone; the league's include everyone", () => {
    const history = [...prop(3, "win"), ...prop(4, "win", { userId: "other", position: "WR", playerName: "C", propType: "rec_yards" })];
    const { you, league } = buildPickTrends({ userId: "me", history });
    expect(you.some((t) => t.key === "position:WR")).toBe(false);
    expect(league.find((t) => t.key === "position:WR")).toMatchObject({ wins: 4, losses: 0 });
    expect(league.find((t) => t.key === "type:player_prop")).toMatchObject({ wins: 7, losses: 0 });
  });

  test("the strongest lean comes first and the list is capped", () => {
    const history = [...prop(10, "win"), ...prop(3, "win", { betType: "over", pick: "over", line: "O44.5 (-110)", playerName: null, propType: null, position: null })];
    const { you } = buildPickTrends({ userId: "me", history, limit: 3 });
    expect(you).toHaveLength(3);
    expect(you.every((t) => t.wins === 10)).toBe(true);
  });
});
