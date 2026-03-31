# Parlay.Club - NFL Parlay Tracker

## Overview

Parlay.Club is a full-stack NFL parlay betting tracker application that allows users to create and join leagues, submit weekly parlay picks, and track their betting performance against friends. The application features a modern dark-themed UI built with React and a Node.js/Express backend with PostgreSQL database storage.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme (NFL/sports analytics aesthetic)
- **Charts**: Recharts for data visualization (win rates, stats)
- **Build Tool**: Vite with HMR support

The frontend follows a component-based architecture with:
- Pages in `client/src/pages/` for route components
- Reusable components in `client/src/components/`
- Custom hooks in `client/src/hooks/` for data fetching and auth
- shadcn/ui components in `client/src/components/ui/`

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions
- **API Style**: REST API with typed routes defined in `shared/routes.ts`

The backend follows a layered architecture:
- `server/routes.ts` - API endpoint definitions
- `server/storage.ts` - Data access layer with IStorage interface
- `server/db.ts` - Database connection setup
- `server/replit_integrations/auth/` - Authentication module

### Database Schema
Defined in `shared/schema.ts` using Drizzle ORM:
- **users** - User accounts (Replit Auth)
- **sessions** - Session storage for auth
- **weeks** - NFL season weeks
- **games** - Individual NFL games with spreads/odds
- **leagues** - User-created betting leagues
- **leagueMembers** - League membership associations
- **parlays** - User parlay submissions
- **parlayLegs** - Individual legs of each parlay
- **bets** - Legacy single-game bets

