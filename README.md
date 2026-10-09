# Parlay.Conch

Parlay.Conch is a full-stack NFL parlay tracker for groups of friends. Users can create or join leagues, submit weekly picks, review historical results, and compare performance across league members.

The repository includes a React web application, an Express API, a PostgreSQL database, optional Redis-backed real-time features, and an Expo mobile client.

## Features

- Create leagues and join them with invite codes
- Build one shared parlay per league each week: every member adds a single pick
- Track spreads, moneylines, totals, and player props
- Approve or reject submissions as a league administrator
- Lock a league's weekly submissions when picks are finalized
- View league standings, history, trends, and betting insights
- Import historical data from CSV files
- Parse sportsbook screenshots with an OpenAI-compatible vision model
- Enrich games and results with The Odds API and nflverse data
- Send league invitations and in-app notifications
- Make a pick "On Behalf Of" another member, with that member's approval
- Lock a week, and let members request an unlock
- Run canned reports (standings, weekly loser, bet-type allocation) as a graphic, as text, or as a CSV, JSON, XML or Markdown file
- Share a Shame Report for a lost parlay and a Locks Report for a won one
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
│   ├── auth/               Email/password authentication and sessions
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

A parlay is a league's shared ticket for an NFL week. `parlays.user_id` is whoever started it; each member adds one leg of their own (`parlay_legs.user_id`), and a league can run up to its `max_parlays_per_week`. The rules live in `shared/weekParlays.ts`. Game-based legs reference a game; player-prop legs may instead use a player name and prop type.

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

