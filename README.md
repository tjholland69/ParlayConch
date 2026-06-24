# Parlay.Conch

Parlay.Conch is a full-stack NFL parlay tracker for groups of friends. Users can create or join leagues, submit weekly picks, review historical results, and compare performance across league members.

The repository includes a React web application, an Express API, a PostgreSQL database, optional Redis-backed real-time features, and an Expo mobile client.

## Features

- Create leagues and join them with invite codes
- Submit weekly parlays with configurable leg limits
- Track spreads, moneylines, totals, and player props
- Approve or reject submissions as a league administrator
- Lock a league's weekly submissions when picks are finalized
- View league standings, history, trends, and betting insights
- Import historical data from CSV files
- Parse sportsbook screenshots with an OpenAI-compatible vision model
- Enrich games and results with The Odds API and nflverse data
- Send league invitations and in-app notifications
- Assign configurable permissions to league lieutenants
- Mark users and leagues as demo or QA data
- Synchronize updates across connected browsers with WebSockets
- Install the web client as a Progressive Web App

## Architecture

```text
React web client ───── REST / WebSocket ─────┐
                                             │
Expo mobile client ───────── REST ─────────► Express API
                                             │
                         ┌───────────────────┼───────────────────┐
                         │                   │                   │
                    PostgreSQL            Redis            External APIs
                    + Drizzle ORM    Pub/Sub + BullMQ    Odds, nflverse,
                                                        ESPN, OpenAI, Resend
```

### Web client

- React 18 and TypeScript
- Vite
- Wouter routing
- TanStack Query
- Tailwind CSS
- shadcn/ui and Radix UI
- Recharts
- Vite PWA

### Server

- Node.js 20+
- Express and TypeScript
- REST API
- Passport authentication
- WebSockets
- Zod request validation
- BullMQ background jobs when Redis is enabled

### Data

- PostgreSQL
- Drizzle ORM and Drizzle Kit
- Shared schema and TypeScript types
- PostgreSQL or Redis-backed sessions

### Mobile

- Expo SDK 51
- React Native
- Expo Router
- NativeWind
- TanStack Query

## Repository layout

```text
.
├── client/                 React web client
│   └── src/
│       ├── components/     Reusable application and UI components
│       ├── hooks/          Query and application hooks
│       ├── lib/            API, formatting, and utility code
│       └── pages/          Route-level components
├── server/
│   ├── jobs/               BullMQ jobs
│   ├── replit_integrations/
│   │   ├── auth/           Replit OIDC and local authentication
│   │   ├── audio/          Audio integration
│   │   ├── chat/           Conversation integration
│   │   └── image/          Image generation integration
│   ├── services/           Odds, enrichment, AI, email, and NFL data
│   ├── index.ts            Server entry point
│   ├── routes.ts           REST endpoints
│   ├── storage.ts          Database access layer
│   └── realtime-ws.ts      WebSocket server
├── shared/
│   ├── models/             Shared authentication and chat models
│   ├── routes.ts           Core API route definitions
│   └── schema.ts           Drizzle schema and shared domain types
├── mobile/                 Expo mobile application
├── migrations/             PostgreSQL migrations
├── scripts/                Database seed scripts
├── tests/                  Unit and integration tests
└── script/build.ts         Production build script
```

## Core data model

```text
User ──< LeagueMember >── League
                             │
                             ├──< Parlay >── User
                             │       │
                             │       └──< ParlayLeg >── Game
                             │
                             ├──< ImportBatch
                             ├──< Notification
                             └──< LeagueWeekLock

Week ──< Game
Player ──< PlayerWeekStat
```

A parlay belongs to one user, league, and NFL week. Each parlay contains one or more legs. Game-based legs reference a game; player-prop legs may instead use a player name and prop type.

The `bets` table remains in the schema for backward compatibility, but `parlays` and `parlay_legs` are the primary betting model.

## Getting started

### Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL
- Docker, only if you want integration tests to create a temporary PostgreSQL container
- Redis, optional

