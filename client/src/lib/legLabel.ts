import { PLAYER_PROP_TYPES } from "@shared/schema";

type LegLike = {
  betType?: string | null;
  playerName?: string | null;
  propType?: string | null;
  game?: { awayTeam?: string | null; homeTeam?: string | null } | null;
};

function propTypeDisplay(propType: string | null | undefined): string | null {
  if (!propType) return null;
  const known = PLAYER_PROP_TYPES.find((p) => p.value === propType);
  if (known) return known.label;
  return propType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Compact table label (ParlayRollupCard). */
export function legLabel(leg: LegLike): string {
  if (leg.betType === "player_prop") {
    return leg.playerName || "Player Prop";
  }
  if (leg.game) return `${leg.game.awayTeam} @ ${leg.game.homeTeam}`;
  return "Unknown Matchup";
}

/** Matchup/prop column in the lookthrough table. Props show only the player —
 * the prop type is already spelled out in the Pick column (formatPickLabel). */
export function legMatchup(leg: LegLike): string {
  if (leg.betType === "player_prop") {
    return leg.playerName || "Player";
  }
  return `${leg.game?.awayTeam ?? "?"} @ ${leg.game?.homeTeam ?? "?"}`;
}

/** Free-text haystack for history query filtering. */
export function legMatchupText(leg: LegLike): string {
  if (leg.betType === "player_prop") {
    return `${leg.playerName ?? ""} ${leg.propType ?? ""}`;
  }
  return `${leg.game?.awayTeam ?? ""} ${leg.game?.homeTeam ?? ""}`;
}

export { legChipLabel } from "@shared/formatPick";
