#!/usr/bin/env bash
# Bootstraps a working local dev environment on a new machine:
#   git clone ... && ./setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "== 1/5: Checking prerequisites =="
command -v node >/dev/null 2>&1 || { echo "node is required: https://nodejs.org"; exit 1; }
command -v npm  >/dev/null 2>&1 || { echo "npm is required (ships with node)"; exit 1; }
command -v psql >/dev/null 2>&1 || echo "Warning: psql not found — install Postgres (e.g. 'brew install postgresql@16')."
if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install it: https://docs.railway.com/guides/cli"
  exit 1
fi

echo "== 2/5: Installing dependencies =="
npm install
if [ -d mobile ]; then
  (cd mobile && npm install)
fi

echo "== 3/5: Railway auth =="
if ! railway whoami >/dev/null 2>&1; then
  railway login
fi
railway link --project parlay-conch --environment local-secrets --service ParlayConch || true

echo "== 4/5: Local database =="
DB_NAME="parlayconch"
if command -v createdb >/dev/null 2>&1; then
  createdb "$DB_NAME" 2>/dev/null && echo "Created local database '$DB_NAME'." || echo "Database '$DB_NAME' already exists (or createdb failed) — continuing."
else
  echo "Skipping local database creation (no createdb on PATH) — create '$DB_NAME' manually."
fi

if [ ! -f .env.local ]; then
  cat > .env.local <<EOF
NODE_ENV=development
PORT=5050
DATABASE_URL=postgresql://$(whoami)@localhost:5432/${DB_NAME}
EOF
fi

echo "== 5/5: Syncing shared secrets from Railway =="
./scripts/sync-env.sh

echo "Applying database migrations..."
npm run db:migrate

cat <<'EOF'

Setup complete.

  npm run dev          # start the app (http://localhost:5050)
  npm run db:seed      # optional: seed dev data
  ./scripts/sync-env.sh  # re-run any time a shared secret is rotated

EOF
