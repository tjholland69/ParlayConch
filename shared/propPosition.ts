import { PLAYER_PROP_TYPES } from "./schema";

type PropOption = (typeof PLAYER_PROP_TYPES)[number];

/** Prop types that make sense for a position, most common first. The first
 * entry is the position's primary stat. */
const POSITION_PROPS: Record<string, string[]> = {
  QB: ["pass_yards", "pass_tds", "pass_completions", "pass_attempts", "interceptions", "rush_yards", "rush_tds", "anytime_td"],
  RB: ["rush_yards", "rush_attempts", "rush_tds", "rec_yards", "receptions", "all_purpose_yards", "anytime_td", "first_td", "last_td"],
  WR: ["rec_yards", "receptions", "rec_tds", "all_purpose_yards", "rush_yards", "anytime_td", "first_td", "last_td"],
  K: ["kicking_pts", "fg_made"],
  DEF: ["tackles", "sacks"],
  // Linemen and specialists have no stat line of their own to bet on, but
  // they're on offense, so they never get the defensive props either.
  LINE: ["anytime_td", "first_td", "last_td"],
};

const POSITION_GROUP: Record<string, keyof typeof POSITION_PROPS> = {
  QB: "QB",
  RB: "RB", FB: "RB", HB: "RB",
  WR: "WR", TE: "WR",
  K: "K", PK: "K",
  DE: "DEF", DT: "DEF", DL: "DEF", NT: "DEF", LB: "DEF", OLB: "DEF", ILB: "DEF", MLB: "DEF",
  CB: "DEF", S: "DEF", SS: "DEF", FS: "DEF", SAF: "DEF", DB: "DEF", EDGE: "DEF",
  OT: "LINE", T: "LINE", G: "LINE", OG: "LINE", C: "LINE", OL: "LINE", LS: "LINE", P: "LINE",
};

/**
 * Prop types to offer for a player, split into the ones that fit their
 * position (primary stat first) and everything else. An unknown or missing
 * position puts every prop type in `primary`, in the catalog's own order.
 */
export function propTypesForPosition(position: string | null | undefined): {
  primary: PropOption[];
  other: PropOption[];
} {
  const group = position ? POSITION_GROUP[position.trim().toUpperCase()] : undefined;
  if (!group) return { primary: [...PLAYER_PROP_TYPES], other: [] };
  const wanted = POSITION_PROPS[group];
  const primary = wanted
    .map((value) => PLAYER_PROP_TYPES.find((p) => p.value === value))
    .filter((p): p is PropOption => !!p);
  const other = PLAYER_PROP_TYPES.filter((p) => !wanted.includes(p.value));
  return { primary, other };
}

/** The stat a prop on this player most likely is, e.g. passing yards for a QB. */
export function primaryPropType(position: string | null | undefined): string {
  return propTypesForPosition(position).primary[0].value;
}
