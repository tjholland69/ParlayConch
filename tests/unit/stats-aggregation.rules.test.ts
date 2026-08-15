import { describe, expect, test } from "vitest";
import {
  applyStatsAggregationRule,
  BUILD_USER_STAT_RULES,
  IS_DECIDED_STATUS_RULES,
  NORMALIZE_OUTCOME_COUNTS_RULES,
  STATS_AGGREGATION_RULES,
} from "../rules/stats-aggregation.rules";
import {
  buildUserStat,
  isDecidedParlayStatus,
  normalizeOutcomeCounts,
} from "../../shared/statsAggregation";

describe("stats aggregation rules", () => {
  for (const rule of STATS_AGGREGATION_RULES) {
    test(`${rule.id}: ${rule.description}`, () => {
      const result = applyStatsAggregationRule(rule);
      expect(result.wins).toBe(rule.expected.wins);
      expect(result.losses).toBe(rule.expected.losses);
      expect(result.pushes).toBe(rule.expected.pushes);
      expect(result.winRate).toBeCloseTo(rule.expected.winRate, 5);
    });
  }

  for (const rule of IS_DECIDED_STATUS_RULES) {
    test(`isDecidedParlayStatus.${rule.id}`, () => {
      expect(isDecidedParlayStatus(rule.status)).toBe(rule.expected);
    });
  }

  for (const rule of NORMALIZE_OUTCOME_COUNTS_RULES) {
    test(`normalizeOutcomeCounts.${rule.id}`, () => {
      expect(normalizeOutcomeCounts(rule.raw)).toEqual(rule.expected);
    });
  }

  for (const rule of BUILD_USER_STAT_RULES) {
    test(`buildUserStat.${rule.id}`, () => {
      const stat = buildUserStat(rule.identity, rule.counts);
      expect(stat.userId).toBe(rule.expected.userId);
      expect(stat.username).toBe(rule.expected.username);
      expect(stat.wins).toBe(rule.expected.wins);
      expect(stat.losses).toBe(rule.expected.losses);
      expect(stat.pushes).toBe(rule.expected.pushes);
      expect(stat.winRate).toBeCloseTo(rule.expected.winRate, 5);
      expect(stat.region).toBe(rule.expected.region);
    });
  }
});
