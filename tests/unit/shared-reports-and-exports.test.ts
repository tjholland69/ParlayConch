import { describe, expect, test } from "vitest";
import { buildLocksReport, locksReportText } from "../../shared/locksReport";
import { buildParlayStory } from "../../shared/parlayStory";
import { legLookthroughLabel, propPickLabel } from "../../shared/formatPick";
import { legOrderMode, sortParlayLegs } from "../../shared/legOrder";
import { datasetToCsv, datasetToJson, datasetToMarkdown, datasetToXml, type Dataset } from "../../shared/dataExport";
import { buildAllocationReport, buildLoserReport, buildStandingsReport } from "../../shared/reports";
import { heroLabelText, HERO_LABELS } from "../../shared/leagueLabels";
import { openParlayPrompt } from "../../shared/weekParlays";
import { enabledChannels, wantsNotification } from "../../shared/notifications";
import { updateLeagueSettingsSchema, lieutenantPermissionsSchema } from "../../shared/routeValidation";

const game = { homeTeam: "Chiefs", awayTeam: "Bills", spread: "-3.5", overUnder: "47.5" };
const leg = (id: number, owner: string, result: string | null, extra: Record<string, unknown> = {}) => ({
  id, owner, result, betType: "spread", pick: "home", line: "-3.5", propType: null, game, ...extra,
});

describe("shared/locksReport", () => {
  const legs = [
    leg(1, "Zed", "win"),
    leg(2, "Amy", "win", { betType: "moneyline", pick: "away", line: "+150" }),
    leg(3, "Bo", "push", { betType: "over", pick: "over", line: "47.5" }),
  ];
  const build = (heroLegId: number | null) =>
    buildLocksReport({ legs, heroLegId, nameOf: (l) => l.owner, weekLabel: "2026 Week 5", heroLabel: "Hoss" });

  test("leads with the hero, then every other winning bet by name", () => {
    const report = build(1)!;
    expect(report.heroName).toBe("Zed");
    expect(report.locks.map((l) => l.name)).toEqual(["Zed", "Amy"]);
    expect(report.pushCount).toBe(1);
  });

  test("text version: locks, the hero by name only, short picks, and the push", () => {
    const lines = locksReportText(build(1)!).split("\n");
    expect(lines[0]).toBe("🔒 Week 5 Locks Report 🔒");
    expect(lines[1]).toBe("Hoss: Zed");
    expect(lines).toContain("• Amy: Bills ML (+150)");
    expect(lines[lines.length - 1]).toBe("…and 1 push that dropped off the ticket");
  });

  test("no report unless the parlay is a clean win with the hero among the winners", () => {
    expect(build(null)).toBeNull();
    expect(build(3)).toBeNull();
    expect(buildLocksReport({ legs: [...legs, leg(4, "Cal", "loss")], heroLegId: 1, nameOf: (l) => l.owner, weekLabel: "W", heroLabel: "H" })).toBeNull();
    expect(buildLocksReport({ legs: [...legs, leg(4, "Cal", null)], heroLegId: 1, nameOf: (l) => l.owner, weekLabel: "W", heroLabel: "H" })).toBeNull();
  });

  test("buildParlayStory picks the report from which leg it's given", () => {
    const base = { legs, nameOf: (l: (typeof legs)[number]) => l.owner, weekLabel: "Week 5", heroLabel: "hoss" };
    const locks = buildParlayStory({ ...base, heroLegId: 1 })!;
    expect(locks.kind).toBe("locks");
    expect(locks.leadLabel).toBe("Hoss");
    const lost = [leg(1, "Zed", "loss"), leg(2, "Amy", "win")];
    const shame = buildParlayStory({ legs: lost, nameOf: (l) => l.owner, weekLabel: "Week 5", bustedLegId: 1, loserLabel: "asshole", shameEmoji: "💩" })!;
    expect(shame.kind).toBe("shame");
    expect(shame.leadLabel).toBe("Asshole");
    expect(shame.emoji).toBe("💩");
    expect(shame.text.split("\n")[1]).toBe("Asshole: Zed");
  });
});

