import { describe, expect, test } from "vitest";
import {
  resultColor,
  statusColor,
  getStatusVariant,
} from "../../client/src/lib/parlayStatusStyles";

describe("client/lib/parlayStatusStyles", () => {
  test("resultColor maps win/loss/push and falls back", () => {
    expect(resultColor("win")).toContain("green");
    expect(resultColor("loss")).toContain("red");
    expect(resultColor("push")).toContain("blue");
    expect(resultColor(null)).toContain("muted");
    expect(resultColor(undefined)).toContain("muted");
  });

  test("statusColor covers decided and workflow statuses", () => {
    expect(statusColor("win")).toContain("green");
    expect(statusColor("approved")).toContain("emerald");
    expect(statusColor("void")).toContain("muted");
    expect(statusColor("pending")).toContain("yellow");
  });

  test("getStatusVariant returns badge variants", () => {
    expect(getStatusVariant("win")).toBe("default");
    expect(getStatusVariant("loss")).toBe("destructive");
    expect(getStatusVariant("push")).toBe("secondary");
    expect(getStatusVariant("approved")).toBe("outline");
    expect(getStatusVariant("rejected")).toBe("destructive");
    expect(getStatusVariant(null)).toBe("secondary");
  });
});
