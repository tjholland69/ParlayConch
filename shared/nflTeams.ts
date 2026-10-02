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
