/**
 * Idempotent seed for the `teams` reference table — all 32 current NFL teams.
 *
 * Run with:
 *   npm run db:seed-teams
 */

import { db } from "../server/db";
import { teams, type InsertTeam } from "../shared/schema";

const NFL_TEAMS: InsertTeam[] = [
  // AFC East
  { abbreviation: "BUF", fullName: "Buffalo Bills", city: "Buffalo", nickname: "Bills", conference: "AFC", division: "East", stadiumName: "Highmark Stadium", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "MIA", fullName: "Miami Dolphins", city: "Miami", nickname: "Dolphins", conference: "AFC", division: "East", stadiumName: "Hard Rock Stadium", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "NE", fullName: "New England Patriots", city: "Foxborough", nickname: "Patriots", conference: "AFC", division: "East", stadiumName: "Gillette Stadium", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "NYJ", fullName: "New York Jets", city: "East Rutherford", nickname: "Jets", conference: "AFC", division: "East", stadiumName: "MetLife Stadium", stadiumType: "outdoor", isTurf: true },
  // AFC North
  { abbreviation: "BAL", fullName: "Baltimore Ravens", city: "Baltimore", nickname: "Ravens", conference: "AFC", division: "North", stadiumName: "M&T Bank Stadium", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "CIN", fullName: "Cincinnati Bengals", city: "Cincinnati", nickname: "Bengals", conference: "AFC", division: "North", stadiumName: "Paycor Stadium", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "CLE", fullName: "Cleveland Browns", city: "Cleveland", nickname: "Browns", conference: "AFC", division: "North", stadiumName: "Huntington Bank Field", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "PIT", fullName: "Pittsburgh Steelers", city: "Pittsburgh", nickname: "Steelers", conference: "AFC", division: "North", stadiumName: "Acrisure Stadium", stadiumType: "outdoor", isTurf: false },
  // AFC South
  { abbreviation: "HOU", fullName: "Houston Texans", city: "Houston", nickname: "Texans", conference: "AFC", division: "South", stadiumName: "NRG Stadium", stadiumType: "retractable", isTurf: true },
  { abbreviation: "IND", fullName: "Indianapolis Colts", city: "Indianapolis", nickname: "Colts", conference: "AFC", division: "South", stadiumName: "Lucas Oil Stadium", stadiumType: "retractable", isTurf: true },
  { abbreviation: "JAX", fullName: "Jacksonville Jaguars", city: "Jacksonville", nickname: "Jaguars", conference: "AFC", division: "South", stadiumName: "EverBank Stadium", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "TEN", fullName: "Tennessee Titans", city: "Nashville", nickname: "Titans", conference: "AFC", division: "South", stadiumName: "Nissan Stadium", stadiumType: "outdoor", isTurf: true },
  // AFC West
  { abbreviation: "DEN", fullName: "Denver Broncos", city: "Denver", nickname: "Broncos", conference: "AFC", division: "West", stadiumName: "Empower Field at Mile High", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "KC", fullName: "Kansas City Chiefs", city: "Kansas City", nickname: "Chiefs", conference: "AFC", division: "West", stadiumName: "GEHA Field at Arrowhead Stadium", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "LV", fullName: "Las Vegas Raiders", city: "Las Vegas", nickname: "Raiders", conference: "AFC", division: "West", stadiumName: "Allegiant Stadium", stadiumType: "dome", isTurf: true },
  { abbreviation: "LAC", fullName: "Los Angeles Chargers", city: "Inglewood", nickname: "Chargers", conference: "AFC", division: "West", stadiumName: "SoFi Stadium", stadiumType: "dome", isTurf: true },
  // NFC East
  { abbreviation: "DAL", fullName: "Dallas Cowboys", city: "Arlington", nickname: "Cowboys", conference: "NFC", division: "East", stadiumName: "AT&T Stadium", stadiumType: "retractable", isTurf: true },
  { abbreviation: "NYG", fullName: "New York Giants", city: "East Rutherford", nickname: "Giants", conference: "NFC", division: "East", stadiumName: "MetLife Stadium", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "PHI", fullName: "Philadelphia Eagles", city: "Philadelphia", nickname: "Eagles", conference: "NFC", division: "East", stadiumName: "Lincoln Financial Field", stadiumType: "outdoor", isTurf: true },
  { abbreviation: "WAS", fullName: "Washington Commanders", city: "Landover", nickname: "Commanders", conference: "NFC", division: "East", stadiumName: "Northwest Stadium", stadiumType: "outdoor", isTurf: true },
  // NFC North
  { abbreviation: "CHI", fullName: "Chicago Bears", city: "Chicago", nickname: "Bears", conference: "NFC", division: "North", stadiumName: "Soldier Field", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "DET", fullName: "Detroit Lions", city: "Detroit", nickname: "Lions", conference: "NFC", division: "North", stadiumName: "Ford Field", stadiumType: "dome", isTurf: true },
  { abbreviation: "GB", fullName: "Green Bay Packers", city: "Green Bay", nickname: "Packers", conference: "NFC", division: "North", stadiumName: "Lambeau Field", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "MIN", fullName: "Minnesota Vikings", city: "Minneapolis", nickname: "Vikings", conference: "NFC", division: "North", stadiumName: "U.S. Bank Stadium", stadiumType: "dome", isTurf: true },
  // NFC South
  { abbreviation: "ATL", fullName: "Atlanta Falcons", city: "Atlanta", nickname: "Falcons", conference: "NFC", division: "South", stadiumName: "Mercedes-Benz Stadium", stadiumType: "retractable", isTurf: true },
  { abbreviation: "CAR", fullName: "Carolina Panthers", city: "Charlotte", nickname: "Panthers", conference: "NFC", division: "South", stadiumName: "Bank of America Stadium", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "NO", fullName: "New Orleans Saints", city: "New Orleans", nickname: "Saints", conference: "NFC", division: "South", stadiumName: "Caesars Superdome", stadiumType: "dome", isTurf: true },
  { abbreviation: "TB", fullName: "Tampa Bay Buccaneers", city: "Tampa", nickname: "Buccaneers", conference: "NFC", division: "South", stadiumName: "Raymond James Stadium", stadiumType: "outdoor", isTurf: false },
  // NFC West
  { abbreviation: "ARI", fullName: "Arizona Cardinals", city: "Glendale", nickname: "Cardinals", conference: "NFC", division: "West", stadiumName: "State Farm Stadium", stadiumType: "retractable", isTurf: true },
  { abbreviation: "LAR", fullName: "Los Angeles Rams", city: "Inglewood", nickname: "Rams", conference: "NFC", division: "West", stadiumName: "SoFi Stadium", stadiumType: "dome", isTurf: true },
  { abbreviation: "SF", fullName: "San Francisco 49ers", city: "Santa Clara", nickname: "49ers", conference: "NFC", division: "West", stadiumName: "Levi's Stadium", stadiumType: "outdoor", isTurf: false },
  { abbreviation: "SEA", fullName: "Seattle Seahawks", city: "Seattle", nickname: "Seahawks", conference: "NFC", division: "West", stadiumName: "Lumen Field", stadiumType: "outdoor", isTurf: true },
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
