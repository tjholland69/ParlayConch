import { describe, expect, test } from "vitest";
import { legChipLabel, legLabel, legMatchup, legMatchupText } from "../../client/src/lib/legLabel";
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

  test("legChipLabel names the side, the market and its number", () => {
    const game = { awayTeam: "Texans", homeTeam: "Colts", spread: "-3.5", overUnder: "47.5" };
    const leg = (betType: string, pick: string, line: string | null) => ({ betType, pick, line, propType: null });

    // Stored lines carry the odds after the number; only the number shows.
    expect(legChipLabel(leg("spread", "home", "-3.5 (-110)"), game)).toBe("Colts (Spread -3.5)");
    expect(legChipLabel(leg("spread", "away", "+3.5 (-110)"), game)).toBe("Texans (Spread +3.5)");
    expect(legChipLabel(leg("moneyline", "away", "150"), game)).toBe("Texans (Moneyline +150)");
    expect(legChipLabel(leg("over", "over", "O47.5 (-110)"), game)).toBe("Over 47.5 (Total)");
    expect(legChipLabel(leg("under", "under", "U47.5 (-110)"), game)).toBe("Under 47.5 (Total)");
  });

  test("legChipLabel falls back to the game's line, then to the bare market", () => {
    const game = { awayTeam: "Texans", homeTeam: "Colts", spread: "-3.5", overUnder: "47.5" };
    const leg = (betType: string, pick: string) => ({ betType, pick, line: null, propType: null });

    expect(legChipLabel(leg("spread", "away"), game)).toBe("Texans (Spread +3.5)");
    expect(legChipLabel(leg("over", "over"), game)).toBe("Over 47.5 (Total)");
    expect(legChipLabel(leg("moneyline", "home"), game)).toBe("Colts (Moneyline)");
    expect(legChipLabel(leg("spread", "home"), null)).toBe("Home (Spread)");
  });

  test("legChipLabel spells out a player prop", () => {
    expect(
      legChipLabel({ betType: "player_prop", pick: "over", line: "249.5", playerName: "Josh Allen", propType: "pass_yards" }),
    ).toBe("Josh Allen (Passing Over 249.5 Yds)");
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
