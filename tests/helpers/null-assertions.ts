import { expect } from "vitest";

/** Assert a nullable DB column round-tripped without corruption. */
export function expectDbNull<T>(
  actual: T | null | undefined,
  expected: T | null,
  field: string,
): void {
  if (expected === null) {
    expect(actual, `${field} should be SQL null`).toBeNull();
    return;
  }
  expect(actual, `${field} should preserve value`).toBe(expected);
}

/** Leg joins must expose game as Game | null — never undefined. */
export function expectNormalizedGameJoin<T>(
  game: T | null | undefined,
): asserts game is T | null {
  expect(game === null || game === undefined || typeof game === "object").toBe(true);
  if (game === undefined) {
    throw new Error("game join was undefined; expected null for missing FK target");
  }
}

/** JSONB settings must not become the string "null" or lose nested keys unexpectedly. */
export function expectJsonbIntact(
  settings: Record<string, unknown> | null | undefined,
  expectedKeys: string[],
): void {
  if (settings == null) return;
  expect(typeof settings).toBe("object");
  expect(settings).not.toBe("null");
  for (const key of expectedKeys) {
    expect(Object.prototype.hasOwnProperty.call(settings, key)).toBe(true);
  }
}