### Install dependencies

```bash
npm install
```

The mobile application has its own dependencies:

```bash
cd mobile
npm install
```

### Configure the environment

Create `.env.local` in the repository root:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parlayconch
SESSION_SECRET=replace-with-a-long-random-value
PORT=5000
```

`DATABASE_URL` is required. The application can run locally with email/password authentication without Replit OIDC, Redis, or external API credentials.

Optional variables:

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Enables Redis sessions, caching, WebSocket fan-out, and optional BullMQ jobs |
| `REDIS_TLS=1` | Enables TLS for Redis connections |
| `REDIS_KEY_PREFIX` | Overrides the default Redis key prefix |
| `USE_ODDS_SYNC_QUEUE=1` | Runs odds synchronization through BullMQ |
| `ODDS_API_KEY` | Enables game odds and score synchronization through The Odds API |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Enables AI insights and screenshot parsing |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Overrides the OpenAI-compatible API base URL |
| `REPL_ID` | Enables Replit OpenID Connect authentication |
| `ISSUER_URL` | Overrides the Replit OIDC issuer |
| `PG_SSL=1` | Enables PostgreSQL SSL |
| `PG_SSL_REJECT_UNAUTHORIZED=false` | Allows a PostgreSQL certificate that cannot be verified |
| `PG_POOL_MAX` | Sets the PostgreSQL connection-pool limit |
| `PG_POOL_IDLE_MS` | Sets the pool idle timeout |
| `PG_POOL_CONNECT_TIMEOUT_MS` | Sets the pool connection timeout |

Email delivery currently uses the Replit Resend connector and therefore also depends on the Replit connector environment.

### Initialize the database

Apply committed migrations:

```bash
npm run db:migrate
```

Seed development data if needed:

```bash
npm run db:seed
```

For schema development:

```bash
npm run db:generate
npm run db:push
```

Use generated migrations for shared or deployed environments. `db:push` is more appropriate for local schema iteration.

### Start the application

```bash
npm run dev
```

The Express API and Vite client are served from the same process. The default address is:

```text
http://localhost:5000
```

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Express and Vite development server |
| `npm run build` | Build the web client and server into `dist/` |
| `npm start` | Run the production server |
| `npm run check` | Run the TypeScript compiler without emitting files |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run db:migrate` | Apply database migrations |
| `npm run db:generate` | Generate a migration from schema changes |
| `npm run db:push` | Push the schema directly to the configured database |
| `npm run db:seed` | Seed development data |

## Authentication and authorization

### Email and password

Local authentication is available in every environment:

- `POST /api/auth/register`
- `POST /api/auth/login-local`
- Passwords are hashed with bcrypt using 12 rounds
- Passwords must contain 8–128 characters
- Authentication endpoints are rate limited

### Replit OpenID Connect

When `REPL_ID` is configured, users may also authenticate through Replit:

- `GET /api/login`
- `GET /api/callback`
- `GET /api/logout`

Both authentication methods use the same combined authorization middleware and session model.

### League roles

- **Member:** submits picks and views league data
- **Lieutenant:** receives selected administrative permissions
- **Admin / Parlay Maestro:** manages league settings, members, submissions, and locks
- **Super user:** application-wide support role that can act as another user

Super-user access is intentionally granted directly in PostgreSQL:

```sql
UPDATE users
SET is_super_user = true
WHERE email = 'admin@example.com';
```

There is no public API for granting this role.

## Parlay lifecycle

1. A member selects a league and NFL week.
2. The client submits the selected legs to `POST /api/parlays`.
3. The server validates league membership, lock state, and league limits.
4. The storage layer writes the parlay and legs in a transaction.
5. A league administrator may approve or reject the submission.
6. Score enrichment resolves game-based leg results.
7. Leg results are rolled up to a parlay-level `win`, `loss`, or `push`.
8. Redis and WebSockets notify connected clients to refresh affected queries.

Submitting again for the same user, league, and week replaces the existing parlay legs.

## Player props

