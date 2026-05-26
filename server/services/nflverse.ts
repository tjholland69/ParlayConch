/**
 * nflverse sync service
 *
 * Pulls game scores and player stats from the nflverse open data project:
 *   https://github.com/nflverse/nflverse-data
 *
 * No API key required. Data is updated ~24 hours after each game.
 * Only enriches games and players that are already in our DB (i.e., games
 * that were actually bet on), keeping storage minimal.
 */

import Papa from "papaparse";
import { storage } from "../storage";
import type { Game } from "@shared/schema";

// ─── nflverse data URLs ─────────────────────────────────────────────────────

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

// nflverse-data's /releases/download/schedules/schedules.csv no longer exists.
// nfldata/games.csv is the maintained mirror with identical columns.
function schedulesUrl() {
  return "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv";
}

// nflverse per-season player stats files use the naming convention:
//   player_stats_season_YYYY.csv   (e.g. player_stats_season_2024.csv)
// NOT player_stats_YYYY.csv — confirmed against the GitHub release assets.
// The combined all-seasons file (player_stats.csv) is also available but
// may lag behind; we try per-season first and fall back to combined.
const PLAYER_STATS_PER_SEASON_URL = (season: number) =>
  `${BASE}/player_stats/player_stats_season_${season}.csv`;
const PLAYER_STATS_ALL_SEASONS_URL =
  `${BASE}/player_stats/player_stats.csv`;

// ─── Team abbreviation mapping ──────────────────────────────────────────────
// nflverse uses standard NFL abbreviations; our games table uses short names
// (populated by the Odds API's teamNameMap in oddsApi.ts)

const NFLVERSE_ABBREV_TO_SHORT: Record<string, string> = {
  ARI: "Cardinals",
  ATL: "Falcons",
  BAL: "Ravens",
  BUF: "Bills",
  CAR: "Panthers",
  CHI: "Bears",
  CIN: "Bengals",
  CLE: "Browns",
  DAL: "Cowboys",
  DEN: "Broncos",
  DET: "Lions",
  GB: "Packers",
  HOU: "Texans",
  IND: "Colts",
  JAX: "Jaguars",
  JAC: "Jaguars",   // nflverse uses both
  KC: "Chiefs",
  LA: "Rams",
  LAR: "Rams",
  LAC: "Chargers",
  LV: "Raiders",
  MIA: "Dolphins",
  MIN: "Vikings",
  NE: "Patriots",
  NO: "Saints",
  NYG: "Giants",
  NYJ: "Jets",
  PHI: "Eagles",
  PIT: "Steelers",
  SF: "49ers",
  SEA: "Seahawks",
  TB: "Buccaneers",
  TEN: "Titans",
  WAS: "Commanders",
  WSH: "Commanders",
};

function abbrevToShort(abbrev: string): string {
  return NFLVERSE_ABBREV_TO_SHORT[abbrev?.toUpperCase()] ?? abbrev;
}

// ─── CSV fetch helper ────────────────────────────────────────────────────────

async function fetchCsv(url: string): Promise<Record<string, string>[]> {
  const res = await fetch(url, {
    headers: { "User-Agent": "parlayconch-app/1.0" },
  });
  if (!res.ok) {
    throw new Error(`nflverse fetch failed: ${res.status} ${res.statusText} — ${url}`);
  }
  const text = await res.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  if (parsed.errors.length > 0) {
    const firstErr = parsed.errors[0];
    console.warn(`[nflverse] CSV parse warning: ${firstErr.message} (row ${firstErr.row})`);
  }
  return parsed.data;
}

/**
 * Fetch player stats for a given season, trying the small per-season file
 * first and falling back to the large all-seasons file if the per-season
 * file hasn't been published yet (nflverse publishes these with a lag).
 */
