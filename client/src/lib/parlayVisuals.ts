// Shared color scheme for parlay rollup tiles: hue slides red -> orange -> green
// as the parlay's own win % climbs, and the intensity (boldness) of that color
// scales with the league's participation rate for that parlay's week — so a
// parlay from a week where few members actually submitted reads as more muted
// than one from a week where everyone participated.
//
// Centralizing this here means any future re-theming (new palette, different
// interpolation) happens in one place instead of being copy-pasted per tile.

type RGB = [number, number, number];

const RED: RGB = [239, 68, 68];    // red-500
const ORANGE: RGB = [249, 115, 22]; // orange-500
const GREEN: RGB = [74, 222, 128];  // green-400

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
  boxShadow?: string;
  barGradient?: string;
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
  // Boldness ranges ~0.25 (barely any participation) to ~0.75 (full participation).
  const alpha = 0.25 + rate * 0.5;

  return {
    borderColor: `rgba(${r}, ${g}, ${b}, ${(alpha + 0.15).toFixed(2)})`,
    boxShadow: `0 0 16px 2px rgba(${r}, ${g}, ${b}, ${(alpha * 0.45).toFixed(2)})`,
    barGradient: `linear-gradient(to right, rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)}), rgba(${r}, ${g}, ${b}, ${(alpha * 0.25).toFixed(2)}))`,
  };
}

/**
 * Buckets a parlay's own win % (wins / resolved legs) into 10-point groups,
 * used as a "how close was it" indicator on losing parlays. E.g. 0-9%, 10-19%, … 90-99%.
 */
export function getResultPercentileBucket(pct: number): string {
  const bucket = Math.min(90, Math.max(0, Math.floor(pct / 10) * 10));
  return `${bucket}-${bucket + 9}%`;
}

/** Same 10-point bucket, phrased as an ordinal ("60th percentile") for prose display. */
export function getResultPercentileOrdinal(pct: number): string {
  const bucket = Math.min(90, Math.max(0, Math.floor(pct / 10) * 10));
  // All multiples of 10 from 0-90 take the "th" suffix (0th, 10th, …, 90th).
  return `${bucket}th percentile`;
}
