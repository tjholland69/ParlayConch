import { describe, expect, test } from "vitest";
import { legLabel, legMatchup, legMatchupText } from "../../client/src/lib/legLabel";
import { formatPickLabel, withPlusSign } from "../../client/src/lib/formatPick";

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

  test("legMatchup shows the player alone for props (prop type lives in the Pick column)", () => {
    expect(legMatchup(gameLeg)).toBe("BUF @ KC");
    expect(legMatchup(propLeg)).toBe("Josh Allen");
    expect(legMatchup({ betType: "player_prop" })).toBe("Player");
  });

  test("legMatchupText is a searchable haystack", () => {
    expect(legMatchupText(gameLeg)).toBe("BUF KC");
    expect(legMatchupText(propLeg)).toBe("Josh Allen pass_yards");
  });

  test("withPlusSign prefixes positive lines/odds only", () => {
    expect(withPlusSign("150")).toBe("+150");
    expect(withPlusSign("3.5")).toBe("+3.5");
    expect(withPlusSign("+150")).toBe("+150");
    expect(withPlusSign("-110")).toBe("-110");
    expect(withPlusSign("0")).toBe("0");
    expect(withPlusSign("PK")).toBe("PK");
    expect(withPlusSign(null)).toBeNull();
    expect(withPlusSign("")).toBeNull();
  });

  test("formatPickLabel signs positive spreads", () => {
    const game = { homeTeam: "KC", awayTeam: "BUF" };
    expect(formatPickLabel({ betType: "spread", pick: "away", line: "3.5", propType: null, game })).toBe("BUF +3.5");
    expect(formatPickLabel({ betType: "spread", pick: "home", line: "-3.5", propType: null, game })).toBe("KC -3.5");
    expect(formatPickLabel({ betType: "player_prop", pick: "over", line: "87.5", propType: "rush_yards" })).toBe(
      "Rushing Over 87.5 Yds",
    );
  });
});
