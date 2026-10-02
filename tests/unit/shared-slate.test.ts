import { describe, expect, test } from "vitest";
import { getSlate, groupGamesBySlate } from "../../shared/slate";

describe("shared/slate", () => {
  test("getSlate buckets by Eastern kickoff time", () => {
    expect(getSlate("2025-09-07T13:30:00Z")).toBe("Morning"); // 9:30 AM ET
    expect(getSlate("2025-09-07T17:00:00Z")).toBe("Early Slate"); // 1:00 PM ET
    expect(getSlate("2025-09-07T20:25:00Z")).toBe("Afternoon Slate"); // 4:25 PM ET
    expect(getSlate("2025-09-08T00:20:00Z")).toBe("Primetime"); // 8:20 PM ET Sunday
  });

  test("groupGamesBySlate splits a week by day and slate, in kickoff order", () => {
    const games = [
      { id: 1, gameTime: "2025-09-07T20:25:00Z" }, // Sun afternoon
      { id: 2, gameTime: "2025-09-05T00:20:00Z" }, // Thu 8:20 PM ET
      { id: 3, gameTime: "2025-09-07T17:00:00Z" }, // Sun early
      { id: 4, gameTime: "2025-09-07T17:00:00Z" }, // Sun early
      { id: 5, gameTime: "2025-09-08T00:20:00Z" }, // Sun night (already Monday in UTC)
      { id: 6, gameTime: "2025-09-09T00:15:00Z" }, // Mon night
      { id: 7, gameTime: null },
    ];
    const groups = groupGamesBySlate(games);
    expect(groups.map(g => [g.label, g.games.map(x => x.id)])).toEqual([
      ["Thursday Primetime", [2]],
      ["Sunday Early Slate", [3, 4]],
      ["Sunday Afternoon Slate", [1]],
      ["Sunday Primetime", [5]],
      ["Monday Primetime", [6]],
      ["Time TBD", [7]],
    ]);
  });

  test("the same slate on different days stays separate", () => {
    const groups = groupGamesBySlate([
      { id: 1, gameTime: "2025-12-20T18:00:00Z" }, // Sat 1 PM ET
      { id: 2, gameTime: "2025-12-21T18:00:00Z" }, // Sun 1 PM ET
    ]);
    expect(groups.map(g => g.label)).toEqual(["Saturday Early Slate", "Sunday Early Slate"]);
  });
});