describe("shared/leagueLabels", () => {
  test("Hoss is a hero label the settings route accepts", () => {
    expect(HERO_LABELS).toContain("hoss");
    expect(heroLabelText("hoss")).toBe("Hoss");
    expect(heroLabelText("nope")).toBe("Parlay Hero");
    expect(updateLeagueSettingsSchema.safeParse({ heroLabel: "hoss", shameEmoji: "💩" }).success).toBe(true);
    expect(updateLeagueSettingsSchema.safeParse({ heroLabel: "boss" }).success).toBe(false);
    expect(updateLeagueSettingsSchema.safeParse({ shameEmoji: null }).success).toBe(true);
  });

  test("a permissions form from before pickOnBehalf existed still saves, with it off", () => {
    const parsed = lieutenantPermissionsSchema.parse({
      approveRejectParlays: true, editParlays: false, lockParlay: true, unlockParlay: false,
      unselectUserPick: false, approveMemberInvites: false, importHistory: false,
    });
    expect(parsed.pickOnBehalf).toBe(false);
  });
});

describe("shared/formatPick lookthrough labels", () => {
  const prop = (propType: string, pick: string, line: string | null) =>
    ({ betType: "player_prop", pick, line, propType, playerName: "Lamar Jackson" });

  test("prop types read as short proper-cased stats, never snake_case", () => {
    expect(propPickLabel(prop("rec_yards", "over", "54.5"))).toBe("Rec Yds O 54.5");
    expect(propPickLabel(prop("interceptions", "under", "0.5"))).toBe("Ints U 0.5");
    expect(propPickLabel(prop("rush_yards", "over", "25"))).toBe("Rush Yds O 25");
    expect(propPickLabel(prop("pass_yards", "under", "249.5"))).toBe("Pass Yds U 249.5");
    expect(propPickLabel(prop("receptions", "over", "4.5"))).toBe("Recs O 4.5");
    expect(propPickLabel(prop("longest_rush", "over", "14.5"))).toBe("Longest Rush O 14.5");
  });

  test("anytime TD: ATD for one, a count for two or more", () => {
    expect(propPickLabel(prop("anytime_td", "yes", "1"))).toBe("ATD");
    expect(propPickLabel(prop("anytime_td", "yes", null))).toBe("ATD");
    expect(propPickLabel(prop("anytime_td", "yes", "2"))).toBe("2 ATDs");
    expect(propPickLabel(prop("anytime_td", "no", null))).toBe("No ATD");
  });

  test("the player comes first; spread and moneyline on one team never read alike", () => {
    expect(legLookthroughLabel(prop("rush_yards", "over", "25"))).toBe("Lamar Jackson - Rush Yds O 25");
    const spread = legLookthroughLabel({ betType: "spread", pick: "home", line: "-3.5", propType: null }, game);
    const moneyline = legLookthroughLabel({ betType: "moneyline", pick: "home", line: "-180", propType: null }, game);
    expect(spread).toBe("Chiefs (Spread -3.5)");
    expect(moneyline).toBe("Chiefs (Moneyline -180)");
    expect(legLookthroughLabel({ betType: "under", pick: "under", line: "47.5", propType: null }, game)).toBe("Under 47.5 (Total)");
  });
});

