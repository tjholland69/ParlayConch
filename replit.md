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