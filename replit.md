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