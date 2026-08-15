import { expect } from "vitest";
import type { ImportParlayLeg } from "../../shared/schema";

export type StorageNullIntegrityScenario = {
  id: string;
  description: string;
  legs: ImportParlayLeg[];
  assertLeg: (leg: {
    gameId: number | null;
    line: string | null;
    odds: string | null;
    result: string | null;
    playerName: string | null;
    propType: string | null;
    notes: string | null;
    gameSegment: string | null;
  }) => void;
};

export const STORAGE_NULL_INTEGRITY_SCENARIOS: StorageNullIntegrityScenario[] = [
  {
    id: "storage.player-prop-null-gameId",
    description: "Player prop with null gameId persists all nullable columns as null except prop fields",
    legs: [
      {
        gameId: null,
        betType: "player_prop",
        pick: "over",
        line: "64.5",
        odds: null,
        playerName: "Player A",
        propType: "rec_yards",
        result: null,
        notes: null,
      },
    ],
    assertLeg: (leg) => {
      expect(leg.gameId).toBeNull();
      expect(leg.line).toBe("64.5");
      expect(leg.odds).toBeNull();
      expect(leg.result).toBeNull();
      expect(leg.playerName).toBe("Player A");
      expect(leg.propType).toBe("rec_yards");
      expect(leg.notes).toBeNull();
    },
  },
  {
    id: "storage.explicit-null-result",
    description: "Explicit null result is stored as SQL null, not empty string",
    legs: [
      {
        gameId: 1,
        betType: "spread",
        pick: "home",
        line: "-3",
        result: null,
      },
    ],
    assertLeg: (leg) => {
      expect(leg.result).toBeNull();
      expect(leg.line).toBe("-3");
    },
  },
  {
    id: "storage.moneyline-null-line",
    description: "Moneyline with null line persists",
    legs: [
      {
        gameId: 1,
        betType: "moneyline",
        pick: "away",
        line: null,
        odds: "+130",
      },
    ],
    assertLeg: (leg) => {
      expect(leg.line).toBeNull();
      expect(leg.odds).toBe("+130");
    },
  },
  {
    id: "storage.all-optional-null",
    description: "All optional leg fields explicitly null",
    legs: [
      {
        gameId: 1,
        betType: "spread",
        pick: "home",
        line: null,
        odds: null,
        gameSegment: null,
        result: null,
        playerName: null,
        propType: null,
        notes: null,
      },
    ],
    assertLeg: (leg) => {
      expect(leg.line).toBeNull();
      expect(leg.odds).toBeNull();
      expect(leg.gameSegment).toBeNull();
      expect(leg.result).toBeNull();
      expect(leg.playerName).toBeNull();
      expect(leg.propType).toBeNull();
      expect(leg.notes).toBeNull();
    },
  },
];

export type ParlayUpdateNullScenario = {
  id: string;
  description: string;
  initialResult: string | null;
  updateResult: string | null | undefined;
  expectedResult: string | null;
};

export const PARLAY_UPDATE_NULL_SCENARIOS: ParlayUpdateNullScenario[] = [
  {
    id: "update.clear-result-with-null",
    description: "updateParlay with result: null clears settled result",
    initialResult: "win",
    updateResult: null,
    expectedResult: null,
  },
  {
    id: "update.set-result",
    description: "updateParlay sets result to loss",
    initialResult: null,
    updateResult: "loss",
    expectedResult: "loss",
  },
  {
    id: "update.undefined-skips",
    description: "updateParlay with undefined result leaves DB value unchanged",
    initialResult: "push",
    updateResult: undefined,
    expectedResult: "push",
  },
];
