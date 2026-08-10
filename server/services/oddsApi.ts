import { db } from "../db";
import { games, weeks } from "@shared/schema";
import { eq } from "drizzle-orm";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "americanfootball_nfl";

export interface OddsGame {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Bookmaker[];
}

interface Bookmaker {
  key: string;
  title: string;
  markets: Market[];
}

interface Market {
  key: string;
  outcomes: Outcome[];
}

interface Outcome {
  name: string;
  price: number;
  point?: number;
}

const teamNameMap: Record<string, string> = {
  "Arizona Cardinals": "Cardinals",
  "Atlanta Falcons": "Falcons",
  "Baltimore Ravens": "Ravens",
  "Buffalo Bills": "Bills",
  "Carolina Panthers": "Panthers",
  "Chicago Bears": "Bears",
  "Cincinnati Bengals": "Bengals",
  "Cleveland Browns": "Browns",
  "Dallas Cowboys": "Cowboys",
  "Denver Broncos": "Broncos",
  "Detroit Lions": "Lions",
  "Green Bay Packers": "Packers",
  "Houston Texans": "Texans",
  "Indianapolis Colts": "Colts",
  "Jacksonville Jaguars": "Jaguars",
  "Kansas City Chiefs": "Chiefs",
  "Las Vegas Raiders": "Raiders",
  "Los Angeles Chargers": "Chargers",
  "Los Angeles Rams": "Rams",
  "Miami Dolphins": "Dolphins",
  "Minnesota Vikings": "Vikings",
  "New England Patriots": "Patriots",
  "New Orleans Saints": "Saints",
  "New York Giants": "Giants",
  "New York Jets": "Jets",
  "Philadelphia Eagles": "Eagles",
  "Pittsburgh Steelers": "Steelers",
  "San Francisco 49ers": "49ers",
  "Seattle Seahawks": "Seahawks",
  "Tampa Bay Buccaneers": "Buccaneers",
  "Tennessee Titans": "Titans",
  "Washington Commanders": "Commanders",
};

export function shortenTeamName(fullName: string): string {
  return teamNameMap[fullName] || fullName;
}

export interface ParsedGameLines {
  spread: string | null;
  spreadOdds: string | null;
  overUnder: string | null;
  overOdds: string | null;
  underOdds: string | null;
  moneylineHome: string | null;
  moneylineAway: string | null;
  bookmaker: string | null;
}

export function parseGameLines(oddsGame: OddsGame): ParsedGameLines {
  const lines: ParsedGameLines = {
    spread: null,
    spreadOdds: null,
    overUnder: null,
    overOdds: null,
    underOdds: null,
    moneylineHome: null,
    moneylineAway: null,
    bookmaker: null,
  };

  const bookmaker = oddsGame.bookmakers.find(b =>
    b.key === "draftkings" || b.key === "fanduel" || b.key === "betmgm"
  ) || oddsGame.bookmakers[0];

  if (!bookmaker) return lines;

  lines.bookmaker = bookmaker.title || bookmaker.key;

  for (const market of bookmaker.markets) {
    if (market.key === "spreads") {
      const homeSpread = market.outcomes.find(o => o.name === oddsGame.home_team);
      if (homeSpread?.point !== undefined) {
        lines.spread = homeSpread.point > 0 ? `+${homeSpread.point}` : `${homeSpread.point}`;
        lines.spreadOdds = homeSpread.price > 0 ? `+${homeSpread.price}` : `${homeSpread.price}`;
      }
    }
    if (market.key === "totals") {
      const over = market.outcomes.find(o => o.name === "Over");
      const under = market.outcomes.find(o => o.name === "Under");
      if (over?.point) {
        lines.overUnder = `${over.point}`;
        lines.overOdds = over.price > 0 ? `+${over.price}` : `${over.price}`;
      }
      if (under) {
        lines.underOdds = under.price > 0 ? `+${under.price}` : `${under.price}`;
      }
    }
    if (market.key === "h2h") {
      const home = market.outcomes.find(o => o.name === oddsGame.home_team);
      const away = market.outcomes.find(o => o.name === oddsGame.away_team);
      if (home) {
        lines.moneylineHome = home.price > 0 ? `+${home.price}` : `${home.price}`;
      }
      if (away) {
        lines.moneylineAway = away.price > 0 ? `+${away.price}` : `${away.price}`;
      }
    }
  }

  return lines;
}

