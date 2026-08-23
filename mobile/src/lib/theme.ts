/** Shared shadow presets for the "deeper shadows + glow accents" visual
 * pass — layered depth on cards, colored glow on accent/hero elements.
 * Kept to pure style props (no native deps) so it works without a rebuild. */

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
