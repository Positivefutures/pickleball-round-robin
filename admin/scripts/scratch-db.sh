#!/usr/bin/env bash
#
# Build a throwaway Postgres that looks enough like the live Supabase project to
# run every migration and the whole daily job against.
#
# Usage:
#   ./admin/scripts/scratch-db.sh          # build it and print the connection string
#   ./admin/scripts/scratch-db.sh stop     # stop and delete it
#
# Then:
#   cd admin
#   ADMIN_TEST_PG="postgres://postgres@127.0.0.1:55432/postgres" npm test
#
# Why this exists. The admin schema reads auth.users, public.rosters,
# public.players and public.preferences, and gets the historical counts right
# only because 0001 keeps tombstones rather than deleting rows. None of that can
# be checked by reading. Every bug found while this was written was found here:
# a parameter that shadowed a column, a distribution grouped one level too few,
# and roster membership written as jsonb when the column is a text[].
#
# It is deliberately not pointed at the live project. Nothing here should ever
# be run against a database with real people in it.

set -euo pipefail

PORT=55432
DATA="${TMPDIR:-/tmp}/pbrr-admin-pgdata"
LOG="${TMPDIR:-/tmp}/pbrr-admin-pg.log"
CONN="postgres://postgres@127.0.0.1:$PORT/postgres"

REPO="$(cd "$(dirname "$0")/../.." && pwd)"

# Homebrew keeps libpq and postgresql keg-only, off PATH, so they cannot collide
# with a full install. Looking in the known places beats asking anyone to edit a
# shell config to run a test.
for candidate in \
  /opt/homebrew/opt/postgresql@17/bin \
  /usr/local/opt/postgresql@17/bin \
  /Applications/Postgres.app/Contents/Versions/latest/bin
do
  [ -d "$candidate" ] && PATH="$candidate:$PATH"
done
export PATH

if ! command -v initdb >/dev/null; then
  echo "No Postgres client tools. Install with: brew install postgresql@17" >&2
  exit 1
fi

if [ "${1:-start}" = "stop" ]; then
  pg_ctl -D "$DATA" stop >/dev/null 2>&1 || true
  rm -rf "$DATA"
  echo "Stopped and deleted."
  exit 0
fi

pg_ctl -D "$DATA" stop >/dev/null 2>&1 || true
rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null

# TCP rather than a unix socket: the scratchpad path this repo runs under is
# longer than the 103 byte limit a socket path has.
pg_ctl -D "$DATA" -o "-h 127.0.0.1 -p $PORT" -l "$LOG" start >/dev/null
for _ in $(seq 1 20); do
  psql "$CONN" -tAc 'select 1' >/dev/null 2>&1 && break
  sleep 0.5
done

# ---------------------------------------------------------------------------
# Enough of Supabase for the real migrations to run. Not a simulation of
# Supabase: just the objects they reference by name.
psql "$CONN" -q -v ON_ERROR_STOP=1 <<'SQL'
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;

create schema auth;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  created_at         timestamptz not null default now(),
  last_sign_in_at    timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Supabase reads the claims out of a per-request GUC. Same mechanism here, so a
-- test can become a user with set_config and prove the allowlist gate.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
SQL

for f in "$REPO"/supabase/migrations/*.sql "$REPO"/admin/supabase/migrations/*.sql; do
  printf '  %-34s' "$(basename "$f")"
  psql "$CONN" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null && echo "ok"
done

echo
echo "Ready.  ADMIN_TEST_PG=\"$CONN\""
echo "Stop with: $0 stop"
