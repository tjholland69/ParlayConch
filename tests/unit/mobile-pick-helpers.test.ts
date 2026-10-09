import { describe, expect, test } from "vitest";
import {
  awaySpreadDisplay,
  getLineForBet,
  isGamePast,
  shortLegLabel,
  webLeagueSettingsUrl,
  type SelectedLeg,
} from "../../mobile/src/lib/pickHelpers";
import type { Game } from "../../shared/schema";

const baseGame = {
  id: 1,
  homeTeam: "KC",
  awayTeam: "BUF",
  spread: "-3.5",
  spreadOdds: "-110",
  moneylineHome: "-165",
  moneylineAway: "+145",
  overUnder: "47.5",
  overOdds: "-110",
  underOdds: "-110",
  isFinished: false,
  gameTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
} as Game;

describe("mobile/lib/pickHelpers", () => {
  test("getLineForBet formats spread / moneyline / totals", () => {
    expect(getLineForBet(baseGame, "spread", "home")).toBe("-3.5 (-110)");
    expect(getLineForBet(baseGame, "spread", "away")).toBe("+3.5 (-110)");
    expect(getLineForBet(baseGame, "moneyline", "home")).toBe("-165");
    expect(getLineForBet(baseGame, "moneyline", "away")).toBe("+145");
    expect(getLineForBet(baseGame, "over", "over")).toBe("O47.5 (-110)");
    expect(getLineForBet(baseGame, "under", "under")).toBe("U47.5 (-110)");
    expect(getLineForBet(baseGame, "player_prop", "yes")).toBeUndefined();
    // Home underdog, with and without a stored "+": away is the favorite.
    expect(getLineForBet({ ...baseGame, spread: "+3.5" }, "spread", "away")).toBe("-3.5 (-110)");
    expect(getLineForBet({ ...baseGame, spread: "3.5" }, "spread", "away")).toBe("-3.5 (-110)");
    expect(getLineForBet({ ...baseGame, spread: "3.5" }, "spread", "home")).toBe("+3.5 (-110)");
  });

  test("awaySpreadDisplay flips the home spread sign", () => {
    expect(awaySpreadDisplay("-7")).toBe("+7");
    // An away favorite: the home side is +3, so the away side is -3.
    expect(awaySpreadDisplay("+3")).toBe("-3");
    expect(awaySpreadDisplay("3")).toBe("-3");
    expect(awaySpreadDisplay(null)).toBeNull();
  });

  test("shortLegLabel names the side, the market and its number", () => {
    const spreadHome: SelectedLeg = { gameId: 1, betType: "spread", pick: "home" };
    const mlAway: SelectedLeg = { gameId: 1, betType: "moneyline", pick: "away" };
    expect(shortLegLabel(spreadHome, baseGame)).toBe("KC (Spread -3.5)");
    expect(shortLegLabel(mlAway, baseGame)).toBe("BUF (Moneyline +145)");
    expect(shortLegLabel({ gameId: 1, betType: "over", pick: "over" }, baseGame)).toBe("Over 47.5 (Total)");
    expect(shortLegLabel(spreadHome, undefined)).toBe("Pick");
  });

  test("shortLegLabel prefers the leg's stored line (bought points) over the game's", () => {
    const bought: SelectedLeg = { gameId: 1, betType: "spread", pick: "home", line: "-2.5 (-125)" };
    expect(shortLegLabel(bought, baseGame)).toBe("KC (Spread -2.5)");
    expect(shortLegLabel({ gameId: 1, betType: "under", pick: "under", line: "U48.5 (-125)" }, baseGame)).toBe("Under 48.5 (Total)");
  });

  test("shortLegLabel spells out a player prop without needing the game", () => {
    const prop: SelectedLeg = { gameId: 1, betType: "player_prop", pick: "over", line: "74.5", playerName: "Josh Downs", propType: "rec_yards" };
    expect(shortLegLabel(prop, undefined)).toBe("Josh Downs (Receiving Over 74.5 Yds)");
  });

  test("isGamePast uses finished flag or kickoff time", () => {
    expect(isGamePast(baseGame)).toBe(false);
    expect(isGamePast({ ...baseGame, isFinished: true })).toBe(true);
    expect(
      isGamePast({
        ...baseGame,
        isFinished: false,
        gameTime: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toBe(true);
  });

  test("webLeagueSettingsUrl trims trailing slash on API base", () => {
    expect(webLeagueSettingsUrl(42, "https://parlayconch.com/")).toBe(
      "https://parlayconch.com/leagues/42/settings",
    );
  });
});
