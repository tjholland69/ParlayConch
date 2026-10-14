/**
 * ESPN boxscore sync service: final scores and player stats.
 *
 * nflverse (see nflverse.ts) is a community CSV data dump that has
 * repeatedly renamed its release/file scheme and, on its legacy fallback
 * file, has no defensive columns at all (DL/LB/DB rows silently vanish).
 * ESPN's site API is a stable, versioned, first-party endpoint that already
 * backs this app's news/injuries/scores (see nflNews.ts) and its per-game
 * boxscore includes a "defensive" stat category (tackles, solo tackles,
 * sacks) that nflverse's data does not reliably provide.
 *
 * nflverse stays the season-long source for passing/rushing/receiving. ESPN
 * supplies defense always, and the offensive numbers on game day, when
 * nflverse hasn't published yet (see syncPlayerStatsFromEspn).
 */

import { storage } from "../storage";
import type { InsertPlayerWeekStat } from "@shared/schema";
import { logger } from "../logger";
import { abbrevToShort, findGameInDb } from "./nflverse";
import { fetchJsonWithRetry } from "../lib/fetchWithRetry";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

interface EspnScoreboardEvent {
  id: string;
  status: { type: { completed: boolean } };
  competitions: {
    competitors: { team: { abbreviation: string }; homeAway: "home" | "away"; score?: string }[];
  }[];
}

/** List this week's events (id + teams + completed flag) from ESPN's scoreboard. */
async function fetchEspnWeekEvents(season: number, week: number): Promise<EspnScoreboardEvent[]> {
  const url = `${ESPN_BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`;
  const data = await fetchJsonWithRetry(url, { headers: { "User-Agent": "parlayconch-app/1.0" }, label: "espn" });
  return data.events ?? [];
}

type EspnStatColumns = Partial<Pick<InsertPlayerWeekStat,
  | "completions" | "attempts" | "passingYards" | "passingTds" | "interceptions"
  | "carries" | "rushingYards" | "rushingTds"
  | "receptions" | "targets" | "receivingYards" | "receivingTds"
  | "defSacks" | "defTacklesSolo" | "defTacklesWithAssist"
>>;

interface EspnAthleteStat {
  espnId: string;
  displayName: string;
  team: string; // ESPN team abbreviation
  stats: EspnStatColumns;
}

/**
 * One boxscore category's rows as our stat columns. `cell` reads a labelled
 * column of the athlete's row; a missing or unreadable cell comes back null
 * and is left out, so it never overwrites a number we already hold.
 */
type Cell = (label: string, part?: 0 | 1) => number | null;
const ESPN_CATEGORIES: Record<string, { offense: boolean; read: (cell: Cell) => Record<string, number | null> }> = {
  passing: {
    offense: true,
    // "C/ATT" is "19/25".
    read: (c) => ({ completions: c("C/ATT", 0), attempts: c("C/ATT", 1), passingYards: c("YDS"), passingTds: c("TD"), interceptions: c("INT") }),
  },
  rushing: { offense: true, read: (c) => ({ carries: c("CAR"), rushingYards: c("YDS"), rushingTds: c("TD") }) },
  receiving: { offense: true, read: (c) => ({ receptions: c("REC"), targets: c("TGTS"), receivingYards: c("YDS"), receivingTds: c("TD") }) },
  defensive: {
    offense: false,
    read: (c) => {
      const tot = c("TOT");
      const solo = c("SOLO");
      return {
        defSacks: c("SACKS"),
        defTacklesSolo: solo === null ? null : Math.round(solo),
        defTacklesWithAssist: tot === null || solo === null ? null : Math.round(tot - solo),
      };
    },
  },
};

/** Pull one event's boxscore: a row per player, merged across categories. */
async function fetchEspnPlayerStats(eventId: string, includeOffense: boolean): Promise<EspnAthleteStat[]> {
  const url = `${ESPN_BASE}/summary?event=${eventId}`;
  const data = await fetchJsonWithRetry(url, { headers: { "User-Agent": "parlayconch-app/1.0" }, label: "espn" });
  const teams: any[] = data?.boxscore?.players ?? [];

  const byAthlete = new Map<string, EspnAthleteStat>();
  for (const teamBlock of teams) {
    const teamAbbrev = teamBlock?.team?.abbreviation;
    for (const category of teamBlock?.statistics ?? []) {
      const spec = ESPN_CATEGORIES[category?.name];
      if (!spec || (spec.offense && !includeOffense)) continue;
      const labels: string[] = category.labels ?? [];

      for (const athlete of category.athletes ?? []) {
        const espnId = String(athlete.athlete?.id ?? "");
        const displayName = athlete.athlete?.displayName ?? "";
        if (!espnId || !displayName) continue;
        const stats: string[] = athlete.stats ?? [];
        const cell: Cell = (label, part) => {
          const idx = labels.indexOf(label);
          if (idx < 0) return null;
          const raw = part === undefined ? stats[idx] : String(stats[idx] ?? "").split("/")[part];
          const n = parseFloat(raw ?? "");
          return Number.isNaN(n) ? null : n;
        };
        const row = byAthlete.get(espnId) ?? { espnId, displayName, team: teamAbbrev, stats: {} };
        for (const [column, value] of Object.entries(spec.read(cell))) {
          if (value !== null) (row.stats as Record<string, number>)[column] = value;
        }
        byAthlete.set(espnId, row);
      }
    }
  }
  return Array.from(byAthlete.values());
}