Player-prop legs use:

- `bet_type = "player_prop"`
- A nullable `game_id`
- `player_name`
- `prop_type`
- Picks such as `over`, `under`, `yes`, or `no`

Supported prop categories include passing, rushing, receiving, touchdowns, interceptions, sacks, tackles, and kicking statistics.

Game-score enrichment cannot resolve player props. They are resolved manually or through the player-stat enrichment flow.

## Data imports and enrichment

League administrators can import historical picks through CSV or parse screenshots of sportsbook tickets.

Example CSV rows:

```csv
week_id,member_email,home_team,away_team,bet_type,pick,line,result,status,player_name,prop_type
4,player@example.com,Chiefs,Bills,spread,home,-2.5,win,approved,,
4,player@example.com,,,player_prop,over,72.5,,approved,Travis Kelce,rec_yards
```

Enrichment services can:

- Match imported legs to games
- Fill missing lines and odds
- Synchronize final scores
- Calculate spread, moneyline, and total results
- Import player weekly statistics
- Roll leg results into final parlay statuses

## External integrations

### The Odds API

Used for upcoming NFL games, betting lines, API usage information, and recent scores. Configure `ODDS_API_KEY` to enable it.

### nflverse

The application reads public nflverse schedule and player-stat datasets. It stores only relevant games, players, and weekly statistics needed by existing picks.

### ESPN

Public ESPN endpoints supply NFL news, injuries, and scoreboard information.

### OpenAI-compatible API

An OpenAI-compatible service powers:

- User and league betting insights
- Screenshot extraction for sportsbook tickets

Configure `AI_INTEGRATIONS_OPENAI_API_KEY` and, when required, `AI_INTEGRATIONS_OPENAI_BASE_URL`.

### Resend

Resend sends league invitations and member-added emails. The current implementation obtains credentials through the Replit connector environment.

## Real-time updates and Redis

Redis is optional. When configured, it provides:

- Shared session storage
- Short-lived WebSocket authentication tickets
- Pub/Sub between server instances
- JSON caching
- BullMQ odds synchronization

The browser subscribes to league and user events through `/api/ws`. Domain events invalidate the relevant TanStack Query caches.

Without Redis, core REST functionality remains available, sessions fall back to PostgreSQL, and odds synchronization runs directly.

## Testing

Run all tests:

```bash
npm test
```

The suite contains:

- Unit tests for shared routes and schemas
- Authentication and utility tests
- Screenshot normalization tests
- Batch-processing tests
- PostgreSQL storage integration tests

Outside CI, integration tests use Testcontainers and are skipped when a container runtime is unavailable. In CI, they use the configured `DATABASE_URL`.

## Production build and deployment

Create the production bundle:

```bash
npm run build
npm start
```

The build process:

1. Builds the React client into `dist/public`
2. Bundles the Express server into `dist/index.cjs`
3. Serves the client and API from the same Node process

`railway.json` configures Railway to:

- Run `npm run build`
- Apply migrations before deployment
- Start the production server
- Check `/api/health`

## Mobile application

The Expo application lives in `mobile/`. To run it:

```bash
cd mobile
EXPO_PUBLIC_API_URL=http://localhost:5000 npm start
```

The mobile client shares API contracts and schema concepts with the web application but uses native UI components.

Current limitation: the server-side mobile authentication bridge is not complete. The mobile client expects a session token that the current web-oriented authentication flow does not yet return. See [`mobile/README.md`](mobile/README.md) for mobile-specific setup and roadmap details.

## Important implementation notes

- `shared/schema.ts` is the source of truth for database tables and domain types.
- `server/routes.ts` is the main HTTP controller layer.
- `server/storage.ts` centralizes database operations and domain-event publication.
- TanStack Query uses long-lived cached data; mutations and WebSocket events must invalidate affected queries.
- PostgreSQL migrations should accompany schema changes.
- Player-prop legs do not always reference a game.
- Redis-dependent features must degrade safely when `REDIS_URL` is absent.

## License

MIT
