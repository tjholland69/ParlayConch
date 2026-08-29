// Deep-link handoff to a sportsbook app for an approved parlay.
//
// Scope, intentionally: this walks the maestro through each distinct game in
// the parlay, one deep link at a time, so they can build the full bet
// themselves inside the sportsbook app. It does NOT attempt to pre-fill a
// bet slip in one shot — neither book publishes a public API for that, and
// reverse-engineering one is fragile and outside their terms of service.
//
// The appScheme/query format below are best-effort placeholders. Neither
// FanDuel's nor DraftKings' actual deep-link contract is publicly documented;
// verify on a physical device (e.g. `npx uri-scheme open <url> --ios`) before
// shipping, and confirm androidPackage against the real Play Store listing.
// If no clean per-game deep link works in practice, fall back to opening the
// bare app scheme (home screen) rather than promising a specific game.

/** "other" has no deep-link config below — it just records a free-text name
 * (see UserSettings.preferredSportsbookOther) for sportsbooks we don't support
 * a deep link to yet. Callers must check for it before indexing
 * SPORTSBOOK_PROVIDERS. */
export type SportsbookProvider = "fanduel" | "draftkings" | "other";

export interface DeepLinkGame {
  homeTeam: string;
  awayTeam: string;
}

export interface SportsbookProviderConfig {
  id: SportsbookProvider;
  label: string;
  /** Custom URL scheme used with Linking.canOpenURL / openURL. */
  appScheme: string;
  /** Builds the best-effort deep link for a specific game. */
  buildGameDeepLink: (game: DeepLinkGame) => string;
  /** Fallback if the app isn't installed or the deep link fails to open. */
  webFallbackUrl: string;
  iosAppStoreUrl: string;
  androidPlayStoreUrl: string;
  /** Android package name, needed for the <queries> manifest visibility entry. */
  androidPackage: string;
}

export const SPORTSBOOK_PROVIDERS: Record<Exclude<SportsbookProvider, "other">, SportsbookProviderConfig> = {
  fanduel: {
    id: "fanduel",
    label: "FanDuel",
    appScheme: "fanduel",
    buildGameDeepLink: (game) =>
      `fanduel://sportsbook?query=${encodeURIComponent(`${game.awayTeam} @ ${game.homeTeam}`)}`,
    webFallbackUrl: "https://sportsbook.fanduel.com/navigation/nfl",
    iosAppStoreUrl: "https://apps.apple.com/app/fanduel-sportsbook/id1444861449",
    androidPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.fanduel.sportsbook",
    androidPackage: "com.fanduel.sportsbook",
  },
  draftkings: {
    id: "draftkings",
    label: "DraftKings",
    appScheme: "draftkings",
    buildGameDeepLink: (game) =>
      `draftkings://sportsbook?query=${encodeURIComponent(`${game.awayTeam} at ${game.homeTeam}`)}`,
    webFallbackUrl: "https://sportsbook.draftkings.com/leagues/football/nfl",
    iosAppStoreUrl: "https://apps.apple.com/app/draftkings-sportsbook/id1413350284",
    androidPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.draftkings.sportsbook",
    androidPackage: "com.draftkings.sportsbook",
  },
};

interface LegWithMaybeGame {
  gameId?: number | null;
  game?: { homeTeam: string; awayTeam: string; gameTime?: string | Date | null } | null;
}

/**
 * A parlay's legs can span multiple games, share one game (e.g. a Spread and
 * an Over/Under on the same matchup are two legs, one game), or be all
 * player-props with no game at all. Returns every DISTINCT game referenced
 * by the parlay's legs, earliest kickoff first — the walkthrough steps
 * through these one at a time. Returns an empty array if no leg resolves to
 * a game (deep link should fall back to the provider's generic web/app
 * landing page in that case).
 */
export function pickDeepLinkGames(legs: LegWithMaybeGame[]): DeepLinkGame[] {
  const byGameId = new Map<number, { homeTeam: string; awayTeam: string; gameTime: number }>();
  for (const leg of legs) {
    if (leg.gameId == null || !leg.game) continue;
    if (byGameId.has(leg.gameId)) continue;
    byGameId.set(leg.gameId, {
      homeTeam: leg.game.homeTeam,
      awayTeam: leg.game.awayTeam,
      gameTime: leg.game.gameTime ? new Date(leg.game.gameTime).getTime() : Infinity,
    });
  }

  return [...byGameId.values()]
    .sort((a, b) => a.gameTime - b.gameTime)
    .map(({ homeTeam, awayTeam }) => ({ homeTeam, awayTeam }));
}
