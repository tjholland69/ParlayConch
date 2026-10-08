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
  const data = await fetchJsonWithRetry(url, { headers: { "User-Agent": "parlayconch-app/1.0" }, label: "espn" });
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
