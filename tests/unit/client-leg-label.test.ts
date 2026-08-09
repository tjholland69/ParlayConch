import { describe, expect, test } from "vitest";
import { legLabel, legMatchup, legMatchupText } from "../../client/src/lib/legLabel";

const gameLeg = {
  betType: "spread",
  game: { awayTeam: "BUF", homeTeam: "KC" },
};

const propLeg = {
  betType: "player_prop",
  playerName: "Josh Allen",
  propType: "pass_yards",
};

describe("client/lib/legLabel", () => {
  test("legLabel uses matchup for game bets and player name for props", () => {
    expect(legLabel(gameLeg)).toBe("BUF @ KC");
    expect(legLabel(propLeg)).toBe("Josh Allen");
    expect(legLabel({ betType: "moneyline" })).toBe("Unknown Matchup");
    expect(legLabel({ betType: "player_prop" })).toBe("Player Prop");
  });

  test("legMatchup includes prop type label when present", () => {
    expect(legMatchup(gameLeg)).toBe("BUF @ KC");
    expect(legMatchup(propLeg)).toBe("Josh Allen — Passing Yards");
    expect(legMatchup({ betType: "player_prop", playerName: "X", propType: "custom_thing" })).toBe(
      "X — Custom Thing",
    );
  });

  test("legMatchupText is a searchable haystack", () => {
    expect(legMatchupText(gameLeg)).toBe("BUF KC");
    expect(legMatchupText(propLeg)).toBe("Josh Allen pass_yards");
  });
});
