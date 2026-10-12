import { describe, expect, test } from "vitest";
import { betAngle, buildPickSuggestions, oddsFromLine, type HistoryLeg, type SuggestionGame } from "@shared/pickSuggestions";

const later = new Date("2044-09-10T17:00:00Z");
const now = new Date("2044-09-08T12:00:00Z");

const game = (id: number, home: string, away: string, extra: Partial<SuggestionGame> = {}): SuggestionGame => ({
  id, homeTeam: home, awayTeam: away, spread: "-3.5", spreadOdds: "-110", overUnder: "44.5", overOdds: "-110", underOdds: "-110",
  moneylineHome: "-180", moneylineAway: "+150", gameTime: later, ...extra,
});

/** `count` graded picks of the same kind. */
const legs = (count: number, leg: Partial<HistoryLeg> & { result: string }): HistoryLeg[] =>
  Array.from({ length: count }, () => ({ userId: "me", betType: "spread", pick: "home", line: "-3 (-110)", homeTeam: "Bills", awayTeam: "Jets", ...leg }));

describe("betAngle and oddsFromLine", () => {
  test("a spread or moneyline is a favorite or an underdog by the sign of its number", () => {
    expect(betAngle({ betType: "spread", line: "-3.5 (-110)" })?.key).toBe("spread:favorites");
    expect(betAngle({ betType: "spread", line: "+3.5 (-110)" })?.key).toBe("spread:underdogs");
    expect(betAngle({ betType: "moneyline", line: "+150" })?.label).toBe("moneyline underdogs");
    expect(betAngle({ betType: "moneyline", line: null, odds: "-200" })?.key).toBe("moneyline:favorites");
    expect(betAngle({ betType: "over", line: "O44.5 (-110)" })?.key).toBe("over");
    expect(betAngle({ betType: "spread", line: "PK" })).toBeNull();
    expect(betAngle({ betType: "player_prop", line: "87.5" })).toBeNull();
  });

  test("odds come out of the line as stored on a pick", () => {
    expect(oddsFromLine("spread", "-3.5 (-110)")).toBe("-110");
    expect(oddsFromLine("moneyline", "+150")).toBe("+150");
    expect(oddsFromLine("over", null)).toBeNull();
  });
});

describe("buildPickSuggestions", () => {
  test("no history means no suggestions: nothing is padded in", () => {
    expect(buildPickSuggestions({ userId: "me", games: [game(1, "Bills", "Jets")], history: [], now })).toEqual([]);
  });

  test("the member's own record on a team leads, quoted as they'd read it", () => {
    const history = [...legs(4, { result: "win" }), ...legs(1, { result: "loss" })];
    const [top] = buildPickSuggestions({ userId: "me", games: [game(1, "Bills", "Jets")], history, now });
    expect(top).toMatchObject({ gameId: 1, pick: "home", reason: "own_team", detail: "You're 4-1 picking the Bills", rank: 1 });
    expect(["spread", "moneyline"]).toContain(top.betType);
  });

  test("other members' picks count toward the league's record, not the member's", () => {
    const history = legs(5, { userId: "someone-else", result: "win" });
    const [top] = buildPickSuggestions({ userId: "me", games: [game(1, "Bills", "Jets")], history, now });
    expect(top).toMatchObject({ reason: "league_team", detail: "The league is 5-0 picking the Bills" });
  });

  test("a losing record, a thin one, and pushes are never quoted", () => {
    const losing = [...legs(2, { result: "win" }), ...legs(3, { result: "loss" })];
    const thin = legs(2, { result: "win", homeTeam: "Chiefs", awayTeam: "Raiders" });
    const pushes = legs(6, { result: "push", homeTeam: "Lions", awayTeam: "Bears" });
    const games = [game(1, "Bills", "Jets"), game(2, "Chiefs", "Raiders", { spread: null, moneylineHome: null, moneylineAway: null, overUnder: null }), game(3, "Lions", "Bears")];
    const out = buildPickSuggestions({ userId: "me", games, history: [...losing, ...thin, ...pushes], now });
    expect(out.filter((s) => s.reason === "own_team" || s.reason === "league_team")).toEqual([]);
  });

  test("a bet another member already has, on either side, is left out", () => {
    const history = legs(5, { result: "win" });
    const out = buildPickSuggestions({
      userId: "me", games: [game(1, "Bills", "Jets")], history, now,
      takenMarkets: ["game:1:spread", "game:1:moneyline"],
    });
    expect(out.some((s) => s.betType === "spread" || s.betType === "moneyline")).toBe(false);
  });

  test("games that have kicked off or have no line aren't suggested", () => {
    const history = [...legs(5, { result: "win" }), ...legs(5, { result: "win", betType: "over", pick: "over", line: "O44.5 (-110)" })];
    const started = game(1, "Bills", "Jets", { gameTime: new Date("2044-09-07T17:00:00Z") });
    const finished = game(2, "Bills", "Dolphins", { isFinished: true });
    const noLines = game(3, "Bills", "Pats", { spread: null, overUnder: null, moneylineHome: null, moneylineAway: null });
    expect(buildPickSuggestions({ userId: "me", games: [started, finished, noLines], history, now })).toEqual([]);
  });

  test("one side per market, two bets a game, five in all, ranked in order", () => {
    const teams = ["Bills", "Chiefs", "Lions", "Ravens"];
    const history = teams.flatMap((t) => legs(5, { result: "win", homeTeam: t, awayTeam: "Other" }));
    const games = teams.map((t, i) => game(i + 1, t, `Away${i}`));
    const out = buildPickSuggestions({ userId: "me", games, history, now });
    expect(out).toHaveLength(5);
    expect(out.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5]);
    const markets = out.map((s) => `${s.gameId}:${s.betType === "under" ? "over" : s.betType}`);
    expect(new Set(markets).size).toBe(markets.length);
    for (const g of games) expect(out.filter((s) => s.gameId === g.id).length).toBeLessThanOrEqual(2);
  });

  test("a kind-of-bet record is quoted once, however many games it fits", () => {
    const history = [...legs(6, { result: "win", betType: "over", pick: "over", line: "O44.5 (-110)" }), ...legs(2, { result: "loss", betType: "over", pick: "over", line: "O44.5 (-110)" })];
    const games = [game(1, "A", "B"), game(2, "C", "D"), game(3, "E", "F")];
    const out = buildPickSuggestions({ userId: "me", games, history, now });
    const overs = out.filter((s) => s.betType === "over");
    expect(overs).toHaveLength(1);
    expect(overs[0]).toMatchObject({ detail: "You're 6-2 on overs", line: "O44.5 (-110)", odds: "-110" });
  });
});
