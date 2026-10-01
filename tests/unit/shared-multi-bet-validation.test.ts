import { describe, expect, test } from "vitest";
import { betMarket, validateMultiBetLegs, type MultiBetLegInput } from "../../shared/multiBetValidation";
import { primaryPropType, propTypesForPosition } from "../../client/src/lib/propPosition";

const spread = (userId: string, gameId: number, pick: string, line = "-3.5"): MultiBetLegInput => ({
  userId, gameId, betType: "spread", pick, line, odds: "-110",
});
const prop = (userId: string, pick: string, over: Partial<MultiBetLegInput> = {}): MultiBetLegInput => ({
  userId, betType: "player_prop", pick, playerName: "Josh Allen", propType: "pass_yards", line: "249.5", ...over,
});

describe("shared/multiBetValidation", () => {
  test("a complete parlay with distinct members and bets is valid", () => {
    const result = validateMultiBetLegs(
      [
        spread("u1", 1, "home"),
        { userId: "u2", gameId: 2, betType: "moneyline", pick: "away", odds: "+150" },
        { userId: "u3", gameId: 1, betType: "over", pick: "over", line: "47.5" },
        prop("u4", "over"),
        prop("u5", "yes", { playerName: "James Cook", propType: "anytime_td", line: null }),
      ],
      { minLegs: 3 },
    );
    expect(result).toEqual({ formErrors: [], rowErrors: {}, valid: true });
  });

  test("fewer bets than the league minimum is a form error", () => {
    const result = validateMultiBetLegs([spread("u1", 1, "home")], { minLegs: 3 });
    expect(result.valid).toBe(false);
    expect(result.formErrors).toEqual(["A parlay needs at least 3 bets (1 entered)"]);
  });

  test("a member can only have one bet", () => {
    const result = validateMultiBetLegs([spread("u1", 1, "home"), spread("u1", 2, "away", "3.5")]);
    expect(result.rowErrors[0]).toEqual(["This member already has a bet in row 2"]);
    expect(result.rowErrors[1]).toEqual(["This member already has a bet in row 1"]);
  });

  test("two members on the same bet are flagged, whatever line each took", () => {
    const result = validateMultiBetLegs([spread("u1", 1, "home", "-3.5"), spread("u2", 1, "home", "-4")]);
    expect(result.rowErrors[0]).toEqual(["Same bet as row 2"]);
    expect(result.rowErrors[1]).toEqual(["Same bet as row 1"]);
  });

  test("both sides of one market are flagged as opposing", () => {
    const cases: [MultiBetLegInput, MultiBetLegInput][] = [
      [spread("u1", 1, "home"), spread("u2", 1, "away", "3.5")],
      [
        { userId: "u1", gameId: 1, betType: "moneyline", pick: "home" },
        { userId: "u2", gameId: 1, betType: "moneyline", pick: "away" },
      ],
      [
        { userId: "u1", gameId: 1, betType: "over", pick: "over", line: "47.5" },
        { userId: "u2", gameId: 1, betType: "under", pick: "under", line: "47.5" },
      ],
      [prop("u1", "over"), prop("u2", "under", { playerName: "josh allen " })],
    ];
    for (const legs of cases) {
      const result = validateMultiBetLegs(legs);
      expect(result.rowErrors[0]).toEqual(["Opposes the bet in row 2, so the parlay could never win"]);
      expect(result.rowErrors[1]).toEqual(["Opposes the bet in row 1, so the parlay could never win"]);
    }
  });

  test("different markets on the same game don't conflict", () => {
    const result = validateMultiBetLegs([
      spread("u1", 1, "home"),
      { userId: "u2", gameId: 1, betType: "moneyline", pick: "away" },
      { userId: "u3", gameId: 1, betType: "under", pick: "under", line: "47.5" },
      prop("u4", "over"),
      prop("u5", "under", { propType: "rush_yards", line: "30.5" }),
    ]);
    expect(result.valid).toBe(true);
  });

  test("incomplete rows say what's missing", () => {
    const result = validateMultiBetLegs([
      { userId: "", gameId: null, betType: "spread", pick: "" },
      { userId: "u2", gameId: 1, betType: "spread", pick: "home", line: "abc", odds: "even" },
      { userId: "u3", betType: "player_prop", pick: "over", playerName: " ", propType: null },
      prop("u4", "over", { line: "" }),
      { userId: "u5", gameId: 2, betType: "moneyline", pick: "" },
    ]);
    expect(result.rowErrors[0]).toEqual(["Choose a bet owner", "Choose a game"]);
    expect(result.rowErrors[1]).toEqual(["Enter the spread (e.g. -3.5)", "Odds should look like -110 or +150"]);
    expect(result.rowErrors[2]).toEqual(["Choose a player", "Choose the stat for this prop"]);
    expect(result.rowErrors[3]).toEqual(["Enter the prop line (e.g. 74.5)"]);
    expect(result.rowErrors[4]).toEqual(["Choose a team"]);
  });

  test("betMarket is null until a row has enough to compare", () => {
    expect(betMarket({ userId: "u1", gameId: null, betType: "spread", pick: "home" })).toBeNull();
    expect(betMarket({ userId: "u1", betType: "player_prop", pick: "over", playerName: "", propType: "rec_yards" })).toBeNull();
    expect(betMarket({ userId: "u1", gameId: 4, betType: "under", pick: "under" })).toEqual({ market: "game:4:total", side: "under" });
  });
});

describe("client/lib/propPosition", () => {
  test("primary stat follows the player's position", () => {
    expect(primaryPropType("QB")).toBe("pass_yards");
    expect(primaryPropType("RB")).toBe("rush_yards");
    expect(primaryPropType("WR")).toBe("rec_yards");
    expect(primaryPropType("te")).toBe("rec_yards");
    expect(primaryPropType("K")).toBe("kicking_pts");
    expect(primaryPropType("LB")).toBe("tackles");
  });

  test("every prop type stays reachable, position-relevant ones first", () => {
    const { primary, other } = propTypesForPosition("QB");
    expect(primary[0].value).toBe("pass_yards");
    expect(other.some(p => p.value === "rec_yards")).toBe(true);
    expect(new Set([...primary, ...other].map(p => p.value)).size).toBe(19);
  });

  test("an unknown position offers the full catalog", () => {
    const { primary, other } = propTypesForPosition(null);
    expect(primary).toHaveLength(19);
    expect(other).toHaveLength(0);
  });
});
