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
  });

  test("awaySpreadDisplay flips the home spread sign", () => {
    expect(awaySpreadDisplay("-7")).toBe("+7");
    expect(awaySpreadDisplay("+3")).toBe("+3");
    expect(awaySpreadDisplay(null)).toBeNull();
  });

  test("shortLegLabel builds compact pick text", () => {
    const spreadHome: SelectedLeg = { gameId: 1, betType: "spread", pick: "home" };
    const mlAway: SelectedLeg = { gameId: 1, betType: "moneyline", pick: "away" };
    expect(shortLegLabel(spreadHome, baseGame)).toBe("KC -3.5");
    expect(shortLegLabel(mlAway, baseGame)).toBe("BUF ML (+145)");
    expect(shortLegLabel({ gameId: 1, betType: "over", pick: "over" }, baseGame)).toBe("O 47.5");
    expect(shortLegLabel(spreadHome, undefined)).toBe("Pick");
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
