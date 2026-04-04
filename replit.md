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

## Super User (Application-Wide Admin)

A `is_super_user` boolean column exists on the `users` table (default `false`). Any user with this flag set to `true` automatically passes all league-level permission checks (admin and lieutenant gates) across every league in the application. This role is intended for a very small set of trusted users (e.g., support staff) who need to act on behalf of any user in any league.

**How to grant super user access:** Set `is_super_user = true` on the target row in the `users` table. This is intentionally a manual database operation — there is no UI or API for it.

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