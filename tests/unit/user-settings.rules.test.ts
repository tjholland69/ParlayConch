import { describe, expect, test } from "vitest";
import {
  applyUserSettingsMergeRule,
  USER_SETTINGS_MERGE_RULES,
} from "../rules/user-settings.rules";

describe("user settings merge rules", () => {
  for (const rule of USER_SETTINGS_MERGE_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      expect(applyUserSettingsMergeRule(rule)).toEqual(rule.expected);
    });
  }
});