async function fetchPlayerStatsCsv(season: number): Promise<Record<string, string>[]> {
  // GitHub releases redirect via 302 → S3. Node's fetch follows redirects by
  // default, so a 302 is fine — we only fall back on a true 404.
  const perSeasonUrl = PLAYER_STATS_PER_SEASON_URL(season);
  console.log(`[nflverse] Trying per-season URL: ${perSeasonUrl}`);
  const res = await fetch(perSeasonUrl, {
    headers: { "User-Agent": "parlayconch-app/1.0" },
    redirect: "follow",
  });

  if (res.ok) {
    console.log(`[nflverse] Per-season file found for ${season} (${res.status})`);
    const text = await res.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true, skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });
    return parsed.data;
  }

  // 404 = file genuinely absent (season not yet published or naming changed).
  // Try the combined all-seasons file next.
  console.warn(
    `[nflverse] player_stats_season_${season}.csv not available (HTTP ${res.status}). ` +
    `Falling back to combined all-seasons file — this is a ~33 MB download and may be slow.`
  );
  const allRows = await fetchCsv(PLAYER_STATS_ALL_SEASONS_URL);
  const seasonRows = allRows.filter(r => parseInt(r.season) === season);

  if (seasonRows.length > 0) {
    console.log(`[nflverse] Found ${seasonRows.length} rows for season ${season} in combined file.`);
    return seasonRows;
  }

  // Neither source has data for this season.
  const available = [...new Set(
    allRows.map(r => parseInt(r.season)).filter(s => !isNaN(s))
  )].sort((a, b) => a - b);
  const maxSeason = available.length > 0 ? available[available.length - 1] : null;
  throw new Error(
    `Season ${season} player stats are not available in nflverse. ` +
    (maxSeason
      ? `Latest season with data: ${maxSeason}. `
      : `No season data found in the combined file. `) +
    `nflverse publishes season stats after the season ends — ` +
    `try again after the season completes.`
  );
}

// ─── Game score sync ─────────────────────────────────────────────────────────

interface NflverseScheduleRow {
  game_id: string;
  season: string;
  week: string;
  game_type: string; // REG, POST, WC, DIV, CON, SB
  home_team: string;
  away_team: string;
  home_score: string;
  away_score: string;
  result: string; // home score - away score (or empty if not played)
  spread_line: string;
  total_line: string;
  home_moneyline: string;
  away_moneyline: string;
  stadium: string;
  roof: string;
  surface: string;
}

/**
 * Sync game scores from nflverse schedules CSV for the given season.
 * Optionally restrict to specific week numbers.
 * Only updates games already in our DB (no new games are created).
 *
 * Returns: { updated, noMatch, alreadyFinal }
 */
export async function syncGameScoresFromNflverse(
  season: number,
  weekNumbers?: number[]
): Promise<{ updated: number; noMatch: number; alreadyFinal: number }> {
  console.log(`[nflverse] Fetching schedules for season ${season}…`);
  const rows = (await fetchCsv(schedulesUrl())) as unknown as NflverseScheduleRow[];

  // Filter to the requested season (+ optional week filter)
  const relevant = rows.filter((r) => {
    if (parseInt(r.season) !== season) return false;
    if (weekNumbers && weekNumbers.length > 0) {
      return weekNumbers.includes(parseInt(r.week));
    }
    return true;
  });

  console.log(`[nflverse] ${relevant.length} schedule rows for season ${season}`);

  let updated = 0;
  let noMatch = 0;
  let alreadyFinal = 0;

  for (const row of relevant) {
    const homeScore = parseInt(row.home_score);
    const awayScore = parseInt(row.away_score);

    // Skip games that haven't been played yet (scores absent or zero-zero-ish without result)
    if (isNaN(homeScore) || isNaN(awayScore) || row.result === "") continue;

    const nflWeek = parseInt(row.week);
    const homeShort = abbrevToShort(row.home_team);
    const awayShort = abbrevToShort(row.away_team);

    // Find the matching week in our DB (season + weekNumber)
    const game = await findGameInDb(season, nflWeek, homeShort, awayShort);
    if (!game) {
      noMatch++;
      continue;
    }

    // Skip if we already have final scores
    if (game.isFinished && game.homeScore !== null && game.awayScore !== null) {
      alreadyFinal++;
      continue;
    }

    // Update scores and, optionally, fill odds if missing
    const spreadLine = parseFloat(row.spread_line);
    const totalLine = parseFloat(row.total_line);

    await storage.updateGameScores(game.id, homeScore, awayScore, true);

    // Backfill spread / total if the game record has none
    if (!game.spread && !isNaN(spreadLine)) {
      await storage.patchGameOdds(game.id, {
        spread: spreadLine.toString(),
        overUnder: !isNaN(totalLine) ? totalLine.toString() : undefined,
        moneylineHome: row.home_moneyline || undefined,
        moneylineAway: row.away_moneyline || undefined,
      });
    }

    updated++;
  }

  return { updated, noMatch, alreadyFinal };
}

