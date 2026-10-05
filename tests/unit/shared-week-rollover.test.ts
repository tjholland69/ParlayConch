import { describe, expect, test } from "vitest";
import { isNewSeasonOpen, isWeekOver } from "../../shared/weekRollover";

const game = (isFinished: boolean, gameTime: string | null) => ({ isFinished, gameTime });
const MNF = "2025-09-09T00:15:00Z"; // Monday night, 8:15pm ET

describe("shared/weekRollover", () => {
  test("a week with every game finished is over", () => {
    expect(isWeekOver([game(true, MNF)], new Date("2025-09-09T04:00:00Z")).over).toBe(true);
  });

  test("an unfinished game holds the week open until the grace period passes", () => {
    const games = [game(true, "2025-09-07T17:00:00Z"), game(false, MNF)];
    expect(isWeekOver(games, new Date("2025-09-09T03:00:00Z")).over).toBe(false);
  });

  test("a game never marked finished doesn't block the Tuesday-morning rollover", () => {
    const games = [game(false, "2025-09-07T17:00:00Z"), game(true, MNF)];
    const decision = isWeekOver(games, new Date("2025-09-09T08:00:00Z"));
    expect(decision.over).toBe(true);
    expect(decision.unfinished).toBe(1);
  });

  test("a game moved later in the week pushes the rollover back with it", () => {
    const games = [game(true, MNF), game(false, "2025-09-10T23:00:00Z")];
    expect(isWeekOver(games, new Date("2025-09-09T08:00:00Z")).over).toBe(false);
  });

  test("no games, or unfinished games with no kickoff times, never roll over", () => {
    expect(isWeekOver([], new Date()).over).toBe(false);
    expect(isWeekOver([game(false, null)], new Date("2030-01-01T00:00:00Z")).over).toBe(false);
  });

  test("a new season opens two weeks before its first kickoff", () => {
    const kickoff = new Date("2026-09-11T00:20:00Z");
    expect(isNewSeasonOpen(kickoff, new Date("2026-05-20T00:00:00Z"))).toBe(false);
    expect(isNewSeasonOpen(kickoff, new Date("2026-08-28T08:00:00Z"))).toBe(true);
  });
});
