# Parlay.Club - NFL Parlay Tracker

## Overview

Parlay.Club is a full-stack NFL parlay betting tracker application designed for users to create and join leagues, submit weekly parlay picks, and track their betting performance against friends. The project aims to provide a modern, engaging platform for social sports betting, leveraging a dark-themed UI and robust backend capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack Query (React Query)
- **UI Components**: shadcn/ui built on Radix UI primitives
- **Styling**: Tailwind CSS with a custom dark theme
- **Charts**: Recharts for data visualization
- **Build Tool**: Vite

The frontend uses a component-based architecture with clear separation for pages, reusable components, and custom hooks.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Replit Auth (OpenID Connect) with Passport.js
- **Session Storage**: connect-pg-simple (PostgreSQL-backed)
- **API Style**: REST API with typed routes

The backend employs a layered architecture separating API definitions, data access, and database setup.

### Database Schema
The database schema, defined using Drizzle ORM, includes tables for users, sessions, NFL weeks and games, leagues, league memberships, parlay submissions, and parlay legs.

### Shared Code
A `shared/` directory centralizes common code like Drizzle ORM schema definitions, API route definitions for type-safe communication, and authentication model definitions, used by both frontend and backend.

### Key Features

#### Parlay Week Locking
A mechanism for the Parlay Maestro (league admin) to "lock" weekly parlay submissions, preventing further changes and signaling readiness for bet placement. This includes states for partial locks and an unlock option.

#### Notification System
An in-app notification system with a bell icon, unread count, and dropdown list. It supports ad-hoc announcements by the Parlay Maestro and scheduled reminders. Users can configure delivery preferences (Email, SMS, Push) for various notification types.

#### Configuration Management
- **User Settings**: Profile management, notification preferences, and account actions.
- **League Settings**: Admin-only controls for league name, description, parlay constraints, and assignment of Parlay Lieutenants with configurable permissions.

#### Demo / QA Flagging
A system to tag users and leagues as "demo" or "QA" for distinguishing test data from live production records, visible via badges and banners in the UI.

#### Import History (Backloading Data)
Allows the Parlay Maestro to import historical parlay data via CSV. The system includes an instructional dialog, CSV format requirements, and an auto-enrichment service to calculate results and fill in missing odds post-import.

## External Dependencies

### Database
- **PostgreSQL**: Primary data store.
- **Drizzle ORM**: For database interactions and schema management.

### Authentication
- **Replit Auth**: OpenID Connect provider.
- **Passport.js**: Authentication middleware.

### UI Libraries
- **Radix UI**: Accessible UI component primitives.
- **Tailwind CSS**: Utility-first CSS framework.
- **Lucide React**: Icon library.
- **Recharts**: Data visualization library.
- **date-fns**: Date utility library.

### Development Tools
- **Vite**: Frontend build tool.
- **esbuild**: Server bundling.
- **TypeScript**: Language for type-safe development.

### Mobile App (iOS)
- **Expo SDK / React Native**: Framework for the mobile application.
- **Expo Router**: File-based routing for mobile.
- **NativeWind**: Tailwind CSS for React Native.
- **TanStack Query v5**: State management for mobile.
- **@expo/vector-icons**: Icon library for mobile.

## Authentication

The app supports two login methods that can be used simultaneously:

### 1. Email + Password (local auth)
- Registration: `POST /api/auth/register` — `{ email, password, firstName? }`
- Login: `POST /api/auth/login-local` — `{ email, password }`
- Passwords are hashed with bcrypt (12 rounds) and stored in the `user_passwords` table
- Rate limited to 20 attempts per 15 minutes per IP
- Password rules: 8–128 characters
- Sessions stored in PostgreSQL via `connect-pg-simple`
- The session object has shape `{ claims: { sub, email }, localAuth: true }`

### 2. Replit OIDC (unchanged)
- Login: `GET /api/login` → Replit OpenID Connect flow
- Logout: `GET /api/logout`
- Token refresh is handled automatically

### Combined `isAuthenticated` middleware
Located at `server/replit_integrations/auth/combinedAuth.ts`.
- Local sessions: checks `claims.sub` exists
- Replit sessions: existing token expiry / refresh logic
- All protected routes use this single middleware

