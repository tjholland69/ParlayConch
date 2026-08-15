import { describe, expect, test } from "vitest";
import { SCHEMA_VALIDATION_RULES } from "../rules/schema-validation.rules";

describe("schema validation rules", () => {
  for (const rule of SCHEMA_VALIDATION_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      if (rule.expect === "pass") {
        const parsed = rule.schema.parse(rule.payload);
        rule.assertParsed?.(parsed);
        return;
      }
      expect(() => rule.schema.parse(rule.payload)).toThrow();
    });
  }
});
