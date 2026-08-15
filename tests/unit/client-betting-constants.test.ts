import { describe, expect, test } from "vitest";
import {
  BET_TYPES,
  BET_TYPE_OPTIONS,
  PROP_TYPE_OPTIONS,
  RESULTS,
} from "../../client/src/lib/bettingConstants";
import { PLAYER_PROP_TYPES } from "../../shared/schema";

describe("client/lib/bettingConstants", () => {
  test("BET_TYPES lists the five core bet types", () => {
    expect([...BET_TYPES]).toEqual([
      "spread",
      "moneyline",
      "over",
      "under",
      "player_prop",
    ]);
  });

  test("BET_TYPE_OPTIONS mirrors BET_TYPES with labels", () => {
    expect(BET_TYPE_OPTIONS.map((o) => o.value)).toEqual([...BET_TYPES]);
    expect(BET_TYPE_OPTIONS.every((o) => o.label.length > 0)).toBe(true);
  });

  test("PROP_TYPE_OPTIONS mirrors shared PLAYER_PROP_TYPES", () => {
    expect(PROP_TYPE_OPTIONS).toEqual(
      PLAYER_PROP_TYPES.map((p) => ({ value: p.value, label: p.label })),
    );
  });

  test("RESULTS includes empty and settled outcomes", () => {
    expect([...RESULTS]).toEqual(["", "win", "loss", "push"]);
  });
});
