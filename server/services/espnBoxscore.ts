/**
 * ESPN boxscore sync service — defensive player stats only.
 *
 * nflverse (see nflverse.ts) is a community CSV data dump that has
 * repeatedly renamed its release/file scheme and, on its legacy fallback
 * file, has no defensive columns at all (DL/LB/DB rows silently vanish).
 * ESPN's site API is a stable, versioned, first-party endpoint that already
 * backs this app's news/injuries/scores (see nflNews.ts) and its per-game
 * boxscore includes a "defensive" stat category (tackles, solo tackles,
 * sacks) that nflverse's data does not reliably provide.
 *
 * This service is scoped to defense only — passing/rushing/receiving stats
 * stay on nflverse, which already handles them well.
 */

import { storage } from "../storage";
import { logger } from "../logger";
import { abbrevToShort, findGameInDb } from "./nflverse";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

async function fetchJsonWithRetry(url: string, retries = 2): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": "parlayconch-app/1.0" } });
      if (!res.ok) {
        // 4xx won't succeed on retry (bad event id / not published); only
        // retry on 5xx / transient failures.
        if (res.status < 500) {
          throw new Error(`ESPN fetch failed: ${res.status} ${res.statusText} — ${url}`);
        }
        throw new Error(`ESPN fetch failed (retryable): ${res.status} ${res.statusText} — ${url}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const delayMs = 500 * 2 ** attempt;
        logger.warn(`[espn] fetch attempt ${attempt + 1} failed, retrying in ${delayMs}ms: ${url}`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

interface EspnScoreboardEvent {
  id: string;
  status: { type: { completed: boolean } };
  competitions: {
    competitors: { team: { abbreviation: string }; homeAway: "home" | "away" }[];
  }[];
}

/** List this week's events (id + teams + completed flag) from ESPN's scoreboard. */
async function fetchEspnWeekEvents(season: number, week: number): Promise<EspnScoreboardEvent[]> {
  const url = `${ESPN_BASE}/scoreboard?seasontype=2&week=${week}&dates=${season}`;
  const data = await fetchJsonWithRetry(url);
  return data.events ?? [];
}

interface EspnAthleteStat {
  espnId: string;
  displayName: string;
  team: string; // ESPN team abbreviation
  tackleTotal: number;
  tackleSolo: number;
  sacks: number;
}

/** Pull the "defensive" boxscore category for both teams of one event. */
async function fetchEspnDefensiveStats(eventId: string): Promise<EspnAthleteStat[]> {
  const url = `${ESPN_BASE}/summary?event=${eventId}`;
  const data = await fetchJsonWithRetry(url);
  const teams: any[] = data?.boxscore?.players ?? [];

  const out: EspnAthleteStat[] = [];
  for (const teamBlock of teams) {
    const teamAbbrev = teamBlock?.team?.abbreviation;
    const defCategory = teamBlock?.statistics?.find((c: any) => c.name === "defensive");
    if (!defCategory) continue;

    // labels: ['TOT', 'SOLO', 'SACKS', 'TFL', 'PD', 'QB HTS', 'TD']
    const labels: string[] = defCategory.labels ?? [];
    const totIdx = labels.indexOf("TOT");
    const soloIdx = labels.indexOf("SOLO");
    const sacksIdx = labels.indexOf("SACKS");

    for (const athlete of defCategory.athletes ?? []) {
      const stats: string[] = athlete.stats ?? [];
      const tot = totIdx >= 0 ? parseFloat(stats[totIdx]) : NaN;
      const solo = soloIdx >= 0 ? parseFloat(stats[soloIdx]) : NaN;
      const sacks = sacksIdx >= 0 ? parseFloat(stats[sacksIdx]) : NaN;

      out.push({
        espnId: String(athlete.athlete?.id ?? ""),
        displayName: athlete.athlete?.displayName ?? "",
        team: teamAbbrev,
        tackleTotal: isNaN(tot) ? 0 : tot,
        tackleSolo: isNaN(solo) ? 0 : solo,
        sacks: isNaN(sacks) ? 0 : sacks,
      });
    }
  }
  return out;
}

/**
 * Sync defensive stats (sacks, solo/assist tackles) for a season+week from
 * ESPN's boxscore API, for games already in our DB.
 *
 * Only writes the defensive columns — passing/rushing/receiving/fantasy
 * fields are left untouched (upsertPlayerWeekStat merges by omitted key,
 * not by explicit null) so this never clobbers nflverse-sourced stats.
 */
export async function syncDefensiveStatsFromEspn(
  season: number,
  week: number,
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
    if (!game) continue;

    matched++;

    let defRows: EspnAthleteStat[];
    try {
      defRows = await fetchEspnDefensiveStats(event.id);
    } catch (err) {
      logger.warn({ err, eventId: event.id }, "[espn] boxscore fetch failed for event; skipping");
      continue;
    }

    for (const row of defRows) {
      if (!row.espnId || !row.displayName) continue;

      const player = await storage.upsertPlayerByEspn({
        espnId: row.espnId,
        name: row.displayName,
        displayName: row.displayName,
        position: null,
        team: row.team,
        headshot: null,
      });
      playerCount++;

      await storage.upsertPlayerWeekStat({
        playerId: player.id,
        season,
        week,
        team: row.team,
        defSacks: row.sacks,
        defTacklesSolo: Math.round(row.tackleSolo),
        defTacklesWithAssist: Math.round(row.tackleTotal - row.tackleSolo),
      });
      statCount++;
    }
  }

  return { events: events.length, matched, players: playerCount, stats: statCount };
}