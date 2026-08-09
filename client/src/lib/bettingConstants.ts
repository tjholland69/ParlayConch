import { PLAYER_PROP_TYPES } from "@shared/schema";

export const BET_TYPES = ["spread", "moneyline", "over", "under", "player_prop"] as const;
export type BetType = (typeof BET_TYPES)[number];

export const BET_TYPE_OPTIONS: { value: BetType; label: string }[] = [
  { value: "spread", label: "Spread" },
  { value: "moneyline", label: "Moneyline" },
  { value: "over", label: "Over" },
  { value: "under", label: "Under" },
  { value: "player_prop", label: "Player Prop" },
];

export const PROP_TYPE_OPTIONS = PLAYER_PROP_TYPES.map((p) => ({
  value: p.value,
  label: p.label,
}));

export const RESULTS = ["", "win", "loss", "push"] as const;
export type LegResult = (typeof RESULTS)[number];
