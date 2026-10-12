import { describe, expect, test } from "vitest";
import { estimatedParlayDecimal, parlayOdds, parlayOddsText, parseActualOdds } from "../../shared/parlayOdds";
import { gameVenueLabel, neutralVenueLabel } from "../../shared/stadiums";
import { formatPhone, normalizePhone } from "../../shared/phone";
import { buildOpenParlaysReport, isReportId, reportCatalog } from "../../shared/reports";

describe("shared/parlayOdds", () => {
  test("what a member types for the ticket's odds is stored as signed American odds", () => {
    expect(parseActualOdds("+650")).toBe("+650");
    expect(parseActualOdds("650")).toBe("+650");
    expect(parseActualOdds(" -120 ")).toBe("-120");
    expect(parseActualOdds("+ 1250")).toBe("+1250");
  });

  test("anything that isn't American odds is refused", () => {
    // American odds are never between -100 and +100.
    for (const bad of ["", "50", "-99", "6.5", "+650x", "even", "7/2", "+6500000"]) expect(parseActualOdds(bad)).toBeNull();
    expect(parseActualOdds(null)).toBeNull();
  });

  test("the estimate multiplies the legs' posted odds and applies the boost", () => {
    // Two -110 legs: 1.909 x 1.909 = 3.645, which is +264.
    expect(parlayOdds({ legs: [{ odds: "-110" }, { odds: "-110" }] })).toMatchObject({ label: "+264", estimated: true });
    // A 50% boost raises the winnings, not the stake: 1 + 2.645 x 1.5 = 4.967.
    expect(estimatedParlayDecimal([{ odds: "-110" }, { odds: "-110" }], 50)).toBeCloseTo(4.967, 2);
    // A leg without odds is left out; a parlay with none has no estimate.
    expect(parlayOdds({ legs: [{ odds: "+150" }, { odds: null }] })?.label).toBe("+150");
    expect(parlayOdds({ legs: [{ odds: null }] })).toBeNull();
    expect(parlayOdds({ legs: [] })).toBeNull();
  });

  test("odds recorded off the ticket win over the estimate", () => {
    const odds = parlayOdds({ actualOdds: "+612", boostPct: 25, legs: [{ odds: "-110" }, { odds: "-110" }] });
    expect(odds).toMatchObject({ label: "+612", estimated: false });
    expect(odds!.decimal).toBeCloseTo(7.12);
    expect(parlayOddsText(odds)).toBe("+612");
    expect(parlayOddsText(parlayOdds({ legs: [{ odds: "-110" }, { odds: "-110" }] }))).toBe("+264 est.");
    expect(parlayOddsText(null)).toBeNull();
  });
});

describe("shared/stadiums", () => {
  test("a home game is at the home team's stadium", () => {
    expect(gameVenueLabel({ homeTeam: "Patriots" })).toBe("Gillette Stadium - Foxborough, MA");
    expect(gameVenueLabel({ homeTeam: "Jets", venue: null })).toBe("MetLife Stadium - East Rutherford, NJ");
    expect(gameVenueLabel({ homeTeam: "Not A Team" })).toBeNull();
  });

  test("a game moved somewhere else shows where it's really played", () => {
    expect(gameVenueLabel({ homeTeam: "Jaguars", venue: "Wembley Stadium - London, UK" })).toBe("Wembley Stadium - London, UK");
  });

  test("the schedule's name for an international stadium becomes a venue line", () => {
    expect(neutralVenueLabel("Jaguars", "Tottenham Stadium")).toBe("Tottenham Hotspur Stadium - London, UK");
    expect(neutralVenueLabel("Falcons", "Bernabeu")).toBe("Santiago Bernabéu - Madrid, Spain");
    expect(neutralVenueLabel("Lions", "FC Bayern Munich Stadium")).toBe("Allianz Arena - Munich, Germany");
    expect(neutralVenueLabel("49ers", "Estadio Banorte")).toBe("Estadio Banorte - Mexico City, Mexico");
    expect(neutralVenueLabel("Rams", "Melbourne Cricket Ground")).toBe("Melbourne Cricket Ground - Melbourne, Australia");
  });

  test("a U.S. game at another team's stadium names that stadium; an unknown one keeps the schedule's name", () => {
    expect(neutralVenueLabel("Bills", "Ford Field")).toBe("Ford Field - Detroit, MI");
    expect(neutralVenueLabel("Bills", "Highmark Stadium")).toBeNull();
    expect(neutralVenueLabel("Bills", "Some New Dome")).toBe("Some New Dome");
    expect(neutralVenueLabel("Bills", "")).toBeNull();
  });
});

describe("shared/phone", () => {
  test("a bare 10-digit number is taken as +1, however it's punctuated", () => {
    expect(normalizePhone("(508) 555-1234")).toBe("+15085551234");
    expect(normalizePhone("508.555.1234")).toBe("+15085551234");
    expect(normalizePhone("1 508 555 1234")).toBe("+15085551234");
  });

  test("other countries need their code with a leading +", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("44 20 7946 0958")).toBeNull();
  });

  test("anything else isn't a number", () => {
    for (const bad of ["", "555-1234", "call me", "+12", "+1234567890123456"]) expect(normalizePhone(bad)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  test("a +1 number reads the familiar way; others show as stored", () => {
    expect(formatPhone("+15085551234")).toBe("(508) 555-1234");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
    expect(formatPhone(null)).toBe("");
  });
});

describe("shared/reports: open parlays", () => {
  const now = new Date("2026-10-08T16:00:00Z"); // Thursday noon ET
  const games = [{ gameTime: "2026-10-09T00:15:00Z" }, { gameTime: "2026-10-11T17:00:00Z" }];

  test("it's in the catalogue", () => {
    expect(isReportId("open_parlays")).toBe(true);
    expect(reportCatalog("Jerry").map((r) => r.id)).toContain("open_parlays");
  });

  test("one row per member: their pick and when it was saved, or Open", () => {
    const report = buildOpenParlaysReport({
      leagueName: "Kirk",
      now,
      parlays: [{
        parlayId: 7,
        weekLabel: "Week 5",
        legs: [{ owner: "Amy", bet: "49ers +6.5", pickedAt: "2026-10-07T12:00:00Z" }, { owner: "Bo", bet: "Bills ML", pickedAt: null }],
        missing: ["Cal"],
        games,
      }],
    });
    expect(report.dataset.rows).toEqual([
      { week: "Week 5", parlay_id: 7, member: "Amy", status: "In", bet: "49ers +6.5", picked_at: "2026-10-07T12:00:00.000Z" },
      { week: "Week 5", parlay_id: 7, member: "Bo", status: "In", bet: "Bills ML", picked_at: null },
      { week: "Week 5", parlay_id: 7, member: "Cal", status: "Open", bet: null, picked_at: null },
    ]);
    expect(report.chart).toMatchObject({ max: 3, bars: [{ label: "Week 5", value: 2, display: "2/3" }] });
    // The text is the reminder: who's in, who isn't, and the countdown.
    expect(report.text).toContain("Kirk · Week 5 parlay is open");
    expect(report.text).toContain("3d 1h until the first non-Thursday kickoff");
    expect(report.text).toContain("• Amy - 49ers +6.5");
    expect(report.text).toContain("Still need a pick (1): Cal");
  });

  test("with nothing open it says so", () => {
    const report = buildOpenParlaysReport({ leagueName: "Kirk", parlays: [], now });
    expect(report.dataset.rows).toEqual([]);
    expect(report.chart.bars).toEqual([]);
    expect(report.text).toContain("No parlay is open for picks right now.");
  });
});
