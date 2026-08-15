/**
 * One-off backfill: populates parlay_legs.line / odds / oddsSource for
 * game-bet legs (spread/moneyline/over/under) that are missing them.
 *
 * Mirrors the line-resolution logic in server/services/legEnrich.ts
 * (enrichSingleLeg): prefer the historical odds snapshot closest to when the
 * bet was placed (getHistoricalGameLines), and only fall back to the game's
 * current record when no snapshot match exists — the current line can have
 * drifted from what was actually bet. Player-prop legs have no market odds
 * and are skipped.
 *
 * Only fills fields that are currently null; never overwrites an existing
 * line/odds/oddsSource value.
 *
 * Safe by default — runs as a dry run and only logs what it would write.
 * Pass --apply to actually persist.
 *
 * Run with:
 *   npm run backfill:odds           (dry run)
 *   npm run backfill:odds -- --apply (writes to the DB)
 */
import { db } from "../server/db";
import { parlayLegs, games, parlays, weeks } from "../shared/schema";
import { and, eq, inArray, ne, or, isNull } from "drizzle-orm";
import { getHistoricalGameLines } from "../server/services/historicalOddsCache";
import type { Game } from "@shared/schema";
import type { ParsedGameLines } from "../server/services/oddsApi";

const APPLY = process.argv.includes("--apply");

function deriveFromGame(betType: string, pick: string, game: Game): { line: string | null; odds: string | null } {
  if (betType === "spread") return { line: game.spread ?? null, odds: game.spreadOdds ?? null };
  if (betType === "moneyline") {
    return { line: null, odds: pick === "home" ? (game.moneylineHome ?? null) : (game.moneylineAway ?? null) };
  }
  if (betType === "over") return { line: game.overUnder ?? null, odds: game.overOdds ?? null };
  if (betType === "under") return { line: game.overUnder ?? null, odds: game.underOdds ?? null };
  return { line: null, odds: null };
}

function deriveFromHistorical(betType: string, pick: string, hist: ParsedGameLines): { line: string | null; odds: string | null } {
  if (betType === "spread") return { line: hist.spread, odds: hist.spreadOdds };
  if (betType === "moneyline") return { line: null, odds: pick === "home" ? hist.moneylineHome : hist.moneylineAway };
  if (betType === "over") return { line: hist.overUnder, odds: hist.overOdds };
  if (betType === "under") return { line: hist.overUnder, odds: hist.underOdds };
  return { line: null, odds: null };
}

async function main() {
  const rows = await db
    .select({ leg: parlayLegs, parlay: parlays })
    .from(parlayLegs)
    .innerJoin(parlays, eq(parlayLegs.parlayId, parlays.id))
    .where(
      and(
        ne(parlayLegs.betType, "player_prop"),
        or(isNull(parlayLegs.line), isNull(parlayLegs.odds))
      )
    );

  console.log(`Found ${rows.length} game-bet leg(s) with missing line/odds.`);

  const hasOddsApiKey = !!process.env.ODDS_API_KEY;
  if (!hasOddsApiKey) {
    console.log("ODDS_API_KEY not set — skipping historical odds lookups, using current game record only.\n");
  }

  const summary = { total: rows.length, historical: 0, currentGame: 0, skippedNoGame: 0, skippedNoMatch: 0 };
  const writes: Array<{ id: number; line?: string | null; odds?: string | null; oddsSource?: string | null; source: "historical" | "current" }> = [];

  const gameIds = [...new Set(rows.map(({ leg }) => leg.gameId).filter((id): id is number => id != null))];
  const gameRows = gameIds.length ? await db.select().from(games).where(inArray(games.id, gameIds)) : [];
  const gameById = new Map(gameRows.map((g) => [g.id, g]));

  const weekIds = [...new Set(rows.map(({ parlay }) => parlay.weekId))];
  const weekRows = weekIds.length ? await db.select().from(weeks).where(inArray(weeks.id, weekIds)) : [];
  const weekById = new Map(weekRows.map((w) => [w.id, w]));

  for (const { leg, parlay } of rows) {
    const game = leg.gameId != null ? gameById.get(leg.gameId) : undefined;
    if (!game) {
      summary.skippedNoGame++;
      console.log(`  skip: leg ${leg.id} — no linked game`);
      continue;
    }

    const week = weekById.get(parlay.weekId);
    let resolved: { line: string | null; odds: string | null } | null = null;
    let oddsSource: string | null = null;
    let source: "historical" | "current" | null = null;

    if (hasOddsApiKey && week && game.gameTime) {
      try {
        const hist = await getHistoricalGameLines(
          week.season, week.weekNumber, game.homeTeam, game.awayTeam,
          game.gameTime, parlay.createdAt ?? new Date()
        );
        if (hist) {
          const derived = deriveFromHistorical(leg.betType, leg.pick, hist);
          if (derived.line || derived.odds) {
            resolved = derived;
            oddsSource = hist.bookmaker;
            source = "historical";
          }
        }
      } catch (err: any) {
        console.log(`  warn: leg ${leg.id} — historical odds lookup failed: ${err.message}`);
      }
    }

    if (!resolved) {
      const derived = deriveFromGame(leg.betType, leg.pick, game);
      if (derived.line || derived.odds) {
        resolved = derived;
        source = "current";
      }
    }

    if (!resolved) {
      summary.skippedNoMatch++;
      console.log(`  skip: leg ${leg.id} — no odds data found (historical or current)`);
      continue;
    }

    const write: (typeof writes)[number] = { id: leg.id, source: source! };
    if (!leg.line && resolved.line) write.line = resolved.line;
    if (!leg.odds && resolved.odds) write.odds = resolved.odds;
    if (!leg.oddsSource && oddsSource) write.oddsSource = oddsSource;

    if (write.line === undefined && write.odds === undefined && write.oddsSource === undefined) {
      summary.skippedNoMatch++;
      console.log(`  skip: leg ${leg.id} — resolved data didn't fill any missing field`);
      continue;
    }

    writes.push(write);
    if (source === "historical") summary.historical++;
    else summary.currentGame++;
  }

  console.log("\nSummary:", summary);
  console.log(`\n${writes.length} leg(s) would be updated${APPLY ? "" : " (dry run — pass --apply to persist)"}.`);

  if (writes.length > 0) {
    console.log("\nSample of computed values:");
    for (const w of writes.slice(0, 15)) {
      console.log(`  leg ${w.id} [${w.source}]: line=${w.line ?? "(unchanged)"} odds=${w.odds ?? "(unchanged)"} oddsSource=${w.oddsSource ?? "(unchanged)"}`);
    }
  }

  if (APPLY && writes.length > 0) {
    // Low concurrency — pooled connections (e.g. Supabase session-mode pgbouncer)
    // can have a small max-clients ceiling well below this pool's configured max.
    const CHUNK = 5;
    for (let i = 0; i < writes.length; i += CHUNK) {
      const chunk = writes.slice(i, i + CHUNK);
      await Promise.all(chunk.map((w) => {
        const { id, source, ...updates } = w;
        return db.update(parlayLegs).set(updates).where(eq(parlayLegs.id, id));
      }));
    }
    console.log(`\n✓ Wrote odds data for ${writes.length} leg(s).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });