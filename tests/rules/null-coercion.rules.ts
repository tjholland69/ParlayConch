import {
  emptyToNull,
  nullishToNull,
  normalizeImportLegFields,
  normalizeJoinedGame,
} from "../../shared/dataIntegrity";

export type NullCoercionRule = {
  id: string;
  description: string;
  fn: "emptyToNull" | "nullishToNull" | "normalizeJoinedGame";
  input: unknown;
  expected: unknown;
};

export const NULL_COERCION_RULES: NullCoercionRule[] = [
  // emptyToNull — API boundary: empty string → SQL null
  {
    id: "emptyToNull.undefined",
    description: "undefined becomes null",
    fn: "emptyToNull",
    input: undefined,
    expected: null,
  },
  {
    id: "emptyToNull.null",
    description: "null stays null",
    fn: "emptyToNull",
    input: null,
    expected: null,
  },
  {
    id: "emptyToNull.empty-string",
    description: "empty string becomes null",
    fn: "emptyToNull",
    input: "",
    expected: null,
  },
  {
    id: "emptyToNull.whitespace",
    description: "whitespace-only string is preserved (not empty)",
    fn: "emptyToNull",
    input: " ",
    expected: " ",
  },
  {
    id: "emptyToNull.zero-string",
    description: 'string "0" is preserved (not falsy-empty)',
    fn: "emptyToNull",
    input: "0",
    expected: "0",
  },
  {
    id: "emptyToNull.line-value",
    description: "spread line preserved",
    fn: "emptyToNull",
    input: "-3.5",
    expected: "-3.5",
  },
  {
    id: "emptyToNull.odds-value",
    description: "American odds preserved",
    fn: "emptyToNull",
    input: "+130",
    expected: "+130",
  },

  // nullishToNull — storage import path: only null/undefined → null
  {
    id: "nullishToNull.undefined",
    description: "undefined becomes null",
    fn: "nullishToNull",
    input: undefined,
    expected: null,
  },
  {
    id: "nullishToNull.empty-string-preserved",
    description: "empty string is preserved (differs from emptyToNull)",
    fn: "nullishToNull",
    input: "",
    expected: "",
  },
  {
    id: "nullishToNull.zero-preserved",
    description: "numeric zero preserved",
    fn: "nullishToNull",
    input: 0,
    expected: 0,
  },
  {
    id: "nullishToNull.gameId",
    description: "valid gameId preserved",
    fn: "nullishToNull",
    input: 42,
    expected: 42,
  },

  // normalizeJoinedGame — left join normalization
  {
    id: "normalizeJoinedGame.null",
    description: "null game stays null",
    fn: "normalizeJoinedGame",
    input: null,
    expected: null,
  },
  {
    id: "normalizeJoinedGame.undefined",
    description: "undefined join becomes null",
    fn: "normalizeJoinedGame",
    input: undefined,
    expected: null,
  },
  {
    id: "normalizeJoinedGame.object",
    description: "game row preserved",
    fn: "normalizeJoinedGame",
    input: { id: 1, homeTeam: "KC" },
    expected: { id: 1, homeTeam: "KC" },
  },
];

export function applyNullCoercionRule(rule: NullCoercionRule): unknown {
  switch (rule.fn) {
    case "emptyToNull":
      return emptyToNull(rule.input as string | null | undefined);
    case "nullishToNull":
      return nullishToNull(rule.input);
    case "normalizeJoinedGame":
      return normalizeJoinedGame(rule.input);
  }
}

export type ImportLegNormalizationRule = {
  id: string;
  description: string;
  leg: Parameters<typeof normalizeImportLegFields>[0];
  isPlayerProp: boolean;
  expected: ReturnType<typeof normalizeImportLegFields>;
};

export const IMPORT_LEG_NORMALIZATION_RULES: ImportLegNormalizationRule[] = [
  {
    id: "import.spread-nullables",
    description: "Spread leg empty strings become null",
    isPlayerProp: false,
    leg: { line: "", odds: "", gameSegment: "", result: "", notes: "" },
    expected: {
      line: null,
      odds: null,
      gameSegment: null,
      result: null,
      playerName: null,
      propType: null,
      notes: null,
    },
  },
  {
    id: "import.spread-values-preserved",
    description: "Spread leg values preserved",
    isPlayerProp: false,
    leg: { line: "-3", odds: "-110", result: "win" },
    expected: {
      line: "-3",
      odds: "-110",
      gameSegment: null,
      result: "win",
      playerName: null,
      propType: null,
      notes: null,
    },
  },
  {
    id: "import.player-prop-null-game",
    description: "Player prop keeps player fields, clears non-prop fields on game bets",
    isPlayerProp: true,
    leg: {
      line: "64.5",
      playerName: "Travis Kelce",
      propType: "rec_yards",
      result: null,
    },
    expected: {
      line: "64.5",
      odds: null,
      gameSegment: null,
      result: null,
      playerName: "Travis Kelce",
      propType: "rec_yards",
      notes: null,
    },
  },
  {
    id: "import.non-prop-strips-player-fields",
    description: "Non-prop bets force playerName/propType to null",
    isPlayerProp: false,
    leg: { playerName: "Should strip", propType: "rec_yards", line: "-3" },
    expected: {
      line: "-3",
      odds: null,
      gameSegment: null,
      result: null,
      playerName: null,
      propType: null,
      notes: null,
    },
  },
];
