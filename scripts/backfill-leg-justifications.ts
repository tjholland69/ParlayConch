/**
 * One-off backfill: populates parlay_legs.resultDetail for legs that were
 * already decided before the parlay-justifications feature existed.
 *
 * Safe by default — runs as a dry run and only logs what it would write.
 * Pass --apply to actually persist.
 *
 * Run with:
 *   npm run backfill:leg-justifications           (dry run)
 *   npm run backfill:leg-justifications -- --apply (writes to the DB)
 */
import { db } from "../server/db";
import { parlayLegs, games, parlays, weeks } from "../shared/schema";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { storage } from "../server/storage";
import { buildResultDetail } from "../shared/legJustification";

const APPLY = process.argv.includes("--apply");

async function main() {
  const decidedLegs = await db
    .select({ leg: parlayLegs, weekId: parlays.weekId })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .where(and(isNotNull(parlayLegs.result), isNull(parlayLegs.resultDetail)));

  console.log(`Found ${decidedLegs.length} decided leg(s) missing resultDetail.`);

  const summary = { total: decidedLegs.length, gameResolved: 0, propResolved: 0, propSkippedNoStat: 0, gameSkippedNoGame: 0 };
  const writes: Array<{ id: number; resultDetail: string }> = [];

  const gameLegRows = decidedLegs.filter(({ leg }) => leg.betType !== "player_prop");
  const propLegRows = decidedLegs.filter(({ leg }) => leg.betType === "player_prop");

  // ── Game-bet legs: batch-fetch games, derive from score ────────────────────
  const gameIds = [...new Set(gameLegRows.map(({ leg }) => leg.gameId).filter((id): id is number => id != null))];
  const gameRows = gameIds.length ? await db.select().from(games).where(inArray(games.id, gameIds)) : [];
  const gameById = new Map(gameRows.map((g) => [g.id, g]));

  for (const { leg } of gameLegRows) {
    const game = leg.gameId != null ? gameById.get(leg.gameId) : undefined;
    if (!game) {
      summary.gameSkippedNoGame++;
      continue;
    }
    const resultDetail = buildResultDetail({ leg, game });
    if (resultDetail) {
      writes.push({ id: leg.id, resultDetail });
      summary.gameResolved++;
    } else {
      summary.gameSkippedNoGame++;
    }
  }

  // ── Prop legs: resolve week -> season/weekNumber -> player_week_stats ──────
  const weekIds = [...new Set(propLegRows.map(({ weekId }) => weekId))];
  const weekRows = weekIds.length ? await db.select().from(weeks).where(inArray(weeks.id, weekIds)) : [];
  const weekById = new Map(weekRows.map((w) => [w.id, w]));

  for (const { leg, weekId } of propLegRows) {
    const week = weekById.get(weekId);
    if (!week || !leg.playerName) {
      summary.propSkippedNoStat++;
      console.log(`  skip: leg ${leg.id} — no week or player name`);
      continue;
    }
    const stat = await storage.getPlayerStatByName(leg.playerName, week.season, week.weekNumber);
    if (!stat) {
      summary.propSkippedNoStat++;
      console.log(`  skip: leg ${leg.id} — no stats for "${leg.playerName}" S${week.season}W${week.weekNumber}`);
      continue;
    }
    const resultDetail = buildResultDetail({ leg, stat });
    if (resultDetail) {
      writes.push({ id: leg.id, resultDetail });
      summary.propResolved++;
    } else {
      summary.propSkippedNoStat++;
      console.log(`  skip: leg ${leg.id} — could not derive detail for propType "${leg.propType}"`);
    }
  }

  console.log("\nSummary:", summary);
  console.log(`\n${writes.length} leg(s) would be updated${APPLY ? "" : " (dry run — pass --apply to persist)"}.`);

  if (writes.length > 0) {
    console.log("\nSample of computed values (game legs):");
    for (const w of writes.slice(0, 10)) {
      console.log(`  leg ${w.id}: ${w.resultDetail}`);
    }
    console.log("\nSample of computed values (prop legs):");
    for (const w of writes.slice(-10)) {
      console.log(`  leg ${w.id}: ${w.resultDetail}`);
    }
  }

  if (APPLY && writes.length > 0) {
    // Low concurrency — pooled connections (e.g. Supabase session-mode pgbouncer)
    // can have a small max-clients ceiling well below this pool's configured max.
    const CHUNK = 5;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const chunk = writes.slice(i, i + CHUNK);
      await Promise.all(chunk.map((w) => db.update(parlayLegs).set({ resultDetail: w.resultDetail }).where(eq(parlayLegs.id, w.id))));
    }
    console.log(`\n✓ Wrote resultDetail for ${writes.length} leg(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
