# Parlay.Conch — iOS Mobile App

React Native / Expo project that shares schema types and API patterns with the web app.

## Architecture

```
mobile/
├── src/
│   ├── app/               # Expo Router screens (file-based routing)
│   │   ├── _layout.tsx    # Root layout — QueryClient, SafeArea, Auth guard
│   │   ├── index.tsx      # Redirects to /(tabs)/leagues
│   │   ├── login.tsx      # OAuth login via WebBrowser
│   │   ├── (tabs)/        # Bottom tab navigator
│   │   │   ├── leagues.tsx      # Leagues list + create/join modals
│   │   │   ├── picks.tsx        # This week's pick status per league
│   │   │   └── settings.tsx     # Profile, demo toggle, sign out
│   │   └── leagues/
│   │       └── [id].tsx   # League detail (parlays, members, stats tabs)
│   ├── components/
│   │   ├── ui/            # Base components (Card, Badge, Button, Avatar)
│   │   └── LeagueCard.tsx
│   ├── hooks/             # TanStack Query hooks (mirror the web app hooks)
│   │   ├── use-auth.ts
│   │   ├── use-leagues.ts
│   │   ├── use-parlays.ts
│   │   └── use-weeks.ts
│   └── lib/
│       ├── api.ts         # apiRequest helper + session token (SecureStore)
│       └── query-client.ts
├── app.json               # Expo config — set extra.apiUrl to your server URL
├── eas.json               # EAS build/submit profiles (pin sdk-54)
├── .easignore             # Trim monorepo upload; keep ../shared
└── package.json
```

## What's Shared with the Web App

| Layer | Shared? | Notes |
|-------|---------|-------|
| Schema types (`shared/schema.ts`) | ✅ Yes | Imported directly via metro alias |
| API routes | ✅ Yes | Same REST endpoints, same payloads |
| TanStack Query hooks | ✅ Same pattern | Separate files, identical logic |
| UI components | ❌ No | Web uses shadcn/Tailwind HTML; mobile uses React Native |
| Auth flow | ❌ No | Mobile uses `expo-web-browser` for OAuth instead of session cookies |

## Development Setup (Mac required for iOS)

### Prerequisites
- Node.js 18+
- Xcode 15+ (iOS Simulator)
- Expo CLI: `npm install -g expo`
- EAS CLI (for App Store builds): `npm install -g eas-cli`

### Install dependencies
```bash
cd mobile
npm install
```

### Configure the API URL

**Development** — set in your shell or a `.env` file:
```
EXPO_PUBLIC_API_URL=https://your-replit-username.replit.app
```

**Production** — update `app.json`:
```json
"extra": {
  "apiUrl": "https://your-replit-app.replit.app"
}
```

### Run locally (Expo Go or Simulator)
```bash
cd mobile
npx expo start
```
- Press `i` for iOS Simulator
- Scan the QR code with Expo Go on your phone

### Build for App Store (EAS)
Always run from `mobile/` (not the repo root — root `app.json` / `eas.json` are stale).

```bash
cd mobile
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

**JS-only changes:** prefer OTA instead of a full native rebuild when possible:

```bash
cd mobile
eas update --channel production --message "describe the change"
```

iOS builds pin `ios.image` to `sdk-54` in `eas.json` for cache stability. Upload excludes web/server via `.easignore` (keeps `../shared`).

## Authentication Notes

The web app uses Replit's OpenID Connect with HTTP session cookies. On iOS, the auth flow uses `expo-web-browser` to open the OAuth page in a secure browser session, then stores the session token in `expo-secure-store`.

**Important:** The server needs to support returning a session token as a query parameter on the redirect URI for mobile clients. This bridge will need to be added to `server/routes.ts` when ready to fully wire up mobile auth.

## Styling

StyleSheet-first (no NativeWind). Shared tokens live in `src/lib/theme.ts` (`BUTTON_MIN_HEIGHT`, `ICON_HIT_SIZE`, colors, shadows). Use `Button` / `IconButton` for tappable controls.

## What Comes Next (Future Sprints)

- [x] Full pick submission flow (game selection, leg builder)
- [x] Parlay approval/rejection for Maestros
- [x] Invite + lock week (full settings via “Manage on web”)
- [ ] Push notifications via Expo Notifications
- [ ] Mobile auth bridge on the server side
- [ ] Light history (1.1)
- [ ] App Store submission (iOS first)
