/**
 * Line ranges for stat player props, shared by the web slider
 * (AddPropLegDialog) and the mobile stepper (AddPlayerPropModal).
 *
 * Lines move half a point at a time (39.5, 40, 40.5, …). A whole-number line
 * reads as "40 or more", so landing on it wins the over rather than pushing
 * (see ./propGrading.ts).
 */
export const LINE_RANGES: Record<string, { max: number; start: number }> = {
  pass_yards:        { max: 449.5, start: 224.5 },
  rush_yards:        { max: 199.5, start: 49.5 },
  rec_yards:         { max: 199.5, start: 49.5 },
  all_purpose_yards: { max: 249.5, start: 74.5 },
  pass_tds:          { max: 5.5,   start: 1.5 },
  rush_tds:          { max: 4.5,   start: 0.5 },
  rec_tds:           { max: 4.5,   start: 0.5 },
  rush_attempts:     { max: 39.5,  start: 14.5 },
  receptions:        { max: 14.5,  start: 4.5 },
  pass_attempts:     { max: 59.5,  start: 32.5 },
  pass_completions:  { max: 44.5,  start: 21.5 },
  interceptions:     { max: 3.5,   start: 0.5 },
  kicking_pts:       { max: 19.5,  start: 7.5 },
  fg_made:           { max: 5.5,   start: 1.5 },
  sacks:             { max: 4.5,   start: 0.5 },
  tackles:           { max: 14.5,  start: 5.5 },
};
const DEFAULT_LINE_RANGE = { max: 99.5, start: 9.5 };
export const MIN_LINE = 0.5;
export const LINE_STEP = 0.5;

export function lineRangeFor(propType: string | null | undefined) {
  return (propType && LINE_RANGES[propType]) || DEFAULT_LINE_RANGE;
}

/**
 * A typed line moved one step up or down, kept inside the prop's range. With
 * nothing (or nothing numeric) typed yet, the first press lands on the
 * prop's usual starting line.
 */
export function stepLine(current: string, direction: 1 | -1, propType: string | null | undefined): string {
  const range = lineRangeFor(propType);
  const value = parseFloat(current);
  if (!Number.isFinite(value)) return String(range.start);
  // Snap to the half-point grid first, so 74.3 steps to 74.5 or 74, not 74.8.
  const snapped = direction > 0 ? Math.floor(value / LINE_STEP) * LINE_STEP : Math.ceil(value / LINE_STEP) * LINE_STEP;
  return String(Math.min(range.max, Math.max(MIN_LINE, snapped + direction * LINE_STEP)));
}
