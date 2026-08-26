/** Shared shadow presets for the "deeper shadows + glow accents" visual
 * pass — layered depth on cards, colored glow on accent/hero elements.
 * Kept to pure style props (no native deps) so it works without a rebuild. */

/** Recurring colors/sizes that were previously hardcoded independently in
 * every screen. Not a full design system — just the values that kept
 * drifting (button height, primary color, border color) pulled into one
 * place so buttons stay consistent. */
export const colors = {
  primary: "#2563eb",
  border: "#2a3447",
};

/** Canonical minimum tap target for a real button, per iOS HIG (44pt) with a
 * little headroom to match the app's existing best-formed buttons. */
export const BUTTON_MIN_HEIGHT = 48;

/** Minimum square hit target for icon-only controls (info, eye, flag, etc.). */
export const ICON_HIT_SIZE = 44;

/** Compact chip / filter control — still at the 44pt HIG floor. */
export const CHIP_MIN_HEIGHT = 44;

export const shadows = {
  /** Neutral card lift — use on any surface without overflow:"hidden" set
   * (combining shadow* with overflow:"hidden" breaks rendering on iOS; wrap
   * the clipped content in an outer, non-clipping View carrying this shadow
   * instead — see LeagueCard.tsx's shadowWrap for the pattern). */
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
  /** Colored glow for a hero/accent element (active state, standout stat). */
  glow(color: string, opacity = 0.4) {
    return {
      shadowColor: color,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: opacity,
      shadowRadius: 16,
      elevation: 8,
    };
  },
};
