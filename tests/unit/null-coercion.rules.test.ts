import { describe, expect, test } from "vitest";
import {
  applyNullCoercionRule,
  IMPORT_LEG_NORMALIZATION_RULES,
  NULL_COERCION_RULES,
} from "../rules/null-coercion.rules";
import { normalizeImportLegFields } from "../../shared/dataIntegrity";

describe("null coercion rules", () => {
  for (const rule of NULL_COERCION_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(applyNullCoercionRule(rule)).toEqual(rule.expected);
    });
  }
});

describe("import leg normalization rules", () => {
  for (const rule of IMPORT_LEG_NORMALIZATION_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(normalizeImportLegFields(rule.leg, rule.isPlayerProp)).toEqual(rule.expected);
    });
  }
});
