import { describe, expect, test } from "vitest";
import { ROUTE_VALIDATION_RULES } from "../rules/route-validation.rules";

describe("route validation rules", () => {
  for (const rule of ROUTE_VALIDATION_RULES) {
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
