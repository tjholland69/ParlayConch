/**
 * Data fix: games.spread values imported from nflverse were stored with the
 * sign flipped. nflverse's `spread_line` is positive when the HOME team is
 * favored; games.spread is the home team's line the way a sportsbook prints
 * it, favorites negative. So a 3-point home favorite was saved as "3"
 * instead of "-3". (New imports are already correct: homeSpreadFromNflverse.)
 *
 * What it does, per season, against the official nflverse schedule:
 *   1. Games: a stored spread that is exactly the schedule's line with the
 *      wrong sign is flipped. A spread that already matches is left alone.
 *      A spread with a different number (a live Odds API line) is only
 *      reported, never changed, since a real line can sit on either side.
 *   2. Legs (only with --legs): spread legs on a flipped game whose own line
 *      equals the old, wrong value for their side were prefilled from the bad
 *      spread. Their line is corrected and the result re-graded. Legs picked
 *      off the live board ("+3 (-110)") and legs with any other line are
 *      left alone.
 *
 * Dry run (default, changes nothing):
 *   npm run repair:spread-signs
 * Apply the game fix, or the game fix plus the leg re-grade:
 *   npm run repair:spread-signs -- --apply
 *   npm run repair:spread-signs -- --apply --legs
 * One season only: add `--season 2024`. Against production, prefix with
 * `railway run`.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db, pool } from "../server/db";
import { games, parlayLegs, parlays, weeks } from "../shared/db-schema";
import { storage } from "../server/storage";
import {
  abbrevToShort, fetchCsv, homeSpreadFromNflverse, schedulesUrl, type NflverseScheduleRow,
} from "../server/services/nflverse";
import { calculateLegResult } from "../server/services/legEnrich";

const APPLY = process.argv.includes("--apply");
const FIX_LEGS = process.argv.includes("--legs");
const seasonArg = process.argv.indexOf("--season");
const ONLY_SEASON = seasonArg >= 0 ? Number(process.argv[seasonArg + 1]) : null;

/** The picked team's side of a home spread, as a number. */
const sideSpread = (pick: string, homeSpread: number) => (pick === "away" ? -homeSpread : homeSpread);
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

