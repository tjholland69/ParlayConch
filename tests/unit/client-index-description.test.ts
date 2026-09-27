import { describe, expect, test } from "vitest";
import { describeCustomIndexInWords } from "../../client/src/lib/indexDescription";
import type { League } from "../../shared/schema";

const leagues = [{ id: 1, name: "Sunday Crew" }] as League[];
const names: Record<string, string> = { u1: "George" };
const lookup = (id: string) => names[id];

describe("client/lib/indexDescription", () => {
  test("names the bet type and the members compared against", () => {
    expect(
      describeCustomIndexInWords(
        { leagueIds: [1], memberUserIds: ["u1"], betTypes: ["player_prop"] },
        leagues,
        lookup,
      ),
    ).toBe("Player props only, against George, in Sunday Crew");
  });

  test("falls back to broad wording and member counts", () => {
    expect(describeCustomIndexInWords({ leagueIds: [], memberUserIds: [], betTypes: [] }, leagues, lookup)).toBe(
      "All bet types, against everyone else, across all your leagues",
    );
    expect(
      describeCustomIndexInWords(
        { leagueIds: [], memberUserIds: ["u1", "ghost"], betTypes: ["spread", "moneyline"], propTypes: [] },
        leagues,
        lookup,
      ),
    ).toBe("Spread & Moneyline bets only, against 2 members, across all your leagues");
  });

  test("includes prop types, player and team", () => {
    expect(
      describeCustomIndexInWords(
        { leagueIds: [], memberUserIds: [], betTypes: ["player_prop"], propTypes: ["rush_yards"], playerName: "Barkley", teamName: "Eagles" },
        leagues,
        lookup,
      ),
    ).toBe("Player props only (Rushing Yards), on Barkley, involving Eagles, against everyone else, across all your leagues");
  });
});