### New files
- `server/replit_integrations/auth/localAuth.ts` — bcrypt helpers, validation schemas, rate limiter, LocalStrategy, register/login routes
- `server/replit_integrations/auth/combinedAuth.ts` — unified `isAuthenticated` middleware
- `shared/models/auth.ts` — added `userPasswords` table

### Frontend
- Landing page now shows Sign In / Sign Up buttons
- Auth forms are rendered inline (no separate page routes)
- "Continue with Replit" option appears on both forms
- After successful auth, `useAuth()` query is invalidated so the app loads immediately

## Super User (Application-Wide Admin)

A `is_super_user` boolean column exists on the `users` table (default `false`). Any user with this flag set to `true` automatically passes all league-level permission checks (admin and lieutenant gates) across every league in the application. This role is intended for a very small set of trusted users (e.g., support staff) who need to act on behalf of any user in any league.

**How to grant super user access:** Set `is_super_user = true` on the target row in the `users` table. This is intentionally a manual database operation — there is no UI or API for it.

## Player Prop Bets

Parlay legs can now represent player prop bets in addition to standard game bets (spread, moneyline, over/under).

### Schema Changes
- `parlay_legs.game_id` — now nullable (prop bets may not reference a specific game)
- `parlay_legs.player_name` — the player's name (null for game bets)
- `parlay_legs.prop_type` — the prop category (null for game bets); e.g. `rush_yards`, `rec_yards`, `pass_yards`, `pass_tds`, `receptions`, `anytime_td`, `first_td`, `last_td`, `interceptions`, `sacks`, `kicking_pts`, `fg_made`, etc.
- `parlay_legs.bet_type` — extended with `'player_prop'`
- `parlay_legs.pick` — extended with `'yes'` / `'no'` for scoring props (alongside existing `'over'`/`'under'`/`'home'`/`'away'`)

### CSV Import Format
Prop legs are imported via the standard CSV flow. Game identification (`home_team`/`away_team` or `game_id`) is optional for prop bets:
```
week_id,member_email,home_team,away_team,bet_type,pick,line,result,status,player_name,prop_type
4,player@example.com,,,player_prop,over,72.5,,approved,Travis Kelce,rec_yards
4,player@example.com,,,player_prop,yes,,,approved,Patrick Mahomes,anytime_td
```

### Enrichment
Prop legs are skipped by the auto-enrichment service (no game-score formula can calculate them). They are immediately marked `odds_enriched = true` so they don't show up in every enrichment pass. Manual result entry (via the Edit Parlay dialog) is the intended way to set prop outcomes.

### Display
All UI that shows parlay legs handles `player_prop` bet types:
- **LeagueDetail** and **History** pages show "Player Name — Prop Type" as the matchup label
- Bet type badge shows "PROP" instead of "PLAYER_PROP"
- Pick badge shows "Over 72.5", "Yes", "Under 45.5", etc.

## nflverse Data Integration

### Overview
Game scores and player stats are synced from the **nflverse open data project** (https://github.com/nflverse/nflverse-data). No API key required. Data updates ~24 hours after each game. Only games already in the `games` table (i.e., games that were actually bet on) are enriched — no storage bloat.

### Data Sources
| Dataset | URL | Coverage |
|---|---|---|
| Schedules (scores + lines) | `…/schedules/schedules.csv` | All seasons back to 1999 |
| Player stats (per season) | `…/player_stats/player_stats_{season}.csv` | ~2 MB per year |

### Database Tables
- **`players`** — one row per NFL player; keyed by `nflverse_id` (GSIS ID); upserted on each sync
- **`player_week_stats`** — one row per player per season/week; upserted idempotently; only stored for players on teams in bet-on games

### Service: `server/services/nflverse.ts`
- `syncGameScoresFromNflverse(season, weekNumbers?)` — fetches schedules CSV, matches games to our DB by team name, updates scores + backfills missing odds
- `syncPlayerStatsForGames(season, week)` — fetches per-season player stats CSV, filters to teams in bet-on games for that week, upserts players + weekly stats

### API Routes
- `POST /api/admin/sync-nflverse` — body: `{ season, week?, mode: "scores"|"players"|"all" }`
- `GET /api/games/:gameId/player-stats` — returns `(PlayerWeekStat & { player: Player })[]`

### Post-Score-Sync Enrichment
After syncing scores, the enrichment service automatically re-runs to fill in win/loss results on parlay legs using the newly-updated game scores.