### Shared Code
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts` - Drizzle ORM table definitions and types
- `routes.ts` - API route definitions for type-safe client-server communication
- `models/auth.ts` - User and session model definitions

### Build System
- Development: Vite dev server with Express backend proxy
- Production: esbuild bundles server, Vite builds client to `dist/`
- Database migrations: `drizzle-kit push` for schema synchronization

## Parlay Week Locking

### Concept
The Parlay Maestro can "lock" the weekly parlay once all (or enough) members have submitted their picks. Locking signals that the Maestro is ready to place the bet with their sportsbook and prevents any further submissions or edits.

### Lock Button Behavior (League Parlays tab, Parlay Maestro only)
- **Grey** when one or more members haven't submitted yet
- **Green** ("All in" badge appears) once every member has submitted
- Clicking when all submitted locks immediately
- Clicking when submissions are missing shows a confirmation dialog

### Partial Lock (Missing Bets)
- Dialog warns the Maestro and shows exactly how many members are missing
- If confirmed, `hadMissingBets: true` is stored on the lock record
- Missing members appear as greyed-out **Void** cards in the parlays list
- A "Locked with missing bets" badge is shown in the header

### Locked State
- A red **Locked** badge + **Unlock** button replace the Lock button
- Make Picks tab shows a lock icon and "Parlay Locked" message — no new picks or edits allowed
- Maestro can unlock at any time to re-open submissions

### Database
- `league_week_locks` table: `id`, `leagueId`, `weekId`, `lockedBy`, `lockedAt`, `hadMissingBets`
- One row per league+week; deleting it unlocks

### API Routes
- `GET /api/leagues/:id/weeks/:weekId/lock` — get lock status + submission count
- `POST /api/leagues/:id/weeks/:weekId/lock` — lock (Parlay Maestro only), body: `{ hadMissingBets }`
- `DELETE /api/leagues/:id/weeks/:weekId/lock` — unlock (Parlay Maestro only)

## Notification System

### In-App Notification Bell
- Fixed bell icon in the top-right: desktop top bar (above main content) + mobile header
- Shows an unread count badge (red) when there are unread notifications
- Dropdown lists all notifications with type icon, title, message, and time-ago
- Click any unread notification to mark it as read; "Mark all read" button clears all
- Polls for new notifications every 30 seconds
- Notification types: `announcement`, `parlay_approved`, `parlay_rejected`, `reminder`, `system`

### League Notifications (Parlay Maestro only — League Settings → Notifications tab)
- **Ad Hoc Announcements (Option 1)**: Type a title + optional message, click "Send to League" — creates an in-app notification for every league member immediately
- **Scheduled Reminders (Option 2)**: Enable toggle, configure days-before-deadline (1–7) and reminder message text; settings stored, actual delivery requires a background job service

### User Notification Delivery (Settings → Notifications tab)
Three delivery channels, all stored as preferences in `users.settings.notificationPreferences` JSONB:
- **Email**: Toggle on/off; email delivery requires email service integration (e.g. Resend/SendGrid)
- **SMS**: Toggle + phone number input; SMS delivery requires Twilio integration
- **Push**: Toggle; only available for native app (not browser); placeholder until app is released

### Database
- `notifications` table: `id`, `userId`, `leagueId` (nullable), `type`, `title`, `message`, `isRead`, `createdAt`
- `leagues.notificationSettings` JSONB: `{ scheduledReminders, reminderDaysBeforeDeadline, reminderMessage }`
- `users.settings.notificationPreferences` JSONB: `{ email, sms, push, phone? }`

### API Routes
- `GET /api/notifications` — fetch current user's notifications
- `POST /api/notifications/:id/read` — mark one notification as read
- `POST /api/notifications/read-all` — mark all as read
- `POST /api/leagues/:id/notifications/announce` — Parlay Maestro sends ad hoc announcement
- `PATCH /api/leagues/:id/notification-settings` — Parlay Maestro configures scheduled reminders
- `PATCH /api/users/me/notification-preferences` — user updates delivery preferences

## Configuration Management

### User Settings (`/settings`)
Tabbed settings page accessible via the sidebar:
- **Profile**: Display name (stored in `users.settings` JSONB), read-only email and avatar from Replit Auth
- **Preferences**: Placeholder for theme, default week view, odds format (coming soon)
- **Notifications**: Placeholder for parlay approved/rejected/weekly reminders (coming soon)
- **Account**: Demo mode toggle, danger zone (delete account — coming soon)

### League Settings (`/leagues/:id/settings`)
Admin-only settings page linked from each league's detail page:
- **General**: Edit league name, description, parlay constraints (min/max legs, max parlays/week)
- **Lieutenants**: Assign up to 2 members as Lieutenants; configure per-league Lieutenant permissions
- **Advanced**: Demo/QA flag toggle; future settings (lock picks, public league, scoring)

### Role Terminology (UI vs DB)
- **Parlay Maestro** — displayed in UI for the league creator/admin; stored as `'admin'` in `leagueMembers.role`
- **Parlay Lieutenant** — displayed in UI for trusted deputies; stored as `'lieutenant'` in `leagueMembers.role`
- Regular members have role `'member'`

### Parlay Lieutenant System
- Up to 2 Parlay Lieutenants per league (enforced server-side)
- Permissions stored in `leagues.lieutenant_permissions` (JSONB), configurable per league:
  - `approveRejectParlays` — approve/reject pending parlay submissions
  - `editParlays` — edit parlay picks and leg results
  - `importHistory` — import historical data via CSV
  - `markLeagueDemo` — toggle the league's demo/QA flag
- Default: only `approveRejectParlays` is enabled
- Parlay Lieutenant badges (blue) shown in member lists; Parlay Maestro badge shown on league cards

## Demo / QA Flagging

The app supports tagging records as demo/QA data to distinguish test entries from live production records:

- **Users**: Any user can toggle their own account as demo via the sidebar profile section. Demo accounts show a yellow "DEMO" badge next to their name everywhere they appear.
- **Leagues**: League admins can toggle a league as demo via the "Mark as Demo" button in the league header. Demo leagues show:
  - A yellow warning banner at the top of the league page
  - A "DEMO" badge next to the league name in both the leagues list and the league detail page
  - A "DEMO" badge on any parlay submitted by a demo user within the league
- Schema: `users.is_demo` (boolean) and `leagues.is_demo` (boolean) columns
- API: `PATCH /api/users/me/demo` (self-service) and `PATCH /api/leagues/:id/demo` (league admin only)

## Import History (Backloading Data)

### Access Control
- Restricted exclusively to the **Parlay Maestro** (league admin) — not configurable for Parlay Lieutenants
- The "Import History" button in the league header is only visible to admins
- The backend `POST /api/leagues/:leagueId/import` route enforces admin-only via `isLeagueAdmin` check

### Instructions Dialog (First-Time Experience)
- When the Parlay Maestro clicks "Import History", an instructions dialog appears first (unless opted out)
- The dialog covers: required/optional CSV columns with descriptions and examples, tips, and a CSV template download
- A "Don't show this again" checkbox lets the user opt out of the instructions for future sessions
- The opt-out preference is stored in `users.settings.skipImportInstructions` (JSONB field)
- On next click, if `skipImportInstructions` is `true`, the import dialog opens directly, skipping instructions

### CSV Format
Each row represents one parlay leg. Required columns: `week_id`, `member_email`, `game_id`, `pick`. Optional: `bet_type`, `line`, `result`, `status`.

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication
- **Replit Auth**: OpenID Connect authentication provider
- **Passport.js**: Authentication middleware
- Required env vars: `ISSUER_URL`, `REPL_ID`, `SESSION_SECRET`

### UI Libraries
- **Radix UI**: Accessible component primitives (dialogs, dropdowns, etc.)
- **Tailwind CSS**: Utility-first styling
- **Lucide React**: Icon library
- **Recharts**: Charting library for statistics visualization
- **date-fns**: Date formatting utilities

### Development Tools
- **Vite**: Frontend build tool with React plugin
- **esbuild**: Server bundling for production
- **TypeScript**: Type checking across the codebase

## Mobile App (iOS — React Native / Expo)

A parallel React Native project lives in `/mobile`. It shares schema types and API patterns with the web app but has its own UI layer built for native iOS.

### Mobile Architecture
- **Framework**: Expo SDK 51 / React Native 0.74
- **Routing**: Expo Router v3 (file-based, similar to web app's Wouter)
- **State Management**: TanStack Query v5 (same version as web)
- **Styling**: NativeWind 4 (Tailwind CSS for React Native) with matching dark palette
- **Auth**: `expo-web-browser` for OAuth flow + `expo-secure-store` for token storage
- **Icons**: `@expo/vector-icons` (Ionicons)

### Mobile Directory Structure
```
mobile/
├── src/app/           # Expo Router screens
│   ├── _layout.tsx    # Root layout with QueryClient + auth guard
│   ├── login.tsx      # OAuth login screen
│   ├── (tabs)/        # Bottom tab navigator (Leagues, Picks, Settings)
│   └── leagues/[id].tsx  # League detail (parlays / members / stats tabs)
├── src/components/    # React Native UI components (Card, Badge, Button, Avatar)
├── src/hooks/         # Data hooks mirroring web (use-auth, use-leagues, use-parlays, use-weeks)
├── src/lib/           # API client + QueryClient setup
└── app.json           # Expo config — set extra.apiUrl to the server URL
```

### Shared Code Between Web and Mobile
- **Schema types** (`shared/schema.ts`) — imported via metro resolver alias
- **REST API endpoints** — identical routes, same payloads
- **Hook patterns** — separate files, identical TanStack Query logic
- **UI components** — NOT shared (web = shadcn/HTML; mobile = React Native primitives)

### Running Mobile (requires Mac + Xcode)
```bash
cd mobile && npm install
EXPO_PUBLIC_API_URL=https://your-app.replit.app npx expo start
# Press 'i' for iOS Simulator
```

### Building for App Store
```bash
cd mobile
eas build --platform ios --profile production
eas submit --platform ios
```

### Auth Bridge (TODO)
The server currently uses HTTP session cookies for web. The mobile app needs the server to return a session token as a query param on the OAuth redirect URI. This bridge is not yet implemented in `server/routes.ts`.