**New machine (recommended):** run `./setup.sh` from the repo root. It installs
dependencies, creates a local Postgres database, writes a machine-local
`.env.local` (`DATABASE_URL`, `PORT`, `SESSION_SECRET`), pulls the shared
third-party secrets from Railway (see below), and applies migrations. Requires
the [Railway CLI](https://docs.railway.com/guides/cli) and `railway login`.

**Manual setup:** create `.env.local` in the repository root:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/parlayconch
SESSION_SECRET=replace-with-a-long-random-value
PORT=5000
```

`DATABASE_URL` is required. The application can run locally with email/password authentication without Redis or external API credentials.

#### Sharing secrets across machines

`.env.local` is gitignored on purpose — it holds machine-local values
(`DATABASE_URL`, `PORT`) alongside real credentials, and each machine is
expected to have its own local Postgres database rather than sharing one.

The shared third-party secrets (Resend, XWeather, the Odds API, dispute
screenshot bucket) live in a Railway environment called `local-secrets` in the
`parlay-conch` project — variables only, no deployed service, and
deliberately excluding `DATABASE_URL`/`REDIS_URL` so it never overrides your
local database. Pull them into `.env.local` any time (initial setup, or after
rotating a key) with:

```bash
npm run env:sync
```

This preserves `NODE_ENV`, `PORT`, `DATABASE_URL`, and `SESSION_SECRET` as
already set in your `.env.local` and only refreshes the shared secrets. To add
or rotate a shared secret, update it via `railway variables --environment
local-secrets --service ParlayConch --set KEY=value` (or the Railway
dashboard) and re-run `npm run env:sync` on each machine — no more manually
copying `.env.local` between computers.

Production/staging secrets are managed the same way, per environment
(`production`, `staging`, `dev`) — `.env.railway.example` documents what each
variable is for.

Optional variables:

| Variable | Purpose |
|---|---|
| `REDIS_URL` | Enables Redis sessions, caching, WebSocket fan-out, and optional BullMQ jobs |
| `REDIS_TLS=1` | Enables TLS for Redis connections |
| `REDIS_KEY_PREFIX` | Overrides the default Redis key prefix |
| `USE_ODDS_SYNC_QUEUE=1` | Runs odds synchronization through BullMQ |
| `ODDS_API_KEY` | Enables game odds and score synchronization through The Odds API |
| `OPENAI_API_KEY` | Enables AI insights and screenshot parsing |
| `OPENAI_BASE_URL` | Overrides the OpenAI-compatible API base URL |
| `PG_SSL=1` | Enables PostgreSQL SSL |
| `PG_SSL_REJECT_UNAUTHORIZED=false` | Allows a PostgreSQL certificate that cannot be verified |
| `PG_POOL_MAX` | Sets the PostgreSQL connection-pool limit |
| `PG_POOL_IDLE_MS` | Sets the pool idle timeout |
| `PG_POOL_CONNECT_TIMEOUT_MS` | Sets the pool connection timeout |

| `RESEND_API_KEY` | Sends invitation and password emails (required in production) |
| `RESEND_FROM_EMAIL` | Overrides the sender address (default `invites@parlayconch.com`) |

In production, `SESSION_SECRET` must be set or the server refuses to start.

### Initialize the database

Apply committed migrations:

```bash
npm run db:migrate
```

Seed development data if needed:

```bash
npm run db:seed
```

For a much larger, realistic dataset instead, pull a filtered replica of
production's demo data:

```bash
npm run db:seed:prod-replica
```

This wipes local app data (same as `db:seed`) and reloads it from production
— but only the subset owned by production users with `is_demo = true`.
Real accounts and anything referencing them (their leagues, parlays,
disputes, notifications, ...) are excluded before anything is written
locally; only `railway` read access to the `production` environment is
required, and nothing is written back to production. Safe to re-run any time
you want to refresh local data to match what's currently live.

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
| `npm run audit:parlays` | Read-only check for parlays, legs and games filed under the wrong week |
| `npm run repair:spread-signs` | Fix game spreads stored with the wrong sign (dry run unless `--apply`) |
| `npm run backfill:prop-games` | Link player-prop legs to their player's game (dry run unless `--apply`) |

## Authentication and authorization

### Email and password

Local authentication is available in every environment:

- `POST /api/auth/register`
- `POST /api/auth/login-local`
- Passwords are hashed with bcrypt using 12 rounds
- Passwords must contain 8–128 characters
- Authentication endpoints are rate limited

### Accounts without a password

Some older accounts were created through a single sign-on that has since been retired, so they have no password. Signing in or registering with one of those emails never attaches a password directly. Instead the owner is emailed a one-time link to `/set-password` (valid 14 days, at most one every 15 minutes).

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

A super user can set a new password on any account from the Admin page (`POST /api/admin/users/reset-password`). It checks the signed-in user, never an act-for identity, writes an `admin.reset_password` audit event, and emails nothing: the new password is passed on by hand.

## Parlay lifecycle

1. A member selects a league and NFL week.
2. The client submits the selected legs to `POST /api/parlays`.
3. The server validates league membership, lock state, and league limits.
4. The storage layer writes the parlay and legs in a transaction.
5. A league administrator may approve or reject the submission.
6. Score enrichment resolves game-based leg results.
7. Leg results are rolled up to a parlay-level `win` or `loss`. A leg can push; a parlay can't. A pushed leg drops out of the ticket without losing it.
8. Redis and WebSockets notify connected clients to refresh affected queries.

Submitting again for the same user, league, and week replaces the existing parlay legs.

## Locking, and picking for someone else

**Locking.** Whoever started the week's parlay, the Parlay Maestro, or a lieutenant with the lock permission can lock the week. Locking moves an open parlay to `pending`. Unlocking (the Maestro, or a lieutenant with the unlock permission) reopens a `pending` parlay as a draft so picks can change; one already approved or sent to a sportsbook stays put. Any other member can request an unlock while no game has started and the parlay hasn't gone to a sportsbook.

**Placed.** Only a locked parlay can be copied out to a sportsbook, and any member can do it. The app doesn't count how many members placed it: one member confirming (`POST /api/parlays/:id/confirm-placed`) moves it to `placed`, even before kickoff. A locked parlay whose first game has kicked off is taken as placed on the next results tick. If that's wrong, the Maestro can "Bust & reopen" it (`POST /api/parlays/:id/reopen`): it goes back to a draft and the week unlocks, but a pick on a game that has started can't be changed, removed or re-bet. Web links out to DraftKings, FanDuel, BetMGM and Caesars; mobile deep-links to FanDuel and DraftKings (`shared/sportsbook-providers.ts`). None of them accept a ready-made slip, so the bets are entered by hand from the copied text.

**On Behalf Of.** The Maestro can make a pick for any member. A lieutenant can too when the league turns on the "Pick On Behalf Of Anyone" permission. Anyone else needs the member's own permission, which the member gives on the league's Members tab (`pick_delegations`). The pick belongs to the member (`parlay_legs.user_id`), records who made it (`placed_by_user_id`), and waits on the member's approval (`approval_status`). A parlay with a pick still waiting can't be submitted or locked, unless the Maestro does it, which is recorded as the Maestro's approval. Every step writes an audit event (`pick.on_behalf.*`).

## Notifications

`shared/notifications.ts` is the catalog of alerts (new parlay open, pick reminder, locked, unlocked, busted, end-of-slate update, a pick made for you, unlock requested). `server/services/notify.ts` sends them: every alert goes to the in-app inbox, and to email for members who switch it on (needs `RESEND_API_KEY`). Members choose their alerts in Settings. Text and push have a switch but no provider yet; `CHANNEL_SENDERS` in `notify.ts` is where one plugs in.

**Reminders.** "Send reminder" on an open parlay (`POST /api/leagues/:id/weeks/:weekId/reminder`) nudges every member without a pick, at most once an hour each, and returns a text for the group chat: the picks in with their owners, who is still out, and a countdown to the week's first non-Thursday kickoff (`shared/parlayReminder.ts`).

## The Suss Meter and Illogical Bets

**The Suss Meter.** A member can down-vote another member's pick in an open parlay (`leg_suss_votes`, one vote per member per pick, never their own). Votes are anonymous: the API returns counts and whether the caller voted, never who did, and voting isn't audit logged for the same reason. A pick shows a three-part meter once more than half the other members have down-voted it, two parts past 75%, and a full, pulsing meter when everyone but its owner has (`shared/suss.ts`). Changing a pick clears its votes.

**Illogical Bets.** `shared/illogicalBets.ts` spots a new pick that works against one already in the parlay: a moneyline with a spread on the same game, a player's under with the over on his game's total (or his over with the under), and a player's under with a bet on his own team (or his over with a bet against it). The pick is still allowed, after a warning. The team rule needs the player's team from the `players` table and is skipped without it.

## Reports and exports

Reports: league standings (current year and all time), the loser report, allocation by bet type, disputes (every dispute, the week it touched and its ruling), and The Suss Report (open parlays only). Dismissed disputes are kept on record from this version on; earlier ones were deleted when dismissed.

`GET /api/leagues/:id/reports/:reportId` returns a report (`shared/reports.ts`) for the app to draw. Add `?format=csv|json|xml|md` for a file. Bet history exports the same way from `/api/parlay-legs/export.{csv,json,xml,md}`. JSON, XML and Markdown carry a description of every column, so a file can be read without the app (see `shared/dataExport.ts`).

## AI connector (MCP)

`POST /mcp` is a read-only [Model Context Protocol](https://modelcontextprotocol.io) server (`server/mcp.ts`), so a member's AI assistant can answer questions about their leagues. It runs inside the web service; there is nothing extra to deploy.

- **Auth:** a personal access token, made in the web app under Settings > Account > AI Assistant Access and sent as `Authorization: Bearer pc_...`. Only a hash is stored. A token reads the leagues its owner belongs to and nothing else, and can be revoked there.
- **Read-only:** no tool makes a pick, locks a week or changes a setting.
- **Limits:** 120 requests a minute per token.

| Tool | Returns |
|---|---|
| `list_leagues` | The member's leagues, with ids, roles, members and the league's loser and hero labels |
| `list_reports` | The reports a league offers |
| `get_report` | A report's rows with a description of every column (JSON or Markdown) |
| `get_bet_history` | Individual bets, filterable by league, season, week, owner, bet type and result |
| `get_current_week` | This week's parlay: open, locked or in progress, every bet, who hasn't picked |
| `get_glossary` | What the app's terms mean (`shared/glossary.ts`) |

To connect a client that takes a config file (Claude Code, for example):

```bash
claude mcp add --transport http parlay-conch \
  https://parlayconch.com/mcp \
  --header "Authorization: Bearer <your token>"
```

## Player props

Player-prop legs use:

- `bet_type = "player_prop"`
- A nullable `game_id`
- `player_name`
- `prop_type`
- Picks of `over` or `under`. Touchdown-scorer props (anytime, first, last) are `yes` only: a `no` can't be entered, though older `no` picks still read and grade

Supported prop categories include passing, rushing, receiving, touchdowns, interceptions, sacks, tackles, and kicking statistics.

Game-score enrichment cannot resolve player props. They are resolved manually or through the player-stat enrichment flow.

While games are on, `server/jobs/live-results-queue.ts` checks every 5 minutes: final scores come from ESPN's scoreboard, so game bets settle minutes after a game ends. Props wait on player stats. Sacks and tackles come from ESPN and are quick; passing, rushing and receiving stats come from nflverse, which publishes some hours later, and are retried every 30 minutes until they land.

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

Configure `OPENAI_API_KEY` and, when required, `OPENAI_BASE_URL`.

### Resend

Resend sends league invitations, member-added and set-password emails. Configure `RESEND_API_KEY`.

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
