/**
 * What a league calls the member who busts a losing parlay first, and the one
 * whose bet is the last to come in on a winning parlay. The Parlay Maestro
 * picks one of each in League Settings; the key is what's stored on the league.
 */

export const LOSER_LABEL_TEXT = {
  parlay_loser: "Parlay Loser",
  asshole: "Asshole",
  jerry: "Jerry",
  dud: "Dud",
  doofus: "Doofus",
} as const;

export const HERO_LABEL_TEXT = {
  parlay_hero: "Parlay Hero",
  mvp: "MVP",
  legend: "Legend",
  big_time: "Big Time",
  hoss: "Hoss",
} as const;

export type LoserLabel = keyof typeof LOSER_LABEL_TEXT;
export type HeroLabel = keyof typeof HERO_LABEL_TEXT;

export const LOSER_LABELS = Object.keys(LOSER_LABEL_TEXT) as [LoserLabel, ...LoserLabel[]];
export const HERO_LABELS = Object.keys(HERO_LABEL_TEXT) as [HeroLabel, ...HeroLabel[]];

export function loserLabelText(key: string | null | undefined): string {
  return LOSER_LABEL_TEXT[key as LoserLabel] ?? LOSER_LABEL_TEXT.parlay_loser;
}

export function heroLabelText(key: string | null | undefined): string {
  return HERO_LABEL_TEXT[key as HeroLabel] ?? HERO_LABEL_TEXT.parlay_hero;
}

/** The siren on a shame report's slides, unless the league picked its own. */
export const DEFAULT_SHAME_EMOJI = "🚨";
/** The bell around a shame report's text title, unless the league picked its own. */
export const DEFAULT_SHAME_TEXT_EMOJI = "🔔";

/** Emoji the Parlay Maestro can pick for the league's shame report. */
export const SHAME_EMOJI_CHOICES = ["🚨", "🔔", "💩", "🤡", "🗑️", "💀", "🫏", "🍑", "🧻", "🤦", "📉", "🪦"] as const;
