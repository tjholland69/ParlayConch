// nflverse uses standard NFL abbreviations; our games table uses short names
// (populated by the Odds API's teamNameMap in server/services/oddsApi.ts).

export const NFLVERSE_ABBREV_TO_SHORT: Record<string, string> = {
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

export function abbrevToShort(abbrev: string): string {
  return NFLVERSE_ABBREV_TO_SHORT[abbrev?.toUpperCase()] ?? abbrev;
}

/**
 * Every abbreviation a team's players may be filed under, given the team the
 * way a game row names it — a short name ("Rams"), a full name ("Los Angeles
 * Rams") or an abbreviation ("LAR"). A team with two spellings in nflverse
 * returns both (["LA", "LAR"]). Empty when the name isn't an NFL team.
 */
export function abbreviationsForTeam(team: string | null | undefined): string[] {
  const name = team?.trim().toLowerCase();
  if (!name) return [];
  const short = (NFLVERSE_ABBREV_TO_SHORT[name.toUpperCase()] ?? name).toLowerCase();
  return Object.entries(NFLVERSE_ABBREV_TO_SHORT)
    .filter(([, nickname]) => {
      const n = nickname.toLowerCase();
      return short === n || short.endsWith(` ${n}`);
    })
    .map(([abbrev]) => abbrev);
}

/** Where each team plays, by the short name the games table uses. A team can
 * answer to more than one place ("New York", "NY", "New Jersey"). */
export const TEAM_CITIES: Record<string, string[]> = {
  Cardinals: ["Arizona", "Phoenix"],
  Falcons: ["Atlanta"],
  Ravens: ["Baltimore"],
  Bills: ["Buffalo"],
  Panthers: ["Carolina", "Charlotte"],
  Bears: ["Chicago"],
  Bengals: ["Cincinnati"],
  Browns: ["Cleveland"],
  Cowboys: ["Dallas"],
  Broncos: ["Denver"],
  Lions: ["Detroit"],
  Packers: ["Green Bay"],
  Texans: ["Houston"],
  Colts: ["Indianapolis", "Indy"],
  Jaguars: ["Jacksonville", "Jags"],
  Chiefs: ["Kansas City", "KC"],
  Rams: ["Los Angeles", "LA"],
  Chargers: ["Los Angeles", "LA"],
  Raiders: ["Las Vegas", "Vegas"],
  Dolphins: ["Miami"],
  Vikings: ["Minnesota", "Minneapolis"],
  Patriots: ["New England", "Boston", "Pats"],
  Saints: ["New Orleans", "NOLA"],
  Giants: ["New York", "NY"],
  Jets: ["New York", "NY"],
  Eagles: ["Philadelphia", "Philly"],
  Steelers: ["Pittsburgh"],
  "49ers": ["San Francisco", "SF", "Niners"],
  Seahawks: ["Seattle"],
  Buccaneers: ["Tampa Bay", "Tampa", "Bucs"],
  Titans: ["Tennessee", "Nashville"],
  Commanders: ["Washington", "DC"],
};

const SHORT_TO_ABBREVS: Record<string, string[]> = {};
for (const [abbrev, short] of Object.entries(NFLVERSE_ABBREV_TO_SHORT)) (SHORT_TO_ABBREVS[short] ??= []).push(abbrev);

/** Does a team answer to what was typed: its name, city, nickname or abbreviation? */
export function teamMatchesQuery(team: string | null | undefined, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (!team) return false;
  const names = [team, ...(TEAM_CITIES[team] ?? []), ...(SHORT_TO_ABBREVS[team] ?? [])].map((n) => n.toLowerCase());
  // Short abbreviations only match whole ("ne" shouldn't find the Broncos via "denver").
  return names.some((n) => (n.length <= 3 ? n === q : n.includes(q)));
}

/** True when either team in the game matches the search. */
export function gameMatchesTeamQuery(game: { homeTeam?: string | null; awayTeam?: string | null }, query: string): boolean {
  return !query.trim() || teamMatchesQuery(game.homeTeam, query) || teamMatchesQuery(game.awayTeam, query);
}

/** The short name ("Chiefs") for a player's team abbreviation ("KC"), where known. */
export function teamShortName(abbrev: string | null | undefined): string | null {
  return abbrev ? NFLVERSE_ABBREV_TO_SHORT[abbrev.toUpperCase()] ?? null : null;
}