/**
 * Sync player stats for a season+week from ESPN's boxscore API, for games
 * already in our DB that ESPN shows as final.
 *
 * By default only the defensive columns (sacks, solo/assist tackles), which
 * nflverse doesn't reliably carry. With `offense`, passing, rushing and
 * receiving too: ESPN has those the moment a game ends, hours before
 * nflverse publishes, which is what lets a prop settle at the whistle.
 * nflverse's numbers replace them when its own sync next runs.
 *
 * Only the columns ESPN reports for a player are written (upsertPlayerWeekStat
 * merges by omitted key), so a defense-only sync never clobbers other stats.
 * `gameIds` limits the work to those games.
 */
export async function syncPlayerStatsFromEspn(
  season: number,
  week: number,
  opts: { offense?: boolean; gameIds?: Set<number> } = {},
): Promise<{ events: number; matched: number; players: number; stats: number }> {
  const dbGames = await storage.getGamesForSeasonWeek(season, week);
  if (dbGames.length === 0) {
    logger.info(`[espn] No games found in DB for season ${season} week ${week}`);
    return { events: 0, matched: 0, players: 0, stats: 0 };
  }

  const events = await fetchEspnWeekEvents(season, week);
  logger.info(`[espn] ${events.length} scoreboard events for season ${season} week ${week}`);

  let matched = 0;
  let playerCount = 0;
  let statCount = 0;

  for (const event of events) {
    if (!event.status?.type?.completed) continue;

    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;

    const homeShort = abbrevToShort(home.team.abbreviation);
    const awayShort = abbrevToShort(away.team.abbreviation);
    const game = await findGameInDb(season, week, homeShort, awayShort);
    if (!game || (opts.gameIds && !opts.gameIds.has(game.id))) continue;

    matched++;

    let rows: EspnAthleteStat[];
    try {
      rows = await fetchEspnPlayerStats(event.id, !!opts.offense);
    } catch (err) {
      logger.warn({ err, eventId: event.id }, "[espn] boxscore fetch failed for event; skipping");
      continue;
    }

    for (const row of rows) {
      // The boxscore carries no position or headshot. They're left out, not
      // sent as null, so a player nflverse already described keeps both.
      const player = await storage.upsertPlayerByEspn({
        espnId: row.espnId,
        name: row.displayName,
        displayName: row.displayName,
        team: row.team,
      });
      playerCount++;

      await storage.upsertPlayerWeekStat({ playerId: player.id, season, week, team: row.team, ...row.stats });
      statCount++;
    }
  }

  return { events: events.length, matched, players: playerCount, stats: statCount };
}

/** Defensive stats only. See syncPlayerStatsFromEspn. */
export function syncDefensiveStatsFromEspn(season: number, week: number) {
  return syncPlayerStatsFromEspn(season, week);
}

/**
 * Marks games final from ESPN's scoreboard, which flips to "completed"
 * within a minute or two of the whistle. nflverse's schedule file (the other
 * score source) is only refreshed a few times a day, so this is what lets a
 * result land the same hour the game ends. One request covers the week.
 *
 * Only touches games not already final, so it never overwrites a score an
 * admin corrected, and it's safe to run every few minutes.
 */
export async function syncGameScoresFromEspn(
  season: number,
  week: number,
): Promise<{ events: number; updated: number; noMatch: number }> {
  const events = await fetchEspnWeekEvents(season, week);
  let updated = 0;
  let noMatch = 0;

  for (const event of events) {
    if (!event.status?.type?.completed) continue;
    const comp = event.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const homeScore = parseInt(home.score ?? "", 10);
    const awayScore = parseInt(away.score ?? "", 10);
    if (Number.isNaN(homeScore) || Number.isNaN(awayScore)) continue;

    const game = await findGameInDb(season, week, abbrevToShort(home.team.abbreviation), abbrevToShort(away.team.abbreviation));
    if (!game) {
      noMatch++;
      continue;
    }
    if (game.isFinished && game.homeScore !== null && game.awayScore !== null) continue;

    await storage.updateGameScores(game.id, homeScore, awayScore, true);
    updated++;
  }

  return { events: events.length, updated, noMatch };
}
