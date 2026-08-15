/**
 * Idempotent seed for the `teams` reference table — all 32 current NFL teams.
 *
 * Run with:
 *   npm run db:seed-teams
 */

import { db } from "../server/db";
import { teams, type InsertTeam } from "../shared/schema";

// Owner / head coach current as of the author's knowledge cutoff (Jan 2026).
// Coaching staffs and ownership groups change yearly — re-verify before relying
// on these for the current season.
function logoUrl(espnAbbr: string): string {
  return `https://a.espncdn.com/i/teamlogos/nfl/500/${espnAbbr.toLowerCase()}.png`;
}

const NFL_TEAMS: InsertTeam[] = [
  // AFC East
  { abbreviation: "BUF", fullName: "Buffalo Bills", city: "Buffalo", nickname: "Bills", conference: "AFC", division: "East", stadiumName: "Highmark Stadium", stadiumType: "outdoor", isTurf: true, owner: "Terry and Kim Pegula", headCoach: "Sean McDermott", primaryColor: "#00338D", secondaryColor: "#C60C30", logoUrl: logoUrl("buf") },
  { abbreviation: "MIA", fullName: "Miami Dolphins", city: "Miami", nickname: "Dolphins", conference: "AFC", division: "East", stadiumName: "Hard Rock Stadium", stadiumType: "outdoor", isTurf: false, owner: "Stephen Ross", headCoach: "Mike McDaniel", primaryColor: "#008E97", secondaryColor: "#FC4C02", logoUrl: logoUrl("mia") },
  { abbreviation: "NE", fullName: "New England Patriots", city: "Foxborough", nickname: "Patriots", conference: "AFC", division: "East", stadiumName: "Gillette Stadium", stadiumType: "outdoor", isTurf: true, owner: "Robert Kraft", headCoach: "Mike Vrabel", primaryColor: "#002244", secondaryColor: "#C60C30", logoUrl: logoUrl("ne") },
  { abbreviation: "NYJ", fullName: "New York Jets", city: "East Rutherford", nickname: "Jets", conference: "AFC", division: "East", stadiumName: "MetLife Stadium", stadiumType: "outdoor", isTurf: true, owner: "Woody Johnson", headCoach: "Aaron Glenn", primaryColor: "#125740", secondaryColor: "#000000", logoUrl: logoUrl("nyj") },
  // AFC North
  { abbreviation: "BAL", fullName: "Baltimore Ravens", city: "Baltimore", nickname: "Ravens", conference: "AFC", division: "North", stadiumName: "M&T Bank Stadium", stadiumType: "outdoor", isTurf: true, owner: "Steve Bisciotti", headCoach: "John Harbaugh", primaryColor: "#241773", secondaryColor: "#000000", logoUrl: logoUrl("bal") },
  { abbreviation: "CIN", fullName: "Cincinnati Bengals", city: "Cincinnati", nickname: "Bengals", conference: "AFC", division: "North", stadiumName: "Paycor Stadium", stadiumType: "outdoor", isTurf: true, owner: "Mike Brown", headCoach: "Zac Taylor", primaryColor: "#FB4F14", secondaryColor: "#000000", logoUrl: logoUrl("cin") },
  { abbreviation: "CLE", fullName: "Cleveland Browns", city: "Cleveland", nickname: "Browns", conference: "AFC", division: "North", stadiumName: "Huntington Bank Field", stadiumType: "outdoor", isTurf: false, owner: "Jimmy and Dee Haslam", headCoach: "Kevin Stefanski", primaryColor: "#311D00", secondaryColor: "#FF3C00", logoUrl: logoUrl("cle") },
  { abbreviation: "PIT", fullName: "Pittsburgh Steelers", city: "Pittsburgh", nickname: "Steelers", conference: "AFC", division: "North", stadiumName: "Acrisure Stadium", stadiumType: "outdoor", isTurf: false, owner: "Art Rooney II", headCoach: "Mike Tomlin", primaryColor: "#FFB612", secondaryColor: "#101820", logoUrl: logoUrl("pit") },
  // AFC South
  { abbreviation: "HOU", fullName: "Houston Texans", city: "Houston", nickname: "Texans", conference: "AFC", division: "South", stadiumName: "NRG Stadium", stadiumType: "retractable", isTurf: true, owner: "Cal McNair", headCoach: "DeMeco Ryans", primaryColor: "#03202F", secondaryColor: "#A71930", logoUrl: logoUrl("hou") },
  { abbreviation: "IND", fullName: "Indianapolis Colts", city: "Indianapolis", nickname: "Colts", conference: "AFC", division: "South", stadiumName: "Lucas Oil Stadium", stadiumType: "retractable", isTurf: true, owner: "Jim Irsay", headCoach: "Shane Steichen", primaryColor: "#002C5F", secondaryColor: "#A2AAAD", logoUrl: logoUrl("ind") },
  { abbreviation: "JAX", fullName: "Jacksonville Jaguars", city: "Jacksonville", nickname: "Jaguars", conference: "AFC", division: "South", stadiumName: "EverBank Stadium", stadiumType: "outdoor", isTurf: false, owner: "Shad Khan", headCoach: "Liam Coen", primaryColor: "#101820", secondaryColor: "#D7A22A", logoUrl: logoUrl("jax") },
  { abbreviation: "TEN", fullName: "Tennessee Titans", city: "Nashville", nickname: "Titans", conference: "AFC", division: "South", stadiumName: "Nissan Stadium", stadiumType: "outdoor", isTurf: true, owner: "Amy Adams Strunk", headCoach: "Brian Callahan", primaryColor: "#4B92DB", secondaryColor: "#002244", logoUrl: logoUrl("ten") },
  // AFC West
  { abbreviation: "DEN", fullName: "Denver Broncos", city: "Denver", nickname: "Broncos", conference: "AFC", division: "West", stadiumName: "Empower Field at Mile High", stadiumType: "outdoor", isTurf: false, owner: "Walton-Penner Family Ownership Group", headCoach: "Sean Payton", primaryColor: "#FB4F14", secondaryColor: "#002244", logoUrl: logoUrl("den") },
  { abbreviation: "KC", fullName: "Kansas City Chiefs", city: "Kansas City", nickname: "Chiefs", conference: "AFC", division: "West", stadiumName: "GEHA Field at Arrowhead Stadium", stadiumType: "outdoor", isTurf: false, owner: "Clark Hunt", headCoach: "Andy Reid", primaryColor: "#E31837", secondaryColor: "#FFB81C", logoUrl: logoUrl("kc") },
  { abbreviation: "LV", fullName: "Las Vegas Raiders", city: "Las Vegas", nickname: "Raiders", conference: "AFC", division: "West", stadiumName: "Allegiant Stadium", stadiumType: "dome", isTurf: true, owner: "Mark Davis", headCoach: "Pete Carroll", primaryColor: "#000000", secondaryColor: "#A5ACAF", logoUrl: logoUrl("lv") },
  { abbreviation: "LAC", fullName: "Los Angeles Chargers", city: "Inglewood", nickname: "Chargers", conference: "AFC", division: "West", stadiumName: "SoFi Stadium", stadiumType: "dome", isTurf: true, owner: "Dean Spanos", headCoach: "Jim Harbaugh", primaryColor: "#0080C6", secondaryColor: "#FFC20E", logoUrl: logoUrl("lac") },
  // NFC East
  { abbreviation: "DAL", fullName: "Dallas Cowboys", city: "Arlington", nickname: "Cowboys", conference: "NFC", division: "East", stadiumName: "AT&T Stadium", stadiumType: "retractable", isTurf: true, owner: "Jerry Jones", headCoach: "Brian Schottenheimer", primaryColor: "#041E42", secondaryColor: "#869397", logoUrl: logoUrl("dal") },
  { abbreviation: "NYG", fullName: "New York Giants", city: "East Rutherford", nickname: "Giants", conference: "NFC", division: "East", stadiumName: "MetLife Stadium", stadiumType: "outdoor", isTurf: true, owner: "John Mara and Steve Tisch", headCoach: "Brian Daboll", primaryColor: "#0B2265", secondaryColor: "#A71930", logoUrl: logoUrl("nyg") },
  { abbreviation: "PHI", fullName: "Philadelphia Eagles", city: "Philadelphia", nickname: "Eagles", conference: "NFC", division: "East", stadiumName: "Lincoln Financial Field", stadiumType: "outdoor", isTurf: true, owner: "Jeffrey Lurie", headCoach: "Nick Sirianni", primaryColor: "#004C54", secondaryColor: "#A5ACAF", logoUrl: logoUrl("phi") },
  { abbreviation: "WAS", fullName: "Washington Commanders", city: "Landover", nickname: "Commanders", conference: "NFC", division: "East", stadiumName: "Northwest Stadium", stadiumType: "outdoor", isTurf: true, owner: "Josh Harris", headCoach: "Dan Quinn", primaryColor: "#5A1414", secondaryColor: "#FFB612", logoUrl: logoUrl("wsh") },
  // NFC North
  { abbreviation: "CHI", fullName: "Chicago Bears", city: "Chicago", nickname: "Bears", conference: "NFC", division: "North", stadiumName: "Soldier Field", stadiumType: "outdoor", isTurf: false, owner: "George McCaskey / McCaskey family", headCoach: "Ben Johnson", primaryColor: "#0B162A", secondaryColor: "#C83803", logoUrl: logoUrl("chi") },
  { abbreviation: "DET", fullName: "Detroit Lions", city: "Detroit", nickname: "Lions", conference: "NFC", division: "North", stadiumName: "Ford Field", stadiumType: "dome", isTurf: true, owner: "Sheila Ford Hamp", headCoach: "Dan Campbell", primaryColor: "#0076B6", secondaryColor: "#B0B7BC", logoUrl: logoUrl("det") },
  { abbreviation: "GB", fullName: "Green Bay Packers", city: "Green Bay", nickname: "Packers", conference: "NFC", division: "North", stadiumName: "Lambeau Field", stadiumType: "outdoor", isTurf: false, owner: "Publicly owned (shareholders)", headCoach: "Matt LaFleur", primaryColor: "#203731", secondaryColor: "#FFB612", logoUrl: logoUrl("gb") },
  { abbreviation: "MIN", fullName: "Minnesota Vikings", city: "Minneapolis", nickname: "Vikings", conference: "NFC", division: "North", stadiumName: "U.S. Bank Stadium", stadiumType: "dome", isTurf: true, owner: "Zygi Wilf", headCoach: "Kevin O'Connell", primaryColor: "#4F2683", secondaryColor: "#FFC62F", logoUrl: logoUrl("min") },
  // NFC South
  { abbreviation: "ATL", fullName: "Atlanta Falcons", city: "Atlanta", nickname: "Falcons", conference: "NFC", division: "South", stadiumName: "Mercedes-Benz Stadium", stadiumType: "retractable", isTurf: true, owner: "Arthur Blank", headCoach: "Raheem Morris", primaryColor: "#A71930", secondaryColor: "#000000", logoUrl: logoUrl("atl") },
  { abbreviation: "CAR", fullName: "Carolina Panthers", city: "Charlotte", nickname: "Panthers", conference: "NFC", division: "South", stadiumName: "Bank of America Stadium", stadiumType: "outdoor", isTurf: false, owner: "David Tepper", headCoach: "Dave Canales", primaryColor: "#0085CA", secondaryColor: "#101820", logoUrl: logoUrl("car") },
  { abbreviation: "NO", fullName: "New Orleans Saints", city: "New Orleans", nickname: "Saints", conference: "NFC", division: "South", stadiumName: "Caesars Superdome", stadiumType: "dome", isTurf: true, owner: "Gayle Benson", headCoach: "Kellen Moore", primaryColor: "#D3BC8D", secondaryColor: "#101820", logoUrl: logoUrl("no") },
  { abbreviation: "TB", fullName: "Tampa Bay Buccaneers", city: "Tampa", nickname: "Buccaneers", conference: "NFC", division: "South", stadiumName: "Raymond James Stadium", stadiumType: "outdoor", isTurf: false, owner: "Glazer family", headCoach: "Todd Bowles", primaryColor: "#D50A0A", secondaryColor: "#34302B", logoUrl: logoUrl("tb") },
  // NFC West
  { abbreviation: "ARI", fullName: "Arizona Cardinals", city: "Glendale", nickname: "Cardinals", conference: "NFC", division: "West", stadiumName: "State Farm Stadium", stadiumType: "retractable", isTurf: true, owner: "Michael Bidwill", headCoach: "Jonathan Gannon", primaryColor: "#97233F", secondaryColor: "#000000", logoUrl: logoUrl("ari") },
  { abbreviation: "LAR", fullName: "Los Angeles Rams", city: "Inglewood", nickname: "Rams", conference: "NFC", division: "West", stadiumName: "SoFi Stadium", stadiumType: "dome", isTurf: true, owner: "Stan Kroenke", headCoach: "Sean McVay", primaryColor: "#003594", secondaryColor: "#FFA300", logoUrl: logoUrl("lar") },
  { abbreviation: "SF", fullName: "San Francisco 49ers", city: "Santa Clara", nickname: "49ers", conference: "NFC", division: "West", stadiumName: "Levi's Stadium", stadiumType: "outdoor", isTurf: false, owner: "Jed York", headCoach: "Kyle Shanahan", primaryColor: "#AA0000", secondaryColor: "#B3995D", logoUrl: logoUrl("sf") },
  { abbreviation: "SEA", fullName: "Seattle Seahawks", city: "Seattle", nickname: "Seahawks", conference: "NFC", division: "West", stadiumName: "Lumen Field", stadiumType: "outdoor", isTurf: true, owner: "Jody Allen (trust)", headCoach: "Mike Macdonald", primaryColor: "#002244", secondaryColor: "#69BE28", logoUrl: logoUrl("sea") },
];

async function seedTeams() {
  console.log(`Seeding ${NFL_TEAMS.length} NFL teams...`);
  for (const team of NFL_TEAMS) {
    await db
      .insert(teams)
      .values(team)
      .onConflictDoUpdate({
        target: teams.abbreviation,
        set: team,
      });
  }
  console.log(`Done. ${NFL_TEAMS.length} teams upserted.`);
  process.exit(0);
}

seedTeams().catch(err => { console.error("Team seed failed:", err); process.exit(1); });
