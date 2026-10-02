import { describe, expect, test } from "vitest";
import {
  resultColor,
  statusColor,
  getStatusVariant,
} from "../../client/src/lib/parlayStatusStyles";
import { getOpenParlayVisualStyle } from "../../client/src/lib/parlayVisuals";

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

describe("client/lib/parlayVisuals", () => {
  test("a pending parlay is tinted light blue with no glow", () => {
    const style = getOpenParlayVisualStyle("pending");
    expect(style?.borderColor).toContain("56, 189, 248");
    expect(style?.tint).toContain("56, 189, 248");
    expect(style?.boxShadow).toBeUndefined();
  });

  test("an active parlay glows green", () => {
    for (const status of ["approved", "sent", "placed"]) {
      const style = getOpenParlayVisualStyle(status);
      expect(style?.boxShadow).toContain("34, 197, 94");
      expect(style?.tint).toBeUndefined();
    }
  });

  test("settled, draft and unknown statuses keep the win-% styling", () => {
    for (const status of ["win", "loss", "push", "void", "draft", "rejected", null, undefined]) {
      expect(getOpenParlayVisualStyle(status)).toBeNull();
    }
  });
});
