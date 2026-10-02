import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../db";
import { games, parlayLegs, parlays, weeks } from "@shared/db-schema";
import {
  abbrevToShort,
  fetchCsv,
  homeSpreadFromNflverse,
  schedulesUrl,
  zonedWallTimeToUtc,
  type NflverseScheduleRow,
} from "./nflverse";

export type SeasonScheduleReport = {
  season: number;
  applied: boolean;
  weeksCreated: number[];
  /** Games already filed under the right week. */
  alreadyCorrect: number;
  /** Games moved to the week the official schedule puts them in. */
  moved: { gameId: number; matchup: string; fromWeek: number; toWeek: number }[];
  /** Extra copies of the same matchup, removed after pointing their legs at the kept copy. */
  merged: { removedGameId: number; keptGameId: number; matchup: string; legsRepointed: number }[];
  /** Schedule games we didn't have at all. */
  inserted: number;
  /** Games in our DB for this season that the schedule doesn't list. Left alone. */
  unmatched: { gameId: number; matchup: string; week: number }[];
  /** Legs on moved games that sit in a parlay for a different week. Informational. */
  crossWeekLegs: number;
  /** Week whose games are underway or next up, by the schedule. */
  currentWeekNumber: number | null;
};

/**
 * Makes one season's weeks and games match the official nflverse schedule:
 * creates any missing week rows, moves games filed under the wrong week,
 * merges duplicate copies of a matchup (repointing legs), and inserts games
 * we're missing. With `apply: false` it only reports what it would do.
 *
 * Matchups are keyed on (home, away): in the regular season a pair meets at
 * most once per venue, so the key is unique per season.
 */
export async function syncSeasonSchedule(season: number, opts: { apply: boolean }): Promise<SeasonScheduleReport> {
  const rows = ((await fetchCsv(schedulesUrl())) as unknown as NflverseScheduleRow[]).filter(
    (r) => r.game_type === "REG" && parseInt(r.season) === season && r.home_team && r.away_team,
  );
  if (rows.length === 0) throw new Error(`No regular-season schedule published for ${season}`);

  const key = (home: string, away: string) => `${home}|${away}`;
  const scheduleByKey = new Map(rows.map((r) => [key(abbrevToShort(r.home_team), abbrevToShort(r.away_team)), r]));
  const weekNumbers = [...new Set(rows.map((r) => parseInt(r.week)))].sort((a, b) => a - b);

  const report: SeasonScheduleReport = {
    season, applied: opts.apply, weeksCreated: [], alreadyCorrect: 0, moved: [], merged: [],
    inserted: 0, unmatched: [], crossWeekLegs: 0, currentWeekNumber: null,
  };

  const now = Date.now();
  const kickoff = (r: NflverseScheduleRow) =>
    r.gameday ? zonedWallTimeToUtc(r.gameday, r.gametime || "13:00", "America/New_York") : null;
  // Current week = the first week with a game that hasn't finished (~4h after kickoff).
  report.currentWeekNumber = weekNumbers.find((n) =>
    rows.some((r) => parseInt(r.week) === n && (kickoff(r)?.getTime() ?? Infinity) + 4 * 3600_000 > now),
  ) ?? null;

  await db.transaction(async (tx) => {
    const seasonWeeks = await tx.select().from(weeks).where(eq(weeks.season, season));
    const weekIdByNumber = new Map(seasonWeeks.map((w) => [w.weekNumber, w.id]));
    const weekNumberById = new Map(seasonWeeks.map((w) => [w.id, w.weekNumber]));
    // In a dry run, missing weeks get placeholder ids so the rest can be planned.
    let placeholderId = -1;
    for (const n of weekNumbers) {
      if (weekIdByNumber.has(n)) continue;
      report.weeksCreated.push(n);
      let id = placeholderId--;
      if (opts.apply) {
        [{ id }] = await tx.insert(weeks)
          .values({ season, weekNumber: n, label: `${season} Week ${n}`, isActive: false })
          .returning({ id: weeks.id });
      }
      weekIdByNumber.set(n, id);
      weekNumberById.set(id, n);
    }

    const existing = seasonWeeks.length
      ? await tx.select().from(games).where(inArray(games.weekId, seasonWeeks.map((w) => w.id)))
      : [];
    const byKey = new Map<string, typeof existing>();
    for (const g of existing) {
      const k = key(g.homeTeam, g.awayTeam);
      byKey.set(k, [...(byKey.get(k) ?? []), g]);
    }

    for (const [k, copies] of byKey) {
      const row = scheduleByKey.get(k);
      if (!row) {
        for (const g of copies) {
          report.unmatched.push({ gameId: g.id, matchup: k, week: weekNumberById.get(g.weekId) ?? 0 });
        }
        continue;
      }
      const targetWeek = parseInt(row.week);
      const targetWeekId = weekIdByNumber.get(targetWeek)!;
      // Keep the copy already in the right week if there is one, else the oldest.
      const kept = copies.find((g) => g.weekId === targetWeekId) ?? [...copies].sort((a, b) => a.id - b.id)[0];

      for (const extra of copies.filter((g) => g.id !== kept.id)) {
        const legs = await tx.select({ id: parlayLegs.id }).from(parlayLegs).where(eq(parlayLegs.gameId, extra.id));
        if (opts.apply) {
          if (legs.length) await tx.update(parlayLegs).set({ gameId: kept.id }).where(eq(parlayLegs.gameId, extra.id));
          await tx.delete(games).where(eq(games.id, extra.id));
        }
        report.merged.push({ removedGameId: extra.id, keptGameId: kept.id, matchup: k, legsRepointed: legs.length });
      }

      if (kept.weekId === targetWeekId) {
        report.alreadyCorrect++;
        continue;
      }
      report.moved.push({
        gameId: kept.id, matchup: k, fromWeek: weekNumberById.get(kept.weekId) ?? 0, toWeek: targetWeek,
      });
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(parlayLegs)
        .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
        .where(and(eq(parlayLegs.gameId, kept.id), ne(parlays.weekId, targetWeekId)));
      report.crossWeekLegs += Number(n ?? 0);
      if (opts.apply) await tx.update(games).set({ weekId: targetWeekId }).where(eq(games.id, kept.id));
    }

    for (const [k, row] of scheduleByKey) {
      if (byKey.has(k)) continue;
      report.inserted++;
      if (!opts.apply) continue;
      const [homeTeam, awayTeam] = k.split("|");
      const total = parseFloat(row.total_line);
      await tx.insert(games).values({
        weekId: weekIdByNumber.get(parseInt(row.week))!,
        homeTeam,
        awayTeam,
        spread: homeSpreadFromNflverse(row.spread_line),
        overUnder: Number.isNaN(total) ? null : total.toString(),
        moneylineHome: row.home_moneyline || null,
        moneylineAway: row.away_moneyline || null,
        gameTime: kickoff(row),
        isFinished: false,
      });
    }
  });

  return report;
}