async function main() {
  console.log(`${APPLY ? "APPLYING" : "DRY RUN"}${FIX_LEGS ? " (games and legs)" : " (games only; legs are reported)"}`);

  const schedule = (await fetchCsv(schedulesUrl())) as unknown as NflverseScheduleRow[];
  const lineByKey = new Map<string, string>();
  for (const r of schedule) {
    if (!r.home_team || !r.away_team) continue;
    lineByKey.set(`${r.season}|${parseInt(r.week)}|${abbrevToShort(r.home_team)}|${abbrevToShort(r.away_team)}`, r.spread_line);
  }

  const rows = await db.select({ game: games, week: weeks }).from(games).innerJoin(weeks, eq(games.weekId, weeks.id));
  const flipped: { id: number; label: string; from: string; to: string; oldHome: number; newHome: number }[] = [];
  const differs: { game_id: number; game: string; stored: string; nflverse_close: string }[] = [];
  let correct = 0, noSpread = 0, notOnSchedule = 0;

  for (const { game, week } of rows) {
    if (ONLY_SEASON != null && week.season !== ONLY_SEASON) continue;
    const label = `${week.season} wk ${week.weekNumber} ${game.awayTeam} @ ${game.homeTeam}`;
    const stored = parseFloat(game.spread ?? "");
    if (Number.isNaN(stored)) { noSpread++; continue; }
    const line = lineByKey.get(`${week.season}|${week.weekNumber}|${game.homeTeam}|${game.awayTeam}`);
    const right = homeSpreadFromNflverse(line);
    if (right == null) { notOnSchedule++; continue; }
    const rightNum = parseFloat(right);

    if (stored === rightNum) { correct++; continue; }
    if (stored === -rightNum) {
      flipped.push({ id: game.id, label, from: game.spread!, to: right, oldHome: stored, newHome: rightNum });
      continue;
    }
    // A different number altogether: only worth a look when it also names the other favorite.
    if (stored !== 0 && rightNum !== 0 && Math.sign(stored) !== Math.sign(rightNum)) {
      differs.push({ game_id: game.id, game: label, stored: game.spread!, nflverse_close: right });
    }
  }

  console.log(`\nGames: ${correct} already correct, ${flipped.length} with the sign flipped, ${noSpread} with no spread, ${notOnSchedule} not on the nflverse schedule.`);
  if (flipped.length) console.table(flipped.map(f => ({ game_id: f.id, game: f.label, stored: f.from, corrected: f.to })));
  if (differs.length) {
    console.log(`\n${differs.length} game(s) have a different line that favors the other team than nflverse's closing line. Left alone; check by hand:`);
    console.table(differs);
  }

  // Legs that took their line from the wrong spread.
  const legRows = flipped.length
    ? await db.select({ leg: parlayLegs, game: games }).from(parlayLegs)
        .innerJoin(games, eq(parlayLegs.gameId, games.id))
        .where(and(eq(parlayLegs.betType, "spread"), inArray(parlayLegs.gameId, flipped.map(f => f.id))))
    : [];
  const byGame = new Map(flipped.map(f => [f.id, f]));
  const legFixes: { legId: number; parlayId: number; line: string; result: "win" | "loss" | "push" | null; changed: boolean }[] = [];
  const legReport: Record<string, unknown>[] = [];
  let legsLeftAlone = 0;

  for (const { leg, game } of legRows) {
    const fix = byGame.get(game.id)!;
    const isHomeOrAway = leg.pick === "home" || leg.pick === "away";
    const fromLiveBoard = !!leg.line && leg.line.includes("(");
    const lineNum = parseFloat(leg.line ?? "");
    if (!isHomeOrAway || fromLiveBoard || lineNum !== sideSpread(leg.pick, fix.oldHome)) { legsLeftAlone++; continue; }

    const newLine = signed(sideSpread(leg.pick, fix.newHome));
    // Only a graded leg is re-graded; a pending one just gets its line fixed.
    const newResult = leg.result ? calculateLegResult("spread", leg.pick, game, newLine) : null;
    const changed = !!leg.result && !!newResult && newResult !== leg.result;
    legFixes.push({ legId: leg.id, parlayId: leg.parlayId, line: newLine, result: newResult, changed });
    legReport.push({
      leg_id: leg.id, parlay_id: leg.parlayId, game: fix.label, pick: leg.pick,
      line: `${leg.line} -> ${newLine}`, result: changed ? `${leg.result} -> ${newResult}` : leg.result ?? "(pending)",
    });
  }

  const resultChanges = legFixes.filter(l => l.changed).length;
  console.log(`\nSpread legs on those games: ${legFixes.length} took their line from the wrong spread (${resultChanges} would change result), ${legsLeftAlone} left alone.`);
  if (legReport.length) console.table(legReport);

  if (!APPLY) {
    console.log("\nDry run: nothing written. Add --apply to fix the games" + (legFixes.length ? ", and --legs to also correct those legs." : "."));
    return;
  }

  const touchedParlays = new Set<number>();
  await db.transaction(async (tx) => {
    for (const f of flipped) await tx.update(games).set({ spread: f.to }).where(eq(games.id, f.id));
    if (!FIX_LEGS) return;
    for (const l of legFixes) {
      await tx.update(parlayLegs)
        .set(l.changed ? { line: l.line, result: l.result } : { line: l.line })
        .where(eq(parlayLegs.id, l.legId));
      if (l.changed) touchedParlays.add(l.parlayId);
    }
  });
  for (const parlayId of touchedParlays) await storage.rollupParlayStatus(parlayId);

  console.log(`\nApplied: ${flipped.length} game(s) corrected` +
    (FIX_LEGS ? `, ${legFixes.length} leg line(s) corrected, ${resultChanges} result(s) changed, ${touchedParlays.size} parlay status(es) rolled up.` : ". Legs not touched (no --legs)."));
  if (touchedParlays.size) {
    const changed = await db.select({ id: parlays.id, status: parlays.status }).from(parlays).where(inArray(parlays.id, [...touchedParlays]));
    console.table(changed);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