// ─── Player stats sync ───────────────────────────────────────────────────────

interface NflversePlayerStatRow {
  player_id: string;
  player_name: string;
  player_display_name: string;
  position: string;
  recent_team: string;
  season: string;
  week: string;
  season_type: string;
  completions: string;
  attempts: string;
  passing_yards: string;
  passing_tds: string;
  interceptions: string;
  sacks: string;
  passing_air_yards: string;
  passing_yards_after_catch: string;
  passing_first_downs: string;
  passing_epa: string;
  pacr: string;
  dakota: string;
  passer_rating: string;
  carries: string;
  rushing_yards: string;
  rushing_tds: string;
  rushing_fumbles: string;
  rushing_fumbles_lost: string;
  rushing_first_downs: string;
  rushing_epa: string;
  rushing_2pt_conversions: string;
  receptions: string;
  targets: string;
  receiving_yards: string;
  receiving_tds: string;
  receiving_fumbles: string;
  receiving_fumbles_lost: string;
  receiving_air_yards: string;
  receiving_yards_after_catch: string;
  receiving_first_downs: string;
  receiving_epa: string;
  racr: string;
  target_share: string;
  air_yards_share: string;
  wopr: string;
  special_teams_tds: string;
  fantasy_points: string;
  fantasy_points_ppr: string;
  headshot_url: string;
}

/**
 * Shared internal helper: download CSV, filter rows, upsert players + stats.
 * `teamFilter` — if provided, only rows whose `recent_team` is in this set are
 * kept. Pass `null` to import every player in the week (used for prop bets
 * where the player's team may not appear in any of our bet-on games).
 */
async function upsertPlayerStatsRows(
  season: number,
  week: number,
  teamFilter: Set<string> | null
): Promise<{ players: number; stats: number }> {
  const label = teamFilter
    ? `teams: ${Array.from(teamFilter).join(", ")}`
    : "all teams (no team filter)";
  console.log(`[nflverse] Fetching player stats for season ${season}, week ${week}, ${label}…`);

  const rows = (await fetchPlayerStatsCsv(season)) as unknown as NflversePlayerStatRow[];

  const relevant = rows.filter((r) => {
    if (parseInt(r.week) !== week) return false;
    if (parseInt(r.season) !== season) return false;
    if (teamFilter && !teamFilter.has(r.recent_team?.toUpperCase())) return false;
    return true;
  });

  console.log(`[nflverse] ${relevant.length} player stat rows matched`);

  let playerCount = 0;
  let statCount = 0;

  for (const row of relevant) {
    if (!row.player_id || !row.player_name) continue;

    const p = num(row);

    // Upsert player
    const player = await storage.upsertPlayer({
      nflverseId: row.player_id,
      name: row.player_name,
      displayName: row.player_display_name || row.player_name,
      position: row.position || null,
      team: row.recent_team || null,
      headshot: row.headshot_url || null,
    });
    playerCount++;

    // Upsert weekly stat row
    await storage.upsertPlayerWeekStat({
      playerId: player.id,
      season,
      week,
      seasonType: row.season_type || "REG",
      team: row.recent_team || null,
      completions: p(row.completions),
      attempts: p(row.attempts),
      passingYards: p(row.passing_yards),
      passingTds: p(row.passing_tds),
      interceptions: p(row.interceptions),
      passerRating: pf(row.passer_rating),
      carries: p(row.carries),
      rushingYards: p(row.rushing_yards),
      rushingTds: p(row.rushing_tds),
      receptions: p(row.receptions),
      targets: p(row.targets),
      receivingYards: p(row.receiving_yards),
      receivingTds: p(row.receiving_tds),
      fantasyPoints: pf(row.fantasy_points),
      fantasyPointsPpr: pf(row.fantasy_points_ppr),
    });
    statCount++;
  }

  return { players: playerCount, stats: statCount };
}

