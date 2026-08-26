import { describe, expect, test } from "vitest";
import { getParlayMix } from "../../mobile/src/lib/parlayMix";
import { getHeroLeg } from "../../mobile/src/lib/parlayHero";
import { getBustedLeg } from "../../mobile/src/lib/parlayLoser";
import { getWinPctColor } from "../../mobile/src/lib/parlayVisuals";
import type { ParlayWithLegs } from "../../shared/schema";

describe("mobile/lib/parlayMix", () => {
  test("returns empty when no categorizable legs", () => {
    expect(getParlayMix([])).toEqual([]);
    expect(getParlayMix([{ betType: "unknown" as never }])).toEqual([]);
  });

  test("weights categories by leg count", () => {
    const mix = getParlayMix([
      { betType: "spread" },
      { betType: "spread" },
      { betType: "moneyline" },
      { betType: "over" },
    ]);
    expect(mix).toEqual([
      { category: "spread", count: 2, pct: 50 },
      { category: "moneyline", count: 1, pct: 25 },
      { category: "ou", count: 1, pct: 25 },
    ]);
  });
});

function stubLeg(
  overrides: Partial<ParlayWithLegs["legs"][number]> & { id: number; result: string },
): ParlayWithLegs["legs"][number] {
  return {
    id: overrides.id,
    parlayId: 1,
    userId: "u1",
    gameId: 1,
    betType: "spread",
    pick: "home",
    line: "-3",
    result: overrides.result as never,
    decidedAt: overrides.decidedAt ?? null,
    game: overrides.game ?? null,
    ...overrides,
  } as ParlayWithLegs["legs"][number];
}

describe("mobile/lib/parlayHero", () => {
  test("returns null unless the parlay won", () => {
    expect(
      getHeroLeg({
        id: 1,
        status: "loss",
        legs: [stubLeg({ id: 1, result: "win", decidedAt: "2024-01-01T20:00:00Z" })],
      } as ParlayWithLegs),
    ).toBeNull();
  });

  test("picks the latest-decided winning leg", () => {
    const hero = getHeroLeg({
      id: 1,
      status: "win",
      legs: [
        stubLeg({ id: 1, result: "win", decidedAt: "2024-01-01T18:00:00Z" }),
        stubLeg({ id: 2, result: "win", decidedAt: "2024-01-01T21:00:00Z" }),
        stubLeg({ id: 3, result: "loss", decidedAt: "2024-01-01T22:00:00Z" }),
      ],
    } as ParlayWithLegs);
    expect(hero?.id).toBe(2);
  });
});

describe("mobile/lib/parlayLoser", () => {
  test("returns null unless the parlay lost", () => {
    expect(
      getBustedLeg({
        id: 1,
        status: "win",
        legs: [stubLeg({ id: 1, result: "loss", decidedAt: "2024-01-01T18:00:00Z" })],
      } as ParlayWithLegs),
    ).toBeNull();
  });

  test("picks the earliest-decided losing leg", () => {
    const busted = getBustedLeg({
      id: 1,
      status: "loss",
      legs: [
        stubLeg({ id: 1, result: "loss", decidedAt: "2024-01-01T20:00:00Z" }),
        stubLeg({ id: 2, result: "loss", decidedAt: "2024-01-01T18:00:00Z" }),
        stubLeg({ id: 3, result: "win", decidedAt: "2024-01-01T17:00:00Z" }),
      ],
    } as ParlayWithLegs);
    expect(busted?.id).toBe(2);
  });
});

describe("mobile/lib/parlayVisuals", () => {
  test("getWinPctColor slides red -> orange -> green", () => {
    expect(getWinPctColor(0)).toEqual([239, 68, 68]);
    expect(getWinPctColor(50)).toEqual([249, 115, 22]);
    expect(getWinPctColor(100)).toEqual([74, 222, 128]);
  });
});
