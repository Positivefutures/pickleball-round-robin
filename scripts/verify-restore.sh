#!/usr/bin/env bash
#
# Prove the newest backup actually restores.
#
# Usage:
#   ./scripts/verify-restore.sh            # newest dump
#   ./scripts/verify-restore.sh <file.gz>  # a specific one
#
# Builds a throwaway Postgres cluster in a temp directory, restores into it,
# checks the rows and the signup trigger, then destroys the lot. It never
# touches the live database and never needs its password: it reads a file.
#
# This exists because a backup nobody has restored is a guess, and because the
# first dump this project ever took was complete, well formed, and contained
# none of the app's data. Nothing but a restore catches that.

set -uo pipefail

PGBIN=/opt/homebrew/opt/postgresql@17/bin
# psql from libpq, which is newer than the server and understands the
# \restrict lines that modern pg_dump writes.
PSQL=/opt/homebrew/opt/libpq/bin/psql
PORT="${PGPORT_TEST:-55432}"
BACKUP_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/pickleball-backups}"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "Needs a local Postgres server to restore into:" >&2
  echo "  brew install postgresql@17" >&2
  exit 1
fi

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/pbrr-*.sql.gz 2>/dev/null | head -1)}"
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "No dump found in $BACKUP_DIR. Run ./scripts/backup-db.sh first." >&2
  exit 1
fi

echo "Testing: $(basename "$DUMP")"

BASE="$(mktemp -d -t pbrr-restore)"
cleanup() {
  "$PGBIN/pg_ctl" -D "$BASE/data" -m immediate -w stop >/dev/null 2>&1 || true
  rm -rf "$BASE"
}
trap cleanup EXIT

mkdir -p "$BASE/data"
"$PGBIN/initdb" -D "$BASE/data" -U postgres --auth=trust >/dev/null 2>&1 \
  || { echo "initdb failed" >&2; exit 1; }

# TCP rather than a unix socket: the socket path has a 103 byte limit and the
# project lives under a Dropbox path long enough to blow it.
"$PGBIN/pg_ctl" -D "$BASE/data" \
  -o "-p $PORT -k /tmp -c listen_addresses=127.0.0.1" \
  -l "$BASE/log" -w start >/dev/null 2>&1 \
  || { echo "server failed to start" >&2; tail -20 "$BASE/log" >&2; exit 1; }

CONN="postgresql://postgres@127.0.0.1:$PORT/postgres"

# Supabase furniture the dump does not carry, and should not: the auth schema
# itself, and the auth.uid() that every RLS policy calls. Stubbed because this
# test asks whether the rows survive, not whether GoTrue can be rebuilt.
"$PSQL" "$CONN" -q -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create role anon;
create role authenticated;
create role service_role;
SQL

gzip -dc "$DUMP" | "$PSQL" "$CONN" -q >/dev/null 2> "$BASE/err"

# Two errors are expected and harmless: "schema public already exists", and one
# complaint about handle_new_user() from where pg_dump puts the trigger, before
# the function exists. The backup replays that trigger at the end, and the check
# below is what proves the replay worked.
UNEXPECTED="$(sed -E 's/^psql:[^:]*:[0-9]+: //' "$BASE/err" \
  | grep -v 'schema "public" already exists' \
  | grep -v 'function public.handle_new_user() does not exist' \
  | grep -c 'ERROR' || true)"

FAIL=0

# Check the tables exist before asking anything about their contents. Otherwise
# a dump missing them answers every later question with a page of SQL errors and
# buries the one fact that matters.
ABSENT="$("$PSQL" "$CONN" -tAc "
select string_agg(t, ', ') from unnest(array[
  'auth.users','public.profiles','public.rosters','public.players','public.preferences'
]) t where to_regclass(t) is null;")"

if [ -n "$ABSENT" ]; then
  echo
  echo "FAIL. The dump restored, but these tables are not in it: $ABSENT" >&2
  echo "It is a complete, valid dump of an incomplete database." >&2
  exit 1
fi

echo
echo "Rows restored:"
"$PSQL" "$CONN" -tA -F' ' -c "
select 'auth.users', count(*) from auth.users
union all select 'public.profiles', count(*) from public.profiles
union all select 'public.rosters', count(*) from public.rosters
union all select 'public.players', count(*) from public.players
union all select 'public.preferences', count(*) from public.preferences
order by 1;" | while read -r n c; do printf '  %-22s %s\n' "$n" "$c"; done

EMPTY="$("$PSQL" "$CONN" -tAc "
select count(*) from (
  select 1 from public.rosters having count(*)=0
  union all select 1 from public.players having count(*)=0
  union all select 1 from auth.users having count(*)=0
) t;")"
if [ "${EMPTY:-1}" != "0" ]; then
  echo "  FAIL: a table restored empty" >&2; FAIL=1
fi

ORPHANS="$("$PSQL" "$CONN" -tAc "
select (select count(*) from public.profiles p
          left join auth.users u on u.id=p.user_id where u.id is null)
     + (select count(*) from public.rosters r
          left join auth.users u on u.id=r.user_id where u.id is null)
     + (select count(*) from public.players pl
          where exists (select 1 from unnest(pl.roster_ids) rid
                        where not exists (select 1 from public.rosters r where r.id=rid)));")"
echo
echo "Rows pointing at an owner or group that is missing: ${ORPHANS}"
[ "${ORPHANS:-1}" = "0" ] || FAIL=1

POLICIES="$("$PSQL" "$CONN" -tAc "select count(*) from pg_policies where schemaname='public';")"
UNPROTECTED="$("$PSQL" "$CONN" -tAc "
select count(*) from pg_class where relnamespace='public'::regnamespace
  and relkind='r' and not relrowsecurity;")"
echo "Row level security: ${POLICIES} policies, ${UNPROTECTED} tables left unprotected"
[ "${UNPROTECTED:-1}" = "0" ] || FAIL=1

# The one that was silently broken until it was tested. Without this trigger a
# restored database serves existing users fine and gives every new signup no
# profile row at all.
TRIGGER="$("$PSQL" "$CONN" -tAc "
insert into auth.users (id, email) values (gen_random_uuid(), 'verify-restore@example.invalid');
select case when exists (select 1 from public.profiles
       where email='verify-restore@example.invalid') then 'yes' else 'no' end;" 2>/dev/null | tail -1)"
echo "New signups still get a profile row: ${TRIGGER}"
[ "$TRIGGER" = "yes" ] || FAIL=1

if [ "${UNEXPECTED:-0}" != "0" ]; then
  echo
  echo "Unexpected errors during restore:" >&2
  sed -E 's/^psql:[^:]*:[0-9]+: //' "$BASE/err" \
    | grep -v 'schema "public" already exists' \
    | grep -v 'function public.handle_new_user() does not exist' >&2
  FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "PASS. $(basename "$DUMP") restores to a working database."
else
  echo "FAIL. Do not rely on $(basename "$DUMP")." >&2
fi
exit "$FAIL"