describe("shared/legOrder", () => {
  const now = new Date("2026-10-11T18:00:00Z");
  const g = (gameTime: string, extra: Record<string, unknown> = {}) => ({ gameTime, isFinished: false, ...extra });
  const future = "2026-10-11T20:00:00Z";

  test("before kickoff, legs are in the order they were picked", () => {
    const parlay = {
      status: "pending",
      legs: [
        { id: 3, createdAt: "2026-10-07T10:00:00Z", game: g("2026-10-12T00:20:00Z") },
        { id: 1, createdAt: "2026-10-08T10:00:00Z", game: g(future) },
        { id: 2, createdAt: "2026-10-07T12:00:00Z", game: g("2026-10-11T21:25:00Z") },
      ],
    };
    expect(legOrderMode(parlay, now)).toBe("picked");
    expect(sortParlayLegs(parlay, now).map((l) => l.id)).toEqual([3, 2, 1]);
  });

  test("legs saved before picks were timestamped fall back to id order", () => {
    const same = "2026-10-07T00:00:00Z";
    const parlay = { status: "draft", legs: [{ id: 9, createdAt: same }, { id: 4, createdAt: same }, { id: 6, createdAt: same }] };
    expect(sortParlayLegs(parlay, now).map((l) => l.id)).toEqual([4, 6, 9]);
  });

  test("once a game starts: settled legs by when they were decided, the rest by kickoff", () => {
    const parlay = {
      status: "approved",
      legs: [
        { id: 1, createdAt: "2026-10-07T10:00:00Z", result: null, game: g("2026-10-12T00:20:00Z") },
        { id: 2, createdAt: "2026-10-07T11:00:00Z", result: "win", decidedAt: "2026-10-11T19:40:00Z", game: g("2026-10-11T17:00:00Z", { isFinished: true }) },
        { id: 3, createdAt: "2026-10-07T12:00:00Z", result: "win", decidedAt: "2026-10-11T18:10:00Z", game: g("2026-10-11T17:00:00Z", { isFinished: true }) },
        { id: 4, createdAt: "2026-10-07T09:00:00Z", result: null, game: g("2026-10-11T20:25:00Z") },
      ],
    };
    expect(legOrderMode(parlay, now)).toBe("timeline");
    expect(sortParlayLegs(parlay, now).map((l) => l.id)).toEqual([3, 2, 4, 1]);
  });

  test("an open parlay stays in picked order even if a game has kicked off", () => {
    const parlay = { status: "draft", legs: [{ id: 2, createdAt: "2026-10-07T12:00:00Z", game: g("2026-10-11T17:00:00Z") }] };
    expect(legOrderMode(parlay, now)).toBe("picked");
  });
});

describe("shared/dataExport", () => {
  const data: Dataset = {
    name: "league_standings",
    title: "The Boys standings",
    description: "One row per member.",
    generatedAt: "2026-10-07T00:00:00.000Z",
    scope: { league: "The Boys", season: 2026 },
    columns: [
      { key: "member", label: "Member", type: "string", description: "League member." },
      { key: "wins", label: "Wins", type: "number", description: "Bets won." },
    ],
    rows: [{ member: "Tom & <Jerry>", wins: 3 }, { member: "A|B", wins: null }],
  };

  test("JSON carries the column descriptions and a row count", () => {
    const parsed = JSON.parse(datasetToJson(data));
    expect(parsed.dataset).toBe("league_standings");
    expect(parsed.row_count).toBe(2);
    expect(parsed.columns[1]).toEqual({ key: "wins", label: "Wins", type: "number", description: "Bets won." });
    expect(parsed.rows[1]).toEqual({ member: "A|B", wins: null });
  });

  test("XML escapes values and names each field by its column key", () => {
    const xml = datasetToXml(data);
    expect(xml).toContain('<dataset name="league_standings" generated_at="2026-10-07T00:00:00.000Z" row_count="2">');
    expect(xml).toContain("<member>Tom &amp; &lt;Jerry&gt;</member>");
    expect(xml).toContain("<wins></wins>");
    expect(xml).toContain('<column key="wins" label="Wins" type="number">Bets won.</column>');
  });

  test("Markdown is a titled table with a column glossary, pipes escaped", () => {
    const md = datasetToMarkdown(data);
    expect(md.startsWith("# The Boys standings\n")).toBe(true);
    expect(md).toContain("| Member | Wins |");
    expect(md).toContain("| --- | ---: |");
    expect(md).toContain("| A\\|B |  |");
    expect(md).toContain("- **Wins** (`wins`, number): Bets won.");
  });

  test("CSV has a key header and a BOM", () => {
    const csv = datasetToCsv(data);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split("\r\n")[0]).toBe("member,wins");
  });
});

