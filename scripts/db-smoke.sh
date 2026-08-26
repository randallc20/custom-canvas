#!/usr/bin/env bash
# Database-layer smoke test — see scripts/db-smoke.sql for what it checks.
#
#   ./scripts/db-smoke.sh          # against DEV (the default)
#   ./scripts/db-smoke.sh --prod   # against prod
#
# Passwords come from .env.local (SUPABASE_DB_PASSWORD / PROD_SUPABASE_DB_PASSWORD).
# Everything runs inside rolled-back transactions — the script writes nothing.
set -euo pipefail

cd "$(dirname "$0")/.."

env_val() { grep "^$1=" .env.local | head -1 | cut -d= -f2- | tr -d '"'; }

if [[ "${1:-}" == "--prod" ]]; then
  # Prod pooler user is postgres.<project-ref>, ref taken from the project URL.
  # Note the different pooler CLUSTER: prod is on aws-0, DEV on aws-1.
  REF=$(env_val PROD_SUPABASE_URL | sed -E 's#https://([^.]+)\.supabase\.co/?#\1#')
  HOST="aws-0-us-east-2.pooler.supabase.com"
  USER="postgres.$REF"
  PASSWORD=$(env_val PROD_SUPABASE_DB_PASSWORD)
  LABEL="prod ($REF)"
else
  HOST="aws-1-us-east-2.pooler.supabase.com"
  USER="postgres.nlatruygmarojthfjzog"
  PASSWORD=$(env_val SUPABASE_DB_PASSWORD)
  LABEL="DEV"
fi

if [[ -z "$PASSWORD" ]]; then
  echo "db-smoke: no DB password found in .env.local" >&2
  exit 1
fi

echo "db-smoke: running against $LABEL ..."
PGPASSWORD="$PASSWORD" psql \
  -h "$HOST" \
  -U "$USER" \
  -d postgres \
  -q \
  -f scripts/db-smoke.sql
