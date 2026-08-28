/** Simple team-color badges used as a default avatar option — not official
 * logos (no licensed image assets), just each team's primary color plus its
 * abbreviation. See settings.tsx's avatar picker and Avatar.tsx's rendering. */
export interface NflTeamBadge {
  code: string;
  name: string;
  color: string;
}

export const NFL_TEAMS: NflTeamBadge[] = [
  { code: "ARI", name: "Cardinals", color: "#97233F" },
  { code: "ATL", name: "Falcons", color: "#A71930" },
  { code: "BAL", name: "Ravens", color: "#241773" },
  { code: "BUF", name: "Bills", color: "#00338D" },
  { code: "CAR", name: "Panthers", color: "#0085CA" },
  { code: "CHI", name: "Bears", color: "#0B162A" },
  { code: "CIN", name: "Bengals", color: "#FB4F14" },
  { code: "CLE", name: "Browns", color: "#311D00" },
  { code: "DAL", name: "Cowboys", color: "#041E42" },
  { code: "DEN", name: "Broncos", color: "#FB4F14" },
  { code: "DET", name: "Lions", color: "#0076B6" },
  { code: "GB", name: "Packers", color: "#203731" },
  { code: "HOU", name: "Texans", color: "#03202F" },
  { code: "IND", name: "Colts", color: "#002C5F" },
  { code: "JAX", name: "Jaguars", color: "#101820" },
  { code: "KC", name: "Chiefs", color: "#E31837" },
  { code: "LV", name: "Raiders", color: "#000000" },
  { code: "LAC", name: "Chargers", color: "#0080C6" },
  { code: "LAR", name: "Rams", color: "#003594" },
  { code: "MIA", name: "Dolphins", color: "#008E97" },
  { code: "MIN", name: "Vikings", color: "#4F2683" },
  { code: "NE", name: "Patriots", color: "#002244" },
  { code: "NO", name: "Saints", color: "#D3BC8D" },
  { code: "NYG", name: "Giants", color: "#0B2265" },
  { code: "NYJ", name: "Jets", color: "#125740" },
  { code: "PHI", name: "Eagles", color: "#004C54" },
  { code: "PIT", name: "Steelers", color: "#FFB612" },
  { code: "SF", name: "49ers", color: "#AA0000" },
  { code: "SEA", name: "Seahawks", color: "#002244" },
  { code: "TB", name: "Buccaneers", color: "#D50A0A" },
  { code: "TEN", name: "Titans", color: "#0C2340" },
  { code: "WAS", name: "Commanders", color: "#5A1414" },
];
