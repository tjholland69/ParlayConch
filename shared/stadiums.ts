/**
 * Where a game is played, as one line: "Gillette Stadium - Foxborough, MA".
 * Normally that's the home team's stadium. A game moved somewhere else (an
 * international game, say) carries its own place in `games.venue`, stamped
 * from the official schedule, and that wins.
 */

/** Home stadiums, by the short team name the games table uses. */
export const HOME_STADIUMS: Record<string, { stadium: string; location: string }> = {
  Cardinals: { stadium: "State Farm Stadium", location: "Glendale, AZ" },
  Falcons: { stadium: "Mercedes-Benz Stadium", location: "Atlanta, GA" },
  Ravens: { stadium: "M&T Bank Stadium", location: "Baltimore, MD" },
  Bills: { stadium: "Highmark Stadium", location: "Orchard Park, NY" },
  Panthers: { stadium: "Bank of America Stadium", location: "Charlotte, NC" },
  Bears: { stadium: "Soldier Field", location: "Chicago, IL" },
  Bengals: { stadium: "Paycor Stadium", location: "Cincinnati, OH" },
  Browns: { stadium: "Huntington Bank Field", location: "Cleveland, OH" },
  Cowboys: { stadium: "AT&T Stadium", location: "Arlington, TX" },
  Broncos: { stadium: "Empower Field at Mile High", location: "Denver, CO" },
  Lions: { stadium: "Ford Field", location: "Detroit, MI" },
  Packers: { stadium: "Lambeau Field", location: "Green Bay, WI" },
  Texans: { stadium: "NRG Stadium", location: "Houston, TX" },
  Colts: { stadium: "Lucas Oil Stadium", location: "Indianapolis, IN" },
  Jaguars: { stadium: "EverBank Stadium", location: "Jacksonville, FL" },
  Chiefs: { stadium: "GEHA Field at Arrowhead Stadium", location: "Kansas City, MO" },
  Rams: { stadium: "SoFi Stadium", location: "Inglewood, CA" },
  Chargers: { stadium: "SoFi Stadium", location: "Inglewood, CA" },
  Raiders: { stadium: "Allegiant Stadium", location: "Las Vegas, NV" },
  Dolphins: { stadium: "Hard Rock Stadium", location: "Miami Gardens, FL" },
  Vikings: { stadium: "U.S. Bank Stadium", location: "Minneapolis, MN" },
  Patriots: { stadium: "Gillette Stadium", location: "Foxborough, MA" },
  Saints: { stadium: "Caesars Superdome", location: "New Orleans, LA" },
  Giants: { stadium: "MetLife Stadium", location: "East Rutherford, NJ" },
  Jets: { stadium: "MetLife Stadium", location: "East Rutherford, NJ" },
  Eagles: { stadium: "Lincoln Financial Field", location: "Philadelphia, PA" },
  Steelers: { stadium: "Acrisure Stadium", location: "Pittsburgh, PA" },
  "49ers": { stadium: "Levi's Stadium", location: "Santa Clara, CA" },
  Seahawks: { stadium: "Lumen Field", location: "Seattle, WA" },
  Buccaneers: { stadium: "Raymond James Stadium", location: "Tampa, FL" },
  Titans: { stadium: "Nissan Stadium", location: "Nashville, TN" },
  Commanders: { stadium: "Northwest Stadium", location: "Landover, MD" },
};

/**
 * Stadiums outside the league's own, matched on a distinctive part of the
 * name the schedule gives ("Tottenham Stadium", "Bernabeu"). Each has the
 * name to show and where it is.
 */
const NEUTRAL_STADIUMS: { match: RegExp; stadium: string; location: string }[] = [
  { match: /tottenham/i, stadium: "Tottenham Hotspur Stadium", location: "London, UK" },
  { match: /wembley/i, stadium: "Wembley Stadium", location: "London, UK" },
  { match: /twickenham/i, stadium: "Twickenham Stadium", location: "London, UK" },
  { match: /allianz|bayern/i, stadium: "Allianz Arena", location: "Munich, Germany" },
  { match: /deutsche bank|frankfurt/i, stadium: "Deutsche Bank Park", location: "Frankfurt, Germany" },
  { match: /olympiastadion|berlin/i, stadium: "Olympiastadion", location: "Berlin, Germany" },
  { match: /azteca|banorte/i, stadium: "Estadio Banorte", location: "Mexico City, Mexico" },
  { match: /corinthians|neo qu[ií]mica/i, stadium: "Neo Química Arena", location: "São Paulo, Brazil" },
  { match: /maracan/i, stadium: "Maracanã Stadium", location: "Rio de Janeiro, Brazil" },
  { match: /bernab/i, stadium: "Santiago Bernabéu", location: "Madrid, Spain" },
  { match: /croke/i, stadium: "Croke Park", location: "Dublin, Ireland" },
  { match: /stade de france/i, stadium: "Stade de France", location: "Saint-Denis, France" },
  { match: /melbourne cricket/i, stadium: "Melbourne Cricket Ground", location: "Melbourne, Australia" },
];

const label = (place: { stadium: string; location: string }) => `${place.stadium} - ${place.location}`;

/**
 * The venue to store for a game the schedule says isn't at the home team's
 * stadium. `stadium` is the schedule's own name for it. Null for an ordinary
 * home game, which needs nothing stored.
 */
export function neutralVenueLabel(homeTeam: string, stadium: string | null | undefined): string | null {
  const name = stadium?.trim();
  if (!name) return null;
  const known = NEUTRAL_STADIUMS.find((s) => s.match.test(name));
  if (known) return label(known);
  // A U.S. stadium that isn't the home team's (a relocated game): find whose it is.
  const home = HOME_STADIUMS[homeTeam];
  if (home && home.stadium.toLowerCase() === name.toLowerCase()) return null;
  const other = Object.values(HOME_STADIUMS).find((s) => s.stadium.toLowerCase() === name.toLowerCase());
  return other ? label(other) : name;
}

/** "Gillette Stadium - Foxborough, MA", or null when the team isn't known. */
export function gameVenueLabel(game: { homeTeam?: string | null; venue?: string | null }): string | null {
  if (game.venue?.trim()) return game.venue.trim();
  const home = game.homeTeam ? HOME_STADIUMS[game.homeTeam] : undefined;
  return home ? label(home) : null;
}
