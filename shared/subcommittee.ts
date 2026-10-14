/**
 * Subcommittees: a league formed inside another league, from that league's
 * members only. In the data it's an ordinary league with a parent
 * (leagues.parent_league_id) and the same roles; only the names differ.
 * The rules (parent members only, one level deep, leaving the league leaves
 * its subcommittees) are kept by the database: migration 0032.
 */

type MaybeSubcommittee = { parentLeagueId?: number | null } | null | undefined;

export function isSubcommittee(league: MaybeSubcommittee): boolean {
  return league?.parentLeagueId != null;
}

export type LeagueTerms = {
  /** "League" or "Subcommittee". */
  kind: string;
  kindLower: string;
  /** The 'admin' role: who runs it. */
  admin: string;
  /** The 'lieutenant' role. */
  lieutenant: string;
  lieutenants: string;
};

const LEAGUE_TERMS: LeagueTerms = {
  kind: "League", kindLower: "league", admin: "Parlay Maestro", lieutenant: "Parlay Lieutenant", lieutenants: "Parlay Lieutenants",
};
const SUBCOMMITTEE_TERMS: LeagueTerms = {
  kind: "Subcommittee", kindLower: "subcommittee", admin: "Frondeur", lieutenant: "Minion", lieutenants: "Minions",
};

/** What to call a league and its roles on screen. */
export function leagueTerms(league: MaybeSubcommittee): LeagueTerms {
  return isSubcommittee(league) ? SUBCOMMITTEE_TERMS : LEAGUE_TERMS;
}

/** A member's role as shown: "Frondeur" in a subcommittee, "Parlay Maestro" in a league. */
export function roleLabel(league: MaybeSubcommittee, role: string | null | undefined): string {
  const terms = leagueTerms(league);
  if (role === "admin") return terms.admin;
  if (role === "lieutenant") return terms.lieutenant;
  return "Member";
}

/** Thrown when a subcommittee rule stops something; the message is for the member. */
export class SubcommitteeError extends Error {}

/**
 * Leagues in list order with each subcommittee straight after its league.
 * A subcommittee whose league isn't in the list keeps its own place.
 */
export function withSubcommitteesNested<L extends { id: number; parentLeagueId?: number | null }>(leagues: L[]): L[] {
  const ids = new Set(leagues.map((l) => l.id));
  const nested = (l: L) => l.parentLeagueId != null && ids.has(l.parentLeagueId);
  return leagues.filter((l) => !nested(l)).flatMap((l) => [l, ...leagues.filter((sub) => sub.parentLeagueId === l.id)]);
}

type RosterMember = { userId: string; isActive?: boolean | null };

/**
 * Who can be put in a subcommittee: the league's active members, less
 * anyone already in (`exclude`).
 */
export function subcommitteeCandidates<M extends RosterMember>(parentMembers: M[] | undefined, exclude: Iterable<string> = []): M[] {
  const skip = new Set(exclude);
  return (parentMembers ?? []).filter((m) => m.isActive !== false && !skip.has(m.userId));
}

// Longest names first, so "Parlay Lieutenants" isn't caught by "Lieutenant".
const SUBCOMMITTEE_WORDING: [RegExp, string][] = [
  [/Parlay Maestros/g, "Frondeurs"],
  [/Parlay Maestro/g, "Frondeur"],
  [/Parlay Lieutenants/g, "Minions"],
  [/Parlay Lieutenant/g, "Minion"],
  [/Maestros/g, "Frondeurs"],
  [/Maestro/g, "Frondeur"],
  [/Lieutenants/g, "Minions"],
  [/Lieutenant/g, "Minion"],
  [/lieutenants/g, "minions"],
  [/lieutenant/g, "minion"],
];
// The word "league" is left alone on purpose: it turns up in league names.

/**
 * A sentence written for a league, reworded for a subcommittee ("Ask the
 * Parlay Maestro" becomes "Ask the Frondeur"). Unchanged for an ordinary
 * league. For text that isn't worth a variant of its own: error messages,
 * help lines, alerts.
 */
export function subcommitteeWording(text: string, league: MaybeSubcommittee): string;
export function subcommitteeWording(text: string | null | undefined, league: MaybeSubcommittee): string | null | undefined;
export function subcommitteeWording(text: string | null | undefined, league: MaybeSubcommittee): string | null | undefined {
  if (!text || !isSubcommittee(league)) return text;
  return SUBCOMMITTEE_WORDING.reduce((out, [from, to]) => out.replace(from, to), text);
}
