// Mobile port of client/src/lib/parlayVisuals.ts — same color math, kept in
// sync by hand since RN can't share the web's CSS-oriented gradient string.
// Hue slides red -> orange -> green as the parlay's own win % climbs; the
// intensity (boldness) of that color scales with the league's participation
// rate for that parlay's week.

type RGB = [number, number, number];

const RED: RGB = [239, 68, 68];
const ORANGE: RGB = [249, 115, 22];
const GREEN: RGB = [74, 222, 128];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** pct: 0-100 win percentage. Returns an RGB triple sliding red -> orange -> green. */
export function getWinPctColor(pct: number): RGB {
  const clamped = Math.max(0, Math.min(100, pct));
  if (clamped <= 50) {
    return lerpColor(RED, ORANGE, clamped / 50);
  }
  return lerpColor(ORANGE, GREEN, (clamped - 50) / 50);
}

export type ParlayVisualStyle = {
  borderColor: string;
  /** Faint wash over the whole card, so the result reads without a loud fill. */
  tintColor?: string;
  /** Solid fill color for the header progress bar — RN has no cheap CSS-gradient
   * equivalent without pulling in a native module, so this is a flat fill instead
   * of the web's gradient. */
  barColor?: string;
};

/**
 * pct: the parlay's own resolved win % (0-100), or null if nothing has resolved yet.
 * participationRate: 0-1, share of the league that submitted a parlay that week.
 */
export function getParlayVisualStyle(pct: number | null, participationRate = 1): ParlayVisualStyle {
  if (pct === null) {
    return { borderColor: "rgba(255,255,255,0.1)" };
  }
  const [r, g, b] = getWinPctColor(pct);
  const rate = Math.max(0, Math.min(1, participationRate));
  // Kept light and see-through: white text sits on top of these, and a
  // strong red or orange fill behind it is hard on the eyes.
  const strength = 0.5 + rate * 0.5;

  return {
    borderColor: `rgba(${r}, ${g}, ${b}, ${(0.45 * strength).toFixed(2)})`,
    tintColor: `rgba(${r}, ${g}, ${b}, ${(0.06 * strength).toFixed(2)})`,
    barColor: `rgba(${r}, ${g}, ${b}, ${(0.16 * strength).toFixed(2)})`,
  };
}

export type OpenParlayVisualStyle = {
  borderColor: string;
  /** Card background — the web's light-blue wash pre-mixed onto the card
   * color, since RN can't layer a translucent fill over a background. */
  backgroundColor?: string;
  /** Shadow color for a steady glow around the card. */
  glowColor?: string;
};

/**
 * Mobile port of the web's getOpenParlayVisualStyle: how a parlay with no
 * decided legs yet shows its status, when there's no win % to color it by.
 * Light blue while it waits on approval; a green glow once it's active
 * (approved, sent or placed). Null for every other status.
 */
export function getOpenParlayVisualStyle(status: string | null | undefined): OpenParlayVisualStyle | null {
  if (status === "pending") {
    return { borderColor: "rgba(56, 189, 248, 0.55)", backgroundColor: "#1e3147" };
  }
  if (status === "approved" || status === "sent" || status === "placed") {
    return { borderColor: "rgba(34, 197, 94, 0.5)", glowColor: "#22c55e" };
  }
  return null;
}
