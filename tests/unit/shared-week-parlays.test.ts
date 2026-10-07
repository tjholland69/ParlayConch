import { describe, expect, test } from "vitest";
import { canStartParlay, currentParlayFor, findMarketConflict, openParlayFor, pickStanding } from "../../shared/weekParlays";

const leg = (userId: string, extra: Record<string, unknown> = {}) => ({ userId, gameId: 1, betType: "spread", pick: "home", ...extra });
const parlay = (id: number, status: string, legs: ReturnType<typeof leg>[] = [], userId = "amy") => ({ id, userId, status, legs });

describe("shared/weekParlays", () => {
  test("a second member lands in the parlay the first one started", () => {
    const parlays = [parlay(1, "draft", [leg("amy")])];
    expect(openParlayFor(parlays, "bo")?.id).toBe(1);
    expect(currentParlayFor(parlays, "bo")?.legs).toHaveLength(1);
  });

  test("a member goes to the open parlay still missing their pick", () => {
    const parlays = [parlay(1, "draft", [leg("amy")]), parlay(2, "draft", [leg("bo")])];
    expect(openParlayFor(parlays, "amy")?.id).toBe(2);
    expect(openParlayFor(parlays, "cal")?.id).toBe(1);
    // With a pick in every open parlay, the newest is the one they'd edit.
    expect(openParlayFor([parlay(1, "draft", [leg("amy")]), parlay(2, "draft", [leg("amy")])], "amy")?.id).toBe(2);
  });

  test("with nothing open, the member sees the submitted parlay", () => {
    const parlays = [parlay(1, "pending", [leg("amy")]), parlay(2, "void")];
    expect(openParlayFor(parlays, "bo")).toBeUndefined();
    expect(currentParlayFor(parlays, "bo")?.id).toBe(1);
    expect(currentParlayFor([], "bo")).toBeNull();
    expect(currentParlayFor(parlays, "bo", 2)?.id).toBe(2);
  });

  test("void and rejected parlays don't use up the week's limit", () => {
    expect(canStartParlay([], 1)).toBe(true);
    expect(canStartParlay([parlay(1, "draft")], 1)).toBe(false);
    expect(canStartParlay([parlay(1, "void"), parlay(2, "rejected")], 1)).toBe(true);
    expect(canStartParlay([parlay(1, "pending")], 2)).toBe(true);
    expect(canStartParlay([parlay(1, "pending")], null)).toBe(false);
  });

  test("one bet per market: the same pick, or its other side, is taken", () => {
    const legs = [
      leg("amy"),
      leg("bo", { betType: "moneyline", pick: "away" }),
      leg("cal", { betType: "over", pick: "over" }),
      leg("dee", { betType: "player_prop", pick: "over", playerName: "Josh Allen", propType: "pass_yards" }),
    ];
    expect(findMarketConflict(legs, leg("x"), "eve")?.userId).toBe("amy");
    expect(findMarketConflict(legs, leg("x", { pick: "away" }), "eve")?.userId).toBe("amy");
    expect(findMarketConflict(legs, leg("x", { betType: "moneyline", pick: "away" }), "eve")?.userId).toBe("bo");
    expect(findMarketConflict(legs, leg("x", { betType: "under", pick: "under" }), "eve")?.userId).toBe("cal");
    expect(findMarketConflict(legs, leg("x", { betType: "player_prop", pick: "under", playerName: "josh allen", propType: "pass_yards" }), "eve")?.userId).toBe("dee");
    // A different game, a different prop, or the member's own leg is fine.
    expect(findMarketConflict(legs, leg("x", { gameId: 2 }), "eve")).toBeUndefined();
    expect(findMarketConflict(legs, leg("x", { betType: "player_prop", pick: "over", playerName: "Josh Allen", propType: "rush_yards" }), "eve")).toBeUndefined();
    expect(findMarketConflict(legs, leg("x"), "amy")).toBeUndefined();
  });

  test("standing counts the whole parlay, not one member's legs", () => {
    const s = pickStanding(parlay(1, "draft", [leg("amy"), leg("bo", { gameId: 2 })]), "bo", 3, 12);
    expect(s).toMatchObject({ open: true, legCount: 2, needed: 1, full: false, readyToSubmit: false });
    expect(s.myLeg?.gameId).toBe(2);
    expect(pickStanding(parlay(1, "pending", [leg("amy")]), "bo", 1, 12)).toMatchObject({ open: false, readyToSubmit: false, myLeg: undefined });
    expect(pickStanding(null, "bo", 3, 12)).toMatchObject({ open: false, legCount: 0, needed: 3 });
  });
});
