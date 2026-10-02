/**
 * One-off backfill: links player-prop legs that have no game (blank Date /
 * Kickoff / Slate on the card) to the game their player played that week.
 *
 * Uses the same lookup as grading (linkPropLegToGame in
 * server/services/legEnrich.ts): the team on the player's stat line for that
 * season and week. A week whose stats aren't in the DB yet is pulled from
 * nflverse once. Legs whose player can't be found are listed and left alone.
 *
 * Safe by default: a dry run that only prints what it would link.
 *
 * Run with:
 *   npm run backfill:prop-games             (dry run)
 *   npm run backfill:prop-games -- --apply  (writes to the DB)
 * Against production, prefix with `railway run`.
 */
import { and, eq, isNull, isNotNull } from "drizzle-orm";
import { db, pool } from "../server/db";
import { parlayLegs, parlays, weeks } from "../shared/db-schema";
import { storage } from "../server/storage";
import { abbrevToShort, ensureWeekPlayerStats } from "../server/services/nflverse";
import { linkPropLegToGame } from "../server/services/legEnrich";

const APPLY = process.argv.includes("--apply");

async function main() {
  const rows = await db
    .select({ leg: parlayLegs, weekId: parlays.weekId, season: weeks.season, weekNumber: weeks.weekNumber })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .innerJoin(weeks, eq(parlays.weekId, weeks.id))
    .where(and(eq(parlayLegs.betType, "player_prop"), isNull(parlayLegs.gameId), isNotNull(parlayLegs.playerName)));

  console.log(`${rows.length} prop leg(s) with no game. ${APPLY ? "Applying." : "Dry run: pass --apply to write."}`);
  let linked = 0;
  const unresolved: string[] = [];

  for (const { leg, weekId, season, weekNumber } of rows) {
    const label = `leg ${leg.id} "${leg.playerName}" (${season} week ${weekNumber})`;
    let stat = await storage.getPlayerStatByName(leg.playerName!, season, weekNumber);
    if (!stat) {
      try {
        await ensureWeekPlayerStats(season, weekNumber);
        stat = await storage.getPlayerStatByName(leg.playerName!, season, weekNumber);
      } catch (err: any) {
        unresolved.push(`${label}: stats download failed (${err.message})`);
        continue;
      }
    }
    if (!stat?.team) { unresolved.push(`${label}: no stats found for that player and week`); continue; }

    const team = abbrevToShort(stat.team);
    const game = APPLY
      ? await linkPropLegToGame(leg, weekId, season, weekNumber)
      : (await storage.getGamesByWeek(weekId)).find(g => g.homeTeam === team || g.awayTeam === team);
    if (!game) { unresolved.push(`${label}: ${team} has no game in that week`); continue; }
    linked++;
    console.log(`${APPLY ? "linked" : "would link"} ${label} -> ${game.awayTeam} @ ${game.homeTeam} (game ${game.id})`);
  }

  console.log(`\n${linked} ${APPLY ? "linked" : "linkable"}, ${unresolved.length} unresolved.`);
  for (const line of unresolved) console.log(`  - ${line}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
