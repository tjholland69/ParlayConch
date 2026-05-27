import {
  normalizeAddParlayLegInput,
  normalizeParlayLegPatch,
  normalizeUpdateParlayInput,
} from "../../shared/dataIntegrity";

export type ParlayLegPatchRule = {
  id: string;
  description: string;
  input: Parameters<typeof normalizeParlayLegPatch>[0];
  expected: ReturnType<typeof normalizeParlayLegPatch>;
};

export const PARLAY_LEG_PATCH_RULES: ParlayLegPatchRule[] = [
  {
    id: "legPatch.empty-line-to-null",
    description: "Empty line string coerced to SQL null",
    input: { line: "" },
    expected: { line: null },
  },
  {
    id: "legPatch.preserve-odds",
    description: "Odds value preserved",
    input: { odds: "+130" },
    expected: { odds: "+130" },
  },
  {
    id: "legPatch.explicit-null-result",
    description: "Explicit null result preserved for clearing settlement",
    input: { result: null },
    expected: { result: null },
  },
  {
    id: "legPatch.omits-undefined",
    description: "Undefined fields omitted from DB update payload",
    input: { line: "-3", odds: undefined, result: "win" },
    expected: { line: "-3", result: "win" },
  },
  {
    id: "legPatch.player-prop-nullables",
    description: "Player prop fields accept explicit null",
    input: { playerName: null, propType: null, notes: "" },
    expected: { playerName: null, propType: null, notes: null },
  },
];

export type UpdateParlayInputRule = {
  id: string;
  description: string;
  input: Parameters<typeof normalizeUpdateParlayInput>[0];
  expected: ReturnType<typeof normalizeUpdateParlayInput>;
};

export const UPDATE_PARLAY_INPUT_RULES: UpdateParlayInputRule[] = [
  {
    id: "parlayPatch.status-only",
    description: "Status-only update passes through",
    input: { status: "approved" },
    expected: { status: "approved" },
  },
  {
    id: "parlayPatch.empty-notes-to-null",
    description: "Empty notes string coerced to null",
    input: { legs: [{ id: 1, notes: "" }] },
    expected: { legs: [{ id: 1, notes: null }] },
  },
  {
    id: "parlayPatch.null-result-preserved",
    description: "Explicit null leg result preserved",
    input: { legs: [{ id: 2, result: null }] },
    expected: { legs: [{ id: 2, result: null }] },
  },
  {
    id: "parlayPatch.undefined-result-omitted",
    description: "Undefined result omitted so DB value unchanged",
    input: { legs: [{ id: 3 }] },
    expected: { legs: [{ id: 3 }] },
  },
];

export type AddParlayLegInputRule = {
  id: string;
  description: string;
  input: Parameters<typeof normalizeAddParlayLegInput>[0];
  expected: ReturnType<typeof normalizeAddParlayLegInput>;
};

export const ADD_PARLAY_LEG_INPUT_RULES: AddParlayLegInputRule[] = [
  {
    id: "addLeg.empty-line-to-null",
    description: "Empty line coerced to SQL null on insert",
    input: { betType: "moneyline", pick: "away", line: "" },
    expected: {
      betType: "moneyline",
      pick: "away",
      line: null,
      odds: null,
      playerName: null,
      propType: null,
      notes: null,
      gameSegment: null,
    },
  },
  {
    id: "addLeg.values-preserved",
    description: "Spread leg values preserved",
    input: { betType: "spread", pick: "home", line: "-3", odds: "-110" },
    expected: {
      betType: "spread",
      pick: "home",
      line: "-3",
      odds: "-110",
      playerName: null,
      propType: null,
      notes: null,
      gameSegment: null,
    },
  },
  {
    id: "addLeg.player-prop",
    description: "Player prop fields normalized",
    input: {
      betType: "player_prop",
      pick: "over",
      line: "50.5",
      playerName: "Kelce",
      propType: "rec_yards",
    },
    expected: {
      betType: "player_prop",
      pick: "over",
      line: "50.5",
      odds: null,
      playerName: "Kelce",
      propType: "rec_yards",
      notes: null,
      gameSegment: null,
    },
  },
];
