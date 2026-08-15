import { describe, expect, test } from "vitest";
import { emptyToNull, nullishToNull, normalizeJoinedGame } from "../../shared/dataIntegrity";

describe("shared/dataIntegrity", () => {
  test("emptyToNull converts empty strings only", () => {
    expect(emptyToNull(undefined)).toBeNull();
    expect(emptyToNull(null)).toBeNull();
    expect(emptyToNull("")).toBeNull();
    expect(emptyToNull("0")).toBe("0");
    expect(emptyToNull("-110")).toBe("-110");
  });

  test("nullishToNull preserves empty strings and zero", () => {
    expect(nullishToNull(undefined)).toBeNull();
    expect(nullishToNull("")).toBe("");
    expect(nullishToNull(0)).toBe(0);
  });

  test("normalizeJoinedGame coerces undefined to null", () => {
    expect(normalizeJoinedGame(null)).toBeNull();
    expect(normalizeJoinedGame(undefined)).toBeNull();
    expect(normalizeJoinedGame({ id: 1 })).toEqual({ id: 1 });
  });
});
