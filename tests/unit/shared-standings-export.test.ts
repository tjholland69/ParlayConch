import { describe, expect, test } from "vitest";
import { standingsCsv, standingsText } from "../../shared/standingsExport";

const rows = [
  { username: "Marty", wins: 12, losses: 4, pushes: 1, winRate: 75, powerScore: 1.416, participationRate: 1, bar: 0.25 },
  { username: 'Big "G", Jr', wins: 3, losses: 9, winRate: 25, powerScore: 0.4, participationRate: 0.5 },
];

describe("shared/standingsExport", () => {
  test("csv ranks rows in the order given and escapes names", () => {
    const lines = standingsCsv(rows).split("\n");
    expect(lines[0]).toBe("rank,member,wins,losses,pushes,win_rate_pct,participation_pct,power_score,bar");
    expect(lines[1]).toBe("1,Marty,12,4,1,75.0,100,1.42,0.25");
    expect(lines[2]).toBe('2,"Big ""G"", Jr",3,9,0,25.0,50,0.40,0.00');
  });

  test("text is a ranked list headed by league, scope and sort", () => {
    const text = standingsText({ leagueName: "The Boys", scopeLabel: "All Time", sortLabel: "Win %", rows });
    expect(text.split("\n")).toEqual([
      "🏆 The Boys · All Time",
      "Sorted by Win %",
      "1. Marty: 12-4 (75%) · Pwr 1.42 · Part 100%",
      '2. Big "G", Jr: 3-9 (25%) · Pwr 0.40 · Part 50%',
    ]);
  });

  test("text leaves the sort line out for the default order", () => {
    expect(standingsText({ leagueName: "L", scopeLabel: "Current Year", rows: [] })).toBe("🏆 L · Current Year");
  });
});
