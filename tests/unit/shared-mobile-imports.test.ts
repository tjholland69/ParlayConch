import { describe, expect, test } from "vitest";
import { getSlate } from "../../shared/slate";
import {
  buildResultDetail,
  deriveResultDetailFromGame,
  resolveResultDetail,
} from "../../shared/legJustification";
import { pickDeepLinkGames, SPORTSBOOK_PROVIDERS } from "../../shared/sportsbook-providers";
import type { Game } from "../../shared/schema";

describe("shared/slate", () => {
  test("buckets kickoffs in US/Eastern broadcast windows", () => {
    // 2024-09-08 is a Sunday; times expressed as UTC that land in ET buckets.
    expect(getSlate("2024-09-08T14:00:00Z")).toBe("Morning"); // 10:00 ET
    expect(getSlate("2024-09-08T17:00:00Z")).toBe("Early Slate"); // 13:00 ET
    expect(getSlate("2024-09-08T21:00:00Z")).toBe("Afternoon Slate"); // 17:00 ET
    expect(getSlate("2024-09-09T00:30:00Z")).toBe("Primetime"); // 20:30 ET
  });
});

describe("shared/legJustification", () => {
  const finishedGame = {
    homeTeam: "KC",
    awayTeam: "BUF",
    homeScore: 24,
    awayScore: 20,
  } as Game;

  test("buildResultDetail uses final score for game bets", () => {
    expect(
      buildResultDetail({
        leg: { betType: "spread", pick: "home", line: "-3", propType: null, playerName: null, result: "win" },
        game: finishedGame,
      }),
    ).toBe("Final: BUF 20 @ KC 24");
  });

  test("deriveResultDetailFromGame skips player props", () => {
    expect(
      deriveResultDetailFromGame({ betType: "player_prop", pick: "over", line: "99.5" }, finishedGame),
    ).toBeNull();
  });

  test("resolveResultDetail prefers stored detail then derived then fallback", () => {
    expect(
      resolveResultDetail(
        { betType: "spread", pick: "home", line: "-3", resultDetail: "Stored detail" },
        finishedGame,
      ),
    ).toBe("Stored detail");
    expect(
      resolveResultDetail({ betType: "spread", pick: "home", line: "-3", resultDetail: null }, finishedGame),
    ).toBe("Final: BUF 20 @ KC 24");
    expect(
      resolveResultDetail(
        { betType: "player_prop", pick: "over", line: "10", resultDetail: null },
        finishedGame,
      ),
    ).toBe("No detail available");
  });
});

describe("shared/sportsbook-providers", () => {
  test("exposes FanDuel and DraftKings deep-link configs", () => {
    expect(SPORTSBOOK_PROVIDERS.fanduel.appScheme).toBe("fanduel");
    expect(SPORTSBOOK_PROVIDERS.draftkings.buildGameDeepLink({ homeTeam: "KC", awayTeam: "BUF" })).toContain(
      encodeURIComponent("BUF at KC"),
    );
  });

  test("pickDeepLinkGames sorts by earliest kickoff and dedupes by gameId", () => {
    const picked = pickDeepLinkGames([
      {
        gameId: 2,
        game: { homeTeam: "DAL", awayTeam: "PHI", gameTime: "2024-09-08T20:00:00Z" },
      },
      {
        gameId: 1,
        game: { homeTeam: "KC", awayTeam: "BUF", gameTime: "2024-09-08T17:00:00Z" },
      },
      // Same game as gameId 1 (e.g. a Spread + an Over/Under on one matchup)
      // — must collapse to a single walkthrough step, not two.
      {
        gameId: 1,
        game: { homeTeam: "KC", awayTeam: "BUF", gameTime: "2024-09-08T17:00:00Z" },
      },
      { gameId: null, game: null },
    ]);
    expect(picked).toEqual([
      { homeTeam: "KC", awayTeam: "BUF" },
      { homeTeam: "DAL", awayTeam: "PHI" },
    ]);
    expect(pickDeepLinkGames([{ gameId: null, game: null }])).toEqual([]);
  });
});
