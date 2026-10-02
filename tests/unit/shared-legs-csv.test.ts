import { describe, expect, test } from "vitest";
import { legsToCsv, type LegExportRow } from "../../shared/legsCsv";

const row = (overrides: Partial<LegExportRow>): LegExportRow => ({
  legId: 1, parlayId: 10, league: "Conch League", season: 2025, week: 3, parlayStatus: "win",
  betOwner: "Tim", betType: "spread", awayTeam: "Bills", homeTeam: "Chiefs", playerName: null, propType: null,
  pick: "away", line: "+3.5", odds: "-110", oddsSource: null, gameSegment: null, result: "win",
  resultDetail: null, kickoff: "2025-09-21T17:00:00Z", decidedAt: "2025-09-21T20:05:00Z", notes: null,
  ...overrides,
});

const parse = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

describe("shared/legsCsv", () => {
  test("writes a header and one row per leg, naming the team that was picked", () => {
    const [header, line] = parse(legsToCsv([row({})]));
    const cells = Object.fromEntries(header.split(",").map((h, i) => [h, line.split(",")[i]]));
    expect(cells).toMatchObject({
      leg_id: "1", league: "Conch League", season: "2025", week: "3", bet_owner: "Tim",
      matchup: "Bills @ Chiefs", pick: "Bills", line: "+3.5", odds: "-110", result: "win",
      game_date_et: "09/21/2025", kickoff_et: "1:00 PM", slate: "Early Slate",
      decided_at_utc: "2025-09-21T20:05:00.000Z",
    });
  });

  test("sorts newest week first and leaves blanks for a prop with no game", () => {
    const lines = parse(legsToCsv([
      row({ legId: 1, week: 2 }),
      row({ legId: 2, week: 5, betType: "player_prop", awayTeam: null, homeTeam: null, playerName: "A.J. Brown", pick: "over", kickoff: null, decidedAt: null }),
    ]));
    expect(lines[1].startsWith("2,")).toBe(true);
    expect(lines[1]).toContain(",player_prop,,A.J. Brown,");
    expect(lines[2].startsWith("1,")).toBe(true);
  });

  test("quotes commas and quotes, and defuses spreadsheet formulas in free text", () => {
    const [, line] = parse(legsToCsv([row({ notes: 'said "lock", twice', league: "=HYPERLINK(1)" })]));
    expect(line).toContain('"said ""lock"", twice"');
    expect(line).toContain("'=HYPERLINK(1)");
    // Signed lines and odds are numbers, not formulas.
    expect(line).toContain(",+3.5,-110,");
  });
});