/**
 * Historical (point-in-time) equivalent of fetchUpcomingGames. Costs 10x the
 * credits of a live /odds call, so callers should cache the result — see
 * server/services/historicalOddsCache.ts, which caches per (season, week,
 * bucket) rather than per game since one call already returns the whole slate.
 */
export async function fetchHistoricalGames(asOf: Date): Promise<OddsGame[]> {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY not configured");
  }

  const url = `${BASE_URL}/historical/sports/${SPORT}/odds` +
    `?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,h2h,totals&oddsFormat=american` +
    `&date=${asOf.toISOString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Historical odds API error: ${response.status} - ${text}`);
  }

  const body = await response.json();
  return body.data as OddsGame[];
}

export async function fetchUpcomingGames(): Promise<OddsGame[]> {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY not configured");
  }

  const url = `${BASE_URL}/sports/${SPORT}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=spreads,h2h,totals&oddsFormat=american`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Odds API error: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function syncGamesFromOddsApi(weekId: number): Promise<{ added: number; updated: number }> {
  const oddsGames = await fetchUpcomingGames();

  const existingGames = await db.select().from(games).where(eq(games.weekId, weekId));
  const existingByTeams = new Map<string, (typeof existingGames)[0]>();
  for (const g of existingGames) {
    existingByTeams.set(`${g.homeTeam}|${g.awayTeam}`, g);
  }

  let added = 0;
  let updated = 0;

  for (const oddsGame of oddsGames) {
    const homeTeam = shortenTeamName(oddsGame.home_team);
    const awayTeam = shortenTeamName(oddsGame.away_team);
    const gameTime = new Date(oddsGame.commence_time);
    const lines = parseGameLines(oddsGame);

    const existing = existingByTeams.get(`${homeTeam}|${awayTeam}`);

    if (existing) {
      await db.update(games)
        .set({ ...lines, gameTime })
        .where(eq(games.id, existing.id));
      updated++;
    } else {
      await db.insert(games).values({
        weekId,
        homeTeam,
        awayTeam,
        ...lines,
        gameTime,
        isFinished: false,
      });
      added++;
    }
  }

  return { added, updated };
}

export async function getApiUsage(): Promise<{ remaining: number; used: number }> {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY not configured");
  }

  const url = `${BASE_URL}/sports?apiKey=${ODDS_API_KEY}`;
  const response = await fetch(url);
  
  const remaining = parseInt(response.headers.get("x-requests-remaining") || "0");
  const used = parseInt(response.headers.get("x-requests-used") || "0");

  return { remaining, used };
}

interface ScoreGame {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: { name: string; score: string }[] | null;
}

/**
 * Fetch completed game scores from The Odds API and update game records in the DB.
 * The free plan covers the last 3 days. Pass daysFrom to request older data (paid plans only).
 *
 * Returns { updated, notFound } counts.
 */
export async function syncGameScores(
  weekId: number,
  daysFrom: number = 3
): Promise<{ updated: number; notFound: number }> {
  if (!ODDS_API_KEY) {
    throw new Error("ODDS_API_KEY not configured");
  }

  const url = `${BASE_URL}/sports/${SPORT}/scores?apiKey=${ODDS_API_KEY}&daysFrom=${daysFrom}`;
  const response = await fetch(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Scores API error: ${response.status} - ${text}`);
  }

  const scoreGames: ScoreGame[] = await response.json();

  let updated = 0;
  let notFound = 0;

  const { storage } = await import("../storage");

  for (const sg of scoreGames) {
    if (!sg.completed || !sg.scores) continue;

    const homeTeam = shortenTeamName(sg.home_team);
    const awayTeam = shortenTeamName(sg.away_team);

    const homeScoreEntry = sg.scores.find(s => s.name === sg.home_team);
    const awayScoreEntry = sg.scores.find(s => s.name === sg.away_team);

    if (!homeScoreEntry || !awayScoreEntry) continue;

    const homeScore = parseInt(homeScoreEntry.score, 10);
    const awayScore = parseInt(awayScoreEntry.score, 10);
    if (isNaN(homeScore) || isNaN(awayScore)) continue;

    const game = await storage.findGameByTeams(weekId, homeTeam, awayTeam);
    if (!game) {
      notFound++;
      continue;
    }

    await storage.updateGameScores(game.id, homeScore, awayScore, true);
    updated++;
  }

  return { updated, notFound };
}
