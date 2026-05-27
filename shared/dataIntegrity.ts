/**
 * Boundary helpers for nullable DB columns.
 * Empty strings are stored as SQL NULL to avoid ambiguous "" vs null rows.
 */
import type { AddParlayLegInput } from "./routeValidation";
import type { InsertParlayLeg } from "./schema";

export function emptyToNull(value: string | null | undefined): string | null {
  return value || null;
}

export function nullishToNull<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

/** Normalize joined game rows so API consumers always see Game | null, never undefined. */
export function normalizeJoinedGame<T>(game: T | null | undefined): T | null {
  return game ?? null;
}

/** Mirrors import route leg field normalization before DB writes. */
export function normalizeImportLegFields(
  leg: {
    line?: string | null;
    odds?: string | null;
    gameSegment?: string | null;
    result?: string | null;
    playerName?: string | null;
    propType?: string | null;
    notes?: string | null;
  },
  isPlayerProp: boolean,
) {
  return {
    line: emptyToNull(leg.line),
    odds: emptyToNull(leg.odds),
    gameSegment: emptyToNull(leg.gameSegment),
    result: emptyToNull(leg.result),
    playerName: isPlayerProp ? emptyToNull(leg.playerName) : null,
    propType: isPlayerProp ? emptyToNull(leg.propType) : null,
    notes: emptyToNull(leg.notes),
  };
}

export type ParlayLegPatch = {
  betType?: string;
  pick?: string;
  line?: string | null;
  odds?: string | null;
  result?: string | null;
  playerName?: string | null;
  propType?: string | null;
  notes?: string | null;
  gameSegment?: string | null;
};

const PARLAY_LEG_STRING_FIELDS = [
  "line",
  "odds",
  "result",
  "playerName",
  "propType",
  "notes",
  "gameSegment",
] as const;

/** Only include provided PATCH fields; coerce empty strings to SQL null on string columns. */
export function normalizeParlayLegPatch(updates: ParlayLegPatch): ParlayLegPatch {
  const normalized: ParlayLegPatch = {};

  if (updates.betType !== undefined) normalized.betType = updates.betType;
  if (updates.pick !== undefined) normalized.pick = updates.pick;

  for (const field of PARLAY_LEG_STRING_FIELDS) {
    if (updates[field] !== undefined) {
      normalized[field] = emptyToNull(updates[field]);
    }
  }

  return normalized;
}

/** Strip unknown keys and undefined leg updates before storage.updateParlay. */
export function normalizeUpdateParlayInput(updates: {
  status?: string;
  legs?: { id: number; result?: string | null; notes?: string | null }[];
}) {
  const normalized: {
    status?: string;
    legs?: { id: number; result?: string | null; notes?: string | null }[];
  } = {};

  if (updates.status !== undefined) normalized.status = updates.status;

  if (updates.legs !== undefined) {
    normalized.legs = updates.legs.map((leg) => {
      const legUpdate: { id: number; result?: string | null; notes?: string | null } = {
        id: leg.id,
      };
      if (leg.result !== undefined) legUpdate.result = leg.result;
      if (leg.notes !== undefined) legUpdate.notes = emptyToNull(leg.notes);
      return legUpdate;
    });
  }

  return normalized;
}

/** Normalize demo editor add-leg body before DB insert. */
export function normalizeAddParlayLegInput(
  input: AddParlayLegInput,
): Omit<InsertParlayLeg, "parlayId"> {
  return {
    betType: input.betType,
    pick: input.pick,
    line: emptyToNull(input.line),
    odds: emptyToNull(input.odds),
    playerName: emptyToNull(input.playerName),
    propType: emptyToNull(input.propType),
    notes: emptyToNull(input.notes),
    gameSegment: emptyToNull(input.gameSegment),
  };
}