describe("shared/reports", () => {
  const now = new Date("2026-10-07T00:00:00Z");

  test("standings rank by win rate and chart it", () => {
    const stat = (username: string, wins: number, losses: number) =>
      ({ username, wins, losses, pushes: 0, winRate: (wins / (wins + losses)) * 100, powerScore: 1, participationRate: 1, bar: 0 });
    const report = buildStandingsReport({
      id: "standings_season", leagueName: "The Boys", scopeLabel: "Current Year", season: 2026,
      standings: [stat("Bo", 2, 6), stat("Amy", 6, 2)], now,
    });
    expect(report.dataset.rows.map((r) => r.member)).toEqual(["Amy", "Bo"]);
    expect(report.chart.bars[0]).toEqual({ label: "Amy", value: 75, display: "75%" });
    expect(report.text.split("\n")[0]).toBe("🏆 The Boys · Current Year");
  });

  test("the loser report lists every week and tallies who was named", () => {
    const report = buildLoserReport({
      leagueName: "The Boys", season: 2026, loserLabel: "Asshole", now,
      weeks: [
        { weekNumber: 2, weekLabel: "Week 2", parlayId: 11, loserName: null, pick: null, parlayStatus: "win" },
        { weekNumber: 1, weekLabel: "Week 1", parlayId: 10, loserName: "Zed", pick: "Chiefs -3.5", parlayStatus: "loss" },
        { weekNumber: 3, weekLabel: "Week 3", parlayId: 12, loserName: "Zed", pick: "Lamar (Rush O25)", parlayStatus: "loss" },
      ],
    });
    const lines = report.text.split("\n");
    expect(lines[0]).toBe("🚨 The Boys · 2026 Asshole Report 🚨");
    expect(lines[1]).toBe("Wk 1: Zed (Chiefs -3.5)");
    expect(lines[2]).toBe("Wk 2: nobody (parlay won)");
    expect(lines[lines.length - 1]).toBe("Tally: Zed 2");
    expect(report.chart.bars).toEqual([{ label: "Zed", value: 2, display: "2" }]);
    expect(report.dataset.columns.find((c) => c.key === "member")?.label).toBe("Asshole");
  });

  test("allocation breaks bets out by type with each type's record", () => {
    const report = buildAllocationReport({
      leagueName: "The Boys", scopeLabel: "Current Year", season: 2026, now,
      legs: [
        { betType: "spread", result: "win" }, { betType: "spread", result: "loss" },
        { betType: "player_prop", result: "win" }, { betType: "spread", result: null },
      ],
    });
    expect(report.dataset.rows[0]).toMatchObject({ bet_type: "spread", bets: 3, share_pct: 75, wins: 1, losses: 1, pending: 1, win_rate_pct: 50 });
    expect(report.dataset.rows[1]).toMatchObject({ bet_type: "player_prop", bets: 1, win_rate_pct: 100 });
    expect(report.text).toContain("Spread: 3 (75%) · 1-1 (50%)");
  });
});

describe("shared/weekParlays openParlayPrompt", () => {
  const base = { allSubmitted: false, currentUserNeedsPick: true, openParlayLegCount: 2, submittedCount: 2, totalMembers: 5 };

  test("asks for a pick only from a member who owes one", () => {
    expect(openParlayPrompt(base)).toMatchObject({ detail: "Make your pick · 2 legs in", action: "Pick" });
    expect(openParlayPrompt({ ...base, currentUserNeedsPick: false, submittedCount: 3 }))
      .toMatchObject({ headline: "Parlay is Open!", detail: "Your pick is in · waiting on 2 more", action: "View" });
  });

  test("reads Ready to Lock once everyone is in", () => {
    expect(openParlayPrompt({ ...base, allSubmitted: true, currentUserNeedsPick: false, openParlayLegCount: 5, submittedCount: 5 }))
      .toMatchObject({ headline: "Ready to Lock", ready: true });
  });
});

describe("shared/notifications", () => {
  test("alerts follow their default until the member says otherwise", () => {
    expect(wantsNotification(null, "parlay_busted")).toBe(true);
    expect(wantsNotification(null, "slate_summary")).toBe(false);
    expect(wantsNotification({ email: false, sms: false, push: false, events: { parlay_busted: false, slate_summary: true } }, "parlay_busted")).toBe(false);
    expect(wantsNotification({ email: false, sms: false, push: false, events: { slate_summary: true } }, "slate_summary")).toBe(true);
  });

  test("alerts that need an answer can't be switched off", () => {
    expect(wantsNotification({ email: false, sms: false, push: false, events: { pick_on_behalf: false } }, "pick_on_behalf")).toBe(true);
  });

  test("text only counts as a channel with a phone number", () => {
    expect(enabledChannels({ email: true, sms: true, push: false })).toEqual(["email"]);
    expect(enabledChannels({ email: false, sms: true, push: true, phone: "+15551212" })).toEqual(["sms", "push"]);
  });
});
