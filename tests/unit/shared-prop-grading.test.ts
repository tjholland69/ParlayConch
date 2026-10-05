import { describe, expect, test } from "vitest";
import { gradePropOverUnder } from "@shared/propGrading";

describe("gradePropOverUnder", () => {
  test("landing on the line wins the over and loses the under", () => {
    expect(gradePropOverUnder(40, 40, "over")).toBe("win");
    expect(gradePropOverUnder(40, 40, "under")).toBe("loss");
  });

  test("either side of the line grades normally", () => {
    expect(gradePropOverUnder(41, 40.5, "over")).toBe("win");
    expect(gradePropOverUnder(40, 40.5, "over")).toBe("loss");
    expect(gradePropOverUnder(39, 40, "under")).toBe("win");
    expect(gradePropOverUnder(41, 40, "under")).toBe("loss");
  });

  test("a pick that isn't over/under can't be graded", () => {
    expect(gradePropOverUnder(40, 40, "yes")).toBeNull();
  });
});
