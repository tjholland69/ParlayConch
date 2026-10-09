/**
 * What the app's words mean, written for a reader who has never used it: a
 * person opening an export, or an AI model answering questions through the
 * connector (server/mcp.ts serves this as its `get_glossary` tool and as the
 * server's instructions). Keep it true to the rules in shared/weekParlays.ts
 * and the grading in server/storage.ts.
 */
export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "League", meaning: "A group of friends who bet together. Everything else belongs to a league." },
  { term: "Week", meaning: "One NFL week of a season, e.g. season 2026, week 5. Exactly one week is active (being played) at a time." },
  { term: "Parlay", meaning: "A league's shared ticket for one week. Every leg in it has to win for the parlay to win. A league usually runs one a week." },
  { term: "Leg (bet, pick)", meaning: "One bet inside a parlay. Each member adds exactly one leg of their own to the league's parlay." },
  { term: "Bet owner", meaning: "The member whose leg it is. Records and win rates count legs per bet owner, not whole parlays." },
  { term: "Bet type", meaning: "spread, moneyline, over, under (the last two are game totals), or player_prop (a player's stat, e.g. rush_yards over 54.5)." },
  { term: "Line", meaning: "The number a bet was taken at: the point spread, the total, or the prop's stat line." },
  { term: "Odds", meaning: "American odds: -110 means risk 110 to win 100, +150 means risk 100 to win 150." },
  { term: "Leg result", meaning: "win, loss or push. Empty means not decided yet. A push ties the line exactly: the leg drops out of the parlay without losing it." },
  { term: "Parlay status", meaning: "draft (open, still taking picks) -> pending (locked or submitted, awaiting the Maestro) -> approved -> sent / placed (at the sportsbook) -> win or loss. Also rejected and void. A parlay never pushes: it loses the moment one leg loses, and wins once every leg has settled without a loss." },
  { term: "Void", meaning: "A member with no leg in a week's parlay when it locked is Void for that week. It counts against their participation, not their win rate." },
  { term: "Locked", meaning: "Picks for the week are closed. Once the first game on the ticket kicks off the parlay is In Progress and the lock is permanent." },
  { term: "Parlay Maestro", meaning: "The league's admin: approves parlays, places the bet, and can lock, unlock and override." },
  { term: "Lieutenant", meaning: "A member the Maestro has given some of the Maestro's permissions." },
  { term: "Parlay Loser", meaning: "In a lost parlay, the member whose leg was the first to lose. Each league picks its own word for this (Asshole, Jerry, Dud, Doofus), so reports show that word; the role is the same." },
  { term: "Parlay Hero", meaning: "In a won parlay, the member whose winning leg was the last to be decided. Leagues can rename this too (MVP, Legend, Big Time, Hoss)." },
  { term: "Win rate", meaning: "Legs won as a percentage of legs won plus lost. Pushes and undecided legs are left out." },
  { term: "Participation", meaning: "The share of eligible weeks in which a member had a leg in." },
  { term: "Power score", meaning: "A member's average over their decided legs of (won ? a factor from the leg's odds : 0). Winning longer odds counts for more." },
  { term: "Placed", meaning: "A locked parlay that is in at a sportsbook. Any member can confirm it, and a locked parlay is taken as placed once its first game kicks off." },
  { term: "Suss Meter", meaning: "Members can anonymously down-vote another member's pick in an open parlay. Once more than half the other members have, the pick shows a meter; it is full when everyone but the pick's owner has." },
  { term: "Illogical Bet", meaning: "Two bets in one parlay that work against each other or mostly win and lose together, such as a moneyline and a spread on one game, or a player's under alongside a bet on his team. Allowed, with a warning." },
  { term: "BAR", meaning: "Bets Above Replacement: power score times participation, minus the league's average of the same. Positive is above the league average." },
  { term: "Slate", meaning: "The broadcast window a game kicks off in, US Eastern time: Morning, Early Slate, Afternoon Slate or Primetime." },
  { term: "On Behalf Of", meaning: "A leg one member made for another. It belongs to the member it was made for, who has to approve it." },
];

export function glossaryMarkdown(): string {
  return ["# Parlay.Conch glossary", "", ...GLOSSARY.map((g) => `- **${g.term}**: ${g.meaning}`)].join("\n") + "\n";
}
