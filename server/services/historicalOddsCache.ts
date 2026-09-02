import { db } from "../db";
import { historicalOddsSnapshots } from "@shared/db-schema";
import { and, eq } from "drizzle-orm";
import { fetchHistoricalGames, parseGameLines, shortenTeamName, type OddsGame, type ParsedGameLines } from "./oddsApi";

// De-dupes concurrent cache misses for the same (season, week, bucket) so two
// legs enriching at the same moment don't both fire the same 10x-cost call.
const inFlight = new Map<string, Promise<OddsGame[]>>();

/**
 * Picks the snapshot this leg's line should be read from, and collapses games
 * that share a kickoff window onto the same bucket key so one API call (which
 * already returns the whole week's slate) serves every game in that window —
 * not just the one game being enriched right now.
 *
 * - More than 48h before kickoff: the early-week "open" line, pinned to the
 *   most recent Tuesday noon UTC — this is shared by every game that week.
 * - Otherwise: a "closing" snapshot 10 minutes before this game's own kickoff.
 *   Games in the same kickoff slot (e.g. the early Sunday window) share this
 *   bucket naturally, since they share a commence_time.
 */
export function resolveSnapshot(gameTime: Date, placedAt: Date): { bucketLabel: string; snapshotAt: Date } {
  const hoursBeforeKickoff = (gameTime.getTime() - placedAt.getTime()) / 36e5;

  if (hoursBeforeKickoff > 48) {
    const tue = new Date(gameTime);
    tue.setUTCDate(tue.getUTCDate() - ((tue.getUTCDay() + 5) % 7)); // most recent Tuesday
    tue.setUTCHours(12, 0, 0, 0);
    return { bucketLabel: "open", snapshotAt: tue };
  }

  const closing = new Date(gameTime.getTime() - 10 * 60_000);
  return { bucketLabel: `closing:${closing.toISOString()}`, snapshotAt: closing };
}

async function getOrFetchSnapshot(
  season: number,
  weekNumber: number,
  bucketLabel: string,
  snapshotAt: Date
): Promise<OddsGame[]> {
  const [cached] = await db
    .select()
    .from(historicalOddsSnapshots)
    .where(
      and(
        eq(historicalOddsSnapshots.season, season),
        eq(historicalOddsSnapshots.weekNumber, weekNumber),
        eq(historicalOddsSnapshots.bucketLabel, bucketLabel)
      )
    );
  if (cached) return cached.payload as OddsGame[];

  const key = `${season}:${weekNumber}:${bucketLabel}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = fetchHistoricalGames(snapshotAt)
    .then(async (payload) => {
      await db
        .insert(historicalOddsSnapshots)
        .values({ season, weekNumber, bucketLabel, snapshotAt, payload })
        .onConflictDoNothing();
      return payload;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

/**
 * Game-market lines (spread/total/moneyline) as of roughly when the bet was
 * placed, backed by the cached historical snapshot for that game's kickoff
 * bucket. Returns null if the snapshot has no matching game (e.g. odds-api
 * team name mismatch, or no bookmaker data at that point in time) — callers
 * should fall back to the current `games` row approximation in that case.
 */
export async function getHistoricalGameLines(
  season: number,
  weekNumber: number,
  homeTeam: string,
  awayTeam: string,
  gameTime: Date,
  placedAt: Date
): Promise<ParsedGameLines | null> {
  const { bucketLabel, snapshotAt } = resolveSnapshot(gameTime, placedAt);
  const slate = await getOrFetchSnapshot(season, weekNumber, bucketLabel, snapshotAt);

  const match = slate.find(
    (g) => shortenTeamName(g.home_team) === homeTeam && shortenTeamName(g.away_team) === awayTeam
  );
  if (!match) return null;

  return parseGameLines(match);
}