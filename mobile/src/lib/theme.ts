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

/** Same 8 accent presets as the web app's Settings page (HSL triples, so a
 * future app-wide theming pass can share the exact values) — the single
 * source of truth for both the Settings picker and `resolveAccentHex` below. */
export const ACCENT_PRESETS: { label: string; value: string; swatch: string }[] = [
  { label: "Blue", value: "221 83% 53%", swatch: "#2563eb" },
  { label: "Green", value: "142 70% 50%", swatch: "#22c55e" },
  { label: "Purple", value: "262 80% 60%", swatch: "#8b5cf6" },
  { label: "Orange", value: "25 90% 55%", swatch: "#f2762e" },
  { label: "Red", value: "0 72% 55%", swatch: "#ef4444" },
  { label: "Teal", value: "175 70% 45%", swatch: "#22b8a3" },
  { label: "Pink", value: "330 80% 60%", swatch: "#ec4899" },
  { label: "Amber", value: "38 92% 50%", swatch: "#f59e0b" },
];
export const DEFAULT_ACCENT = ACCENT_PRESETS[0].value;

/** The user's chosen accent preset (an HSL triple string, e.g. "221 83%
 * 53%") resolved to the hex swatch React Native components can actually use.
 * Falls back to the default blue for an unset or unrecognized value. */
export function resolveAccentHex(primaryColor?: string | null): string {
  return ACCENT_PRESETS.find((p) => p.value === primaryColor)?.swatch ?? ACCENT_PRESETS[0].swatch;
}

/** Lightens a `#rrggbb` color — used for an active/pressed state of an
 * accent-colored element without needing a second theme value per accent. */
export function lighten(hex: string, amount = 0.2): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * amount));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * amount));
  return `rgb(${r}, ${g}, ${b})`;
}

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
