#!/usr/bin/env bash
# Pulls shared third-party secrets from the Railway "local-secrets" environment
# into .env.local, without touching machine-local values (DATABASE_URL, PORT,
# NODE_ENV, SESSION_SECRET). Safe to re-run any time a secret is rotated.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI not found. Install it: https://docs.railway.com/guides/cli" >&2
  exit 1
fi

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in to Railway. Run: railway login" >&2
  exit 1
fi

ENV_FILE=".env.local"
touch "$ENV_FILE"

MACHINE_LOCAL_KEYS="NODE_ENV PORT DATABASE_URL SESSION_SECRET"

echo "Fetching shared secrets from Railway environment 'local-secrets'..."
REMOTE_VARS="$(railway variables --environment local-secrets --service ParlayConch --kv)"

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

# Keep every machine-local line from the existing file as-is.
for key in $MACHINE_LOCAL_KEYS; do
  grep -E "^${key}=" "$ENV_FILE" >> "$TMP_FILE" || true
done

# Append the shared secrets pulled from Railway, skipping Railway's own
# RAILWAY_* metadata vars and anything already handled above.
echo "" >> "$TMP_FILE"
echo "$REMOTE_VARS" | grep -vE '^(RAILWAY_|NODE_ENV=|PORT=|DATABASE_URL=|SESSION_SECRET=)' >> "$TMP_FILE"

if [ ! -s "$TMP_FILE" ] || ! grep -qE "^DATABASE_URL=" "$TMP_FILE"; then
  echo "Warning: DATABASE_URL is not set in $ENV_FILE yet." >&2
  echo "Add it manually — it should point at this machine's local Postgres, e.g.:" >&2
  echo "  DATABASE_URL=postgresql://$(whoami)@localhost:5432/parlayconch" >&2
fi

if ! grep -qE "^SESSION_SECRET=" "$TMP_FILE"; then
  echo "SESSION_SECRET=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> "$TMP_FILE"
fi

mv "$TMP_FILE" "$ENV_FILE"
trap - EXIT
echo "Synced. $ENV_FILE now has $(grep -cE '^[A-Z_]+=' "$ENV_FILE") variables."