/**
 * Sync player stats for a specific season and week, scoped to only teams
 * that appear in games currently in our DB for that week.
 *
 * This keeps our player_week_stats table focused on bet-relevant players only.
 * Used by the admin bulk-sync endpoint.
 *
 * Returns: { players: number, stats: number }
 */
export async function syncPlayerStatsForGames(
  season: number,
  week: number
): Promise<{ players: number; stats: number }> {
  // Get all games in our DB for this season + week to know which teams to include
  const dbGames = await storage.getGamesForSeasonWeek(season, week);
  if (dbGames.length === 0) {
    console.log(`[nflverse] No games found in DB for season ${season} week ${week}`);
    return { players: 0, stats: 0 };
  }

  // Collect all team abbreviations for games in that week
  const teamAbbrevs = new Set<string>();
  for (const game of dbGames) {
    const homeAbbrev = shortToAbbrev(game.homeTeam);
    const awayAbbrev = shortToAbbrev(game.awayTeam);
    if (homeAbbrev) teamAbbrevs.add(homeAbbrev);
    if (awayAbbrev) teamAbbrevs.add(awayAbbrev);
  }

  if (teamAbbrevs.size === 0) {
    console.log(`[nflverse] Could not map any teams to abbreviations for season ${season} week ${week}`);
    return { players: 0, stats: 0 };
  }

  return upsertPlayerStatsRows(season, week, teamAbbrevs);
}

/**
 * Sync ALL player stats for a season+week with NO team restriction.
 *
 * Used when enriching player prop bets: the player's current team may not
 * appear in any of our bet-on games (e.g., Derrick Henry on BAL in 2025
 * when no Ravens game was imported). Fetching all players ensures we can
 * always look up any named player after this call.
 *
 * Returns: { players: number, stats: number }
 */
export async function syncAllPlayerStatsForWeek(
  season: number,
  week: number
): Promise<{ players: number; stats: number }> {
  return upsertPlayerStatsRows(season, week, null);
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Parse int, returning null for blanks/NaN */
function num(row: any) {
  return (v: string) => {
    const n = parseInt(v);
    return isNaN(n) ? null : n;
  };
}

/** Parse float, returning null for blanks/NaN */
function pf(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/** Find a game in our DB by matching season → weekId, then by team names */
async function findGameInDb(
  season: number,
  nflWeek: number,
  homeShort: string,
  awayShort: string
): Promise<Game | null> {
  const weekRecord = await storage.getWeekBySeasonAndNumber(season, nflWeek);
  if (!weekRecord) return null;
  return storage.findGameByTeams(weekRecord.id, homeShort, awayShort);
}

/** Reverse map: short name → nflverse abbreviation */
const SHORT_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(NFLVERSE_ABBREV_TO_SHORT)
    .filter(([k]) => !["LAR", "JAC", "WSH"].includes(k)) // skip duplicates
    .map(([abbrev, short]) => [short, abbrev])
);

function shortToAbbrev(shortName: string): string | null {
  return SHORT_TO_ABBREV[shortName] ?? null;
}
