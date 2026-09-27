/**
 * Data fix: makes a season's weeks and games match the official nflverse
 * schedule (see server/services/seasonSchedule.ts).
 *
 * Why: in 2026 the whole season's games were filed under Week 1, and only
 * Weeks 1-2 existed. Scores never landed (the score sync matches by week),
 * the active week couldn't roll over, and Quick Picks / Open Parlays showed
 * the wrong week.
 *
 * Dry run (default, changes nothing):
 *   npm run repair:season-schedule -- --season 2026
 * Apply, then activate the week that's underway:
 *   npm run repair:season-schedule -- --season 2026 --apply --activate
 */
import { pool } from "../server/db";
import { storage } from "../server/storage";
import { syncSeasonSchedule } from "../server/services/seasonSchedule";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const activate = process.argv.includes("--activate");
  const allWeeks = await storage.getWeeks();
  const season = Number(arg("season") ?? Math.max(...allWeeks.map((w) => w.season)));

  const r = await syncSeasonSchedule(season, { apply });
  console.log(`${apply ? "APPLIED" : "DRY RUN"} for season ${season}`);
  console.log(`  weeks to create:  ${r.weeksCreated.length ? r.weeksCreated.join(", ") : "none"}`);
  console.log(`  already correct:  ${r.alreadyCorrect}`);
  console.log(`  moved:            ${r.moved.length}`);
  const byRoute = new Map<string, number>();
  for (const m of r.moved) byRoute.set(`Week ${m.fromWeek} → ${m.toWeek}`, (byRoute.get(`Week ${m.fromWeek} → ${m.toWeek}`) ?? 0) + 1);
  for (const [route, n] of byRoute) console.log(`    ${route}: ${n}`);
  console.log(`  duplicates merged: ${r.merged.length} (legs repointed: ${r.merged.reduce((s, m) => s + m.legsRepointed, 0)})`);
  console.log(`  missing, inserted: ${r.inserted}`);
  console.log(`  not on schedule:  ${r.unmatched.length}${r.unmatched.length ? " (left alone)" : ""}`);
  for (const u of r.unmatched) console.log(`    game ${u.gameId} ${u.matchup} (week ${u.week})`);
  console.log(`  legs on moved games in another week's parlay: ${r.crossWeekLegs}`);
  console.log(`  current week by schedule: ${r.currentWeekNumber ?? "season over"}`);

  if (activate) {
    if (!apply) {
      console.log("\n--activate ignored on a dry run.");
    } else if (r.currentWeekNumber != null) {
      const week = await storage.getWeekBySeasonAndNumber(season, r.currentWeekNumber);
      if (week) {
        await storage.setActiveWeek(week.id);
        console.log(`\nActivated ${week.label} (id=${week.id}).`);
      }
    }
  }
  if (!apply) console.log("\nNothing was changed. Re-run with --apply to write these changes.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
