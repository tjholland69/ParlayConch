import { describe, expect, test } from "vitest";
import {
  normalizeAddParlayLegInput,
  normalizeParlayLegPatch,
  normalizeUpdateParlayInput,
} from "../../shared/dataIntegrity";
import {
  ADD_PARLAY_LEG_INPUT_RULES,
  PARLAY_LEG_PATCH_RULES,
  UPDATE_PARLAY_INPUT_RULES,
} from "../rules/patch-normalization.rules";

describe("patch normalization rules", () => {
  for (const rule of PARLAY_LEG_PATCH_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(normalizeParlayLegPatch(rule.input)).toEqual(rule.expected);
    });
  }

  for (const rule of UPDATE_PARLAY_INPUT_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(normalizeUpdateParlayInput(rule.input)).toEqual(rule.expected);
    });
  }

  for (const rule of ADD_PARLAY_LEG_INPUT_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(normalizeAddParlayLegInput(rule.input)).toEqual(rule.expected);
    });
  }
});
