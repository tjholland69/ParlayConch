import { describe, expect, test } from "vitest";
import {
  DEV_ACTIVE_WEEK_GAMES,
  devWeekKickoff,
  isSlateStale,
  upcomingGameSunday,
  wholeWeekShiftMs,
} from "../../scripts/lib/dev-week-schedule";
import { getSlate } from "../../shared/slate";

const DAY = 24 * 60 * 60 * 1000;
const eastern = (d: Date, opts: Intl.DateTimeFormatOptions) =>
  d.toLocaleString("en-US", { timeZone: "America/New_York", ...opts });

describe("scripts/lib/dev-week-schedule", () => {
  // One "now" on each side of the autumn daylight-saving change, plus a
  // Saturday night, when the nearest Sunday is too close to use.
  const nows = [
    new Date("2026-10-02T04:30:00Z"), // Friday, daylight time
    new Date("2026-10-04T03:00:00Z"), // Saturday 11pm ET
    new Date("2026-10-30T15:00:00Z"), // slate straddles the Nov 1 change
    new Date("2026-12-29T12:00:00Z"), // standard time, slate crosses New Year
  ];

  test("every seed game kicks off in the future, at its Eastern clock time", () => {
    for (const now of nows) {
      for (const game of DEV_ACTIVE_WEEK_GAMES) {
        const kickoff = devWeekKickoff(game, now);
        expect(kickoff.getTime()).toBeGreaterThan(now.getTime());
        expect(kickoff.getTime()).toBeLessThan(now.getTime() + 10 * DAY);
        expect(eastern(kickoff, { hour: "2-digit", minute: "2-digit", hour12: false }).replace(/^24/, "00"))
          .toBe(`${String(game.hourET).padStart(2, "0")}:${String(game.minuteET).padStart(2, "0")}`);
        expect(eastern(kickoff, { weekday: "short" })).toBe({ sat: "Sat", sun: "Sun", mon: "Mon" }[game.day]);
      }
    }
  });

  test("the anchor is a Sunday at least two days out", () => {
    for (const now of nows) {
      const sunday = upcomingGameSunday(now);
      expect(sunday.weekday).toBe("Sun");
      const noonUtc = Date.UTC(sunday.year, sunday.month - 1, sunday.day, 12);
      expect(noonUtc - now.getTime()).toBeGreaterThan(1.5 * DAY);
    }
  });

  test("the slate covers every betting window and includes the Commanders", () => {
    const now = nows[0];
    const slates = new Set(DEV_ACTIVE_WEEK_GAMES.map((g) => `${g.day} ${getSlate(devWeekKickoff(g, now))}`));
    expect(slates).toEqual(new Set(["sat Afternoon Slate", "sun Early Slate", "sun Afternoon Slate", "sun Primetime", "mon Primetime"]));
    expect(DEV_ACTIVE_WEEK_GAMES.some((g) => g.awayTeam === "Commanders" || g.homeTeam === "Commanders")).toBe(true);
    const matchups = DEV_ACTIVE_WEEK_GAMES.map((g) => `${g.awayTeam}@${g.homeTeam}`);
    expect(new Set(matchups).size).toBe(matchups.length);
  });

  test("wholeWeekShiftMs moves stale kickoffs forward by whole weeks only", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const stale = [new Date("2026-08-29T18:00:00Z"), new Date("2026-08-29T23:20:00Z")];
    const shift = wholeWeekShiftMs(stale, now);
    expect(shift % (7 * DAY)).toBe(0);
    const moved = stale.map((k) => new Date(k.getTime() + shift));
    expect(moved[0].toISOString()).toBe("2026-10-03T18:00:00.000Z");
    expect(moved[1].getTime() - moved[0].getTime()).toBe(stale[1].getTime() - stale[0].getTime());
    // Already comfortably in the future — left where it is.
    expect(wholeWeekShiftMs([new Date("2026-10-10T18:00:00Z")], now)).toBe(0);
    expect(wholeWeekShiftMs([], now)).toBe(0);
  });

  test("isSlateStale is true only when nothing is left to pick", () => {
    const now = new Date("2026-10-02T12:00:00Z");
    const past = { gameTime: new Date("2026-09-27T17:00:00Z"), isFinished: false };
    const final = { gameTime: new Date("2026-10-04T17:00:00Z"), isFinished: true };
    const upcoming = { gameTime: new Date("2026-10-04T17:00:00Z"), isFinished: false };
    expect(isSlateStale([past, final], now)).toBe(true);
    expect(isSlateStale([past, upcoming], now)).toBe(false);
    expect(isSlateStale([{ gameTime: null, isFinished: false }], now)).toBe(false);
    expect(isSlateStale([], now)).toBe(false);
  });
});
