import { describe, expect, test } from "vitest";
import { estimateWeekDateRange } from "../../shared/nflWeek";

const inWindow = (w: { start: Date; end: Date }, iso: string) => {
  const t = new Date(iso).getTime();
  return t >= w.start.getTime() && t <= w.end.getTime();
};

describe("shared/nflWeek estimateWeekDateRange", () => {
  test("2026 Week 1 covers Thursday opener through Monday night only", () => {
    const w = estimateWeekDateRange(2026, 1);
    expect(w.start.toISOString()).toBe("2026-09-07T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2026-09-16T00:00:00.000Z");
    expect(inWindow(w, "2026-09-11T00:20:00Z")).toBe(true); // Thu night
    expect(inWindow(w, "2026-09-15T00:15:00Z")).toBe(true); // Mon night (UTC Tue)
    expect(inWindow(w, "2026-09-18T00:20:00Z")).toBe(false); // Week 2 Thu night
  });

  test("windows for consecutive weeks don't overlap", () => {
    for (let week = 1; week < 18; week++) {
      const cur = estimateWeekDateRange(2026, week);
      const next = estimateWeekDateRange(2026, week + 1);
      const nextThursdayNight = new Date(next.start);
      nextThursdayNight.setUTCDate(next.start.getUTCDate() + 4); // Fri 00:00 UTC = Thu evening ET
      expect(inWindow(cur, nextThursdayNight.toISOString())).toBe(false);
    }
  });

  test("a Wednesday Christmas game lands in the week it opens, not the one before", () => {
    // 2024 Week 17 opened with Wednesday Dec 25 games.
    expect(inWindow(estimateWeekDateRange(2024, 17), "2024-12-25T18:00:00Z")).toBe(true);
    expect(inWindow(estimateWeekDateRange(2024, 16), "2024-12-25T18:00:00Z")).toBe(false);
  });
});
