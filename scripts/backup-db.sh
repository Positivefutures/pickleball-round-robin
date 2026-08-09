#!/usr/bin/env bash
#
# Take a restorable snapshot of the Supabase database.
#
# Supabase's free plan has no automated backups, so until that changes this is
# the only copy of an account that exists anywhere but the user's own phone.
#
# Usage:
#   ./scripts/backup-db.sh
#
# The first run asks for the database connection string and stores it in the
# macOS Keychain. Every run after that finds it there and asks nothing.
#
# The connection string contains the database password, which is why it goes to
# the Keychain rather than a file: nothing is written to disk in the clear,
# nothing is passed as an argument where `ps` would show it, and nothing lands
# in the repository, which is public.
#
# Output goes to a sibling of the repo rather than inside it, for the same
# reason. That location is inside Dropbox, so a dump is replicated off this
# machine within seconds of being written, which is what makes this a backup
# rather than a second copy on the same failing disk.

set -euo pipefail

OUT_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/pickleball-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/pbrr-$STAMP.sql.gz"

KEYCHAIN_SERVICE="pbrr-supabase-db"
KEYCHAIN_ACCOUNT="$USER"

# ---------------------------------------------------------------------------
# Find pg_dump.
#
# Homebrew installs libpq "keg-only", meaning it deliberately stays off PATH so
# it cannot collide with a full Postgres install. Looking in the known spots is
# better than asking anyone to edit their shell config to run a backup.

PG_DUMP=""
for candidate in \
  "$(command -v pg_dump 2>/dev/null || true)" \
  /opt/homebrew/opt/libpq/bin/pg_dump \
  /usr/local/opt/libpq/bin/pg_dump \
  /Applications/Postgres.app/Contents/Versions/latest/bin/pg_dump
do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then PG_DUMP="$candidate"; break; fi
done

if [ -z "$PG_DUMP" ]; then
  echo "Could not find pg_dump. Install the Postgres client tools with:" >&2
  echo "  brew install libpq" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Find the connection string: environment first, then Keychain, then ask.

DB_URL="${SUPABASE_DB_URL:-}"
NEEDS_SAVE=0

if [ -z "$DB_URL" ]; then
  DB_URL="$(security find-generic-password \
    -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w 2>/dev/null || true)"
fi

if [ -z "$DB_URL" ]; then
  echo
  echo "First run. I need the database connection string, once."
  echo
  echo "  1. Open the Supabase dashboard for this project."
  echo "  2. Click Connect, at the top of the page."
  echo "  3. Choose Session pooler, and copy the whole URI."
  echo "  4. Paste it below and press Return."
  echo
  echo "The screen stays blank while you paste, so that the password is not"
  echo "left on display. Paste once. You get to check it before it is used."
  echo
  printf "Connection string: "
  read -rs DB_URL
  echo

  # Everything below fixes what a paste can do to a string, in the order the
  # damage tends to happen. A blank prompt invites a second paste, and a second
  # paste lands end to end with the first: one string, two of everything,
  # rejected by the server with a complaint about the username.
  DB_URL="${DB_URL//[$'\t\r\n']/}"
  DB_URL="${DB_URL#"${DB_URL%%[![:space:]]*}"}"
  DB_URL="${DB_URL%"${DB_URL##*[![:space:]]}"}"

  half=$(( ${#DB_URL} / 2 ))
  if [ "${#DB_URL}" -gt 0 ] && [ $(( ${#DB_URL} % 2 )) -eq 0 ] &&
     [ "${DB_URL:0:half}" = "${DB_URL:half}" ]; then
    DB_URL="${DB_URL:0:half}"
    echo "(That arrived twice. Using one copy.)"
  fi

  if [ -z "$DB_URL" ]; then
    echo "Nothing pasted. Stopping." >&2
    exit 1
  fi

  # Supabase hands out the URI with the password still a placeholder. Pasting it
  # unedited is the single most likely mistake, and the error it causes on its
  # own is an unhelpful authentication failure.
  if [[ "$DB_URL" == *"[YOUR-PASSWORD]"* ]]; then
    echo "That still has [YOUR-PASSWORD] in it. Replace that with the real" >&2
    echo "database password, then run this again." >&2
    exit 1
  fi

  if [[ "$DB_URL" != postgres*://* ]]; then
    echo "That does not look like a connection string. It should start with" >&2
    echo "postgresql:// — copy the URI, not the psql command." >&2
    exit 1
  fi

  ats="$(printf '%s' "$DB_URL" | tr -cd '@' | wc -c | tr -d ' ')"
  if [ "$ats" != "1" ]; then
    echo "That has $ats @ signs in it and should have exactly one, so some of" >&2
    echo "it arrived more than once. Try again, pasting a single time." >&2
    exit 1
  fi

  # Read it back with the password blanked. This is the whole answer to the
  # blank prompt: something visible happened, so there is no reason to paste
  # again, and a wrong string is caught here instead of by the server.
  echo
  echo "Read as:"
  echo "  $(printf '%s' "$DB_URL" | sed -E 's#(://[^:]+:)[^@]*(@)#\1********\2#')"
  echo
  printf "Is that right? [y/N] "
  read -r confirm </dev/tty
  case "$confirm" in
    [yY]*) ;;
    *) echo "Stopping. Nothing was saved." >&2; exit 1 ;;
  esac

  # Saved only once it has been shown to work, further down. Storing it here
  # would mean a typo gets remembered, and the next run reuses it silently.
  NEEDS_SAVE=1
fi

# The transaction pooler speaks a reduced dialect and cannot serve a dump. It
# differs from the one that works by a single digit in the port, so say which.
if [[ "$DB_URL" == *":6543"* ]]; then
  echo "That is the transaction pooler, on port 6543, which cannot make a dump." >&2
  echo "Use the Session pooler instead. To replace the stored one, run:" >&2
  echo "  security delete-generic-password -s $KEYCHAIN_SERVICE" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Prove the connection before doing anything that depends on it. A dump can run
# for a while before failing, and a credential that is wrong is wrong instantly.

PSQL="$(dirname "$PG_DUMP")/psql"
if [ -x "$PSQL" ]; then
  echo "Checking the connection."
  # A check that can hang is not a check. Fifteen seconds is long enough for a
  # cold pooler and short enough that a wrong host fails while you are watching.
  if ! TEST_ERR="$(PGCONNECT_TIMEOUT=15 "$PSQL" "$DB_URL" -tAc 'select 1' 2>&1 >/dev/null)"; then
    echo >&2
    echo "Could not connect. The server said:" >&2
    echo "  ${TEST_ERR}" >&2
    echo >&2
    case "$TEST_ERR" in
      *"Invalid format for user or db_name"*|*EINVALIDUSERINFO*)
        echo "That message means the connection string itself is malformed," >&2
        echo "not that the password is wrong. Usually some of it arrived twice." >&2
        ;;
      *"password authentication failed"*|*"Wrong password"*)
        echo "The password is wrong. Reset it in the Supabase dashboard under" >&2
        echo "Settings > Database, then run this again." >&2
        ;;
      *"could not translate host name"*|*"Operation timed out"*|*"Network is unreachable"*)
        echo "The host could not be reached. Check your network, and check the" >&2
        echo "project is not paused in the Supabase dashboard." >&2
        ;;
    esac
    if [ "$NEEDS_SAVE" -eq 0 ]; then
      echo >&2
      echo "To re-enter the stored connection string, run:" >&2
      echo "  security delete-generic-password -s $KEYCHAIN_SERVICE" >&2
    fi
    exit 1
  fi
fi

if [ "$NEEDS_SAVE" -eq 1 ]; then
  security add-generic-password \
    -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w "$DB_URL" -U
  echo "Connection works. Saved to Keychain, so you will not be asked again."
  echo
fi

mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# Two dumps, concatenated, and it has to be two.
#
# The obvious single command, `--schema=public --table=auth.users`, silently
# produces a dump of auth.users *only*. pg_dump documents that --table wins:
# once any table pattern is given, --schema no longer selects anything. The
# result is a valid, complete, well-formed dump of three user rows and none of
# their data, which reports success and restores nothing worth having.
#
# auth.users goes first because every table in public carries a foreign key to
# it, and a restore that loads children before parents fails on all of them.
#
# --no-owner and --no-privileges because the roles on a fresh project are not
# the roles here, and a restore that halts on a missing role is not a restore.

# `set -o pipefail` is on, so the pipeline as a whole reports the failure of
# either pg_dump. Testing a variable set inside the braces would not work: the
# pipe puts them in a subshell, and the assignment dies with it.

echo "Dumping to $OUT"
if ! {
  "$PG_DUMP" "$DB_URL" \
    --table=auth.users \
    --no-owner --no-privileges --quote-all-identifiers &&
  "$PG_DUMP" "$DB_URL" \
    --schema=public \
    --no-owner --no-privileges --quote-all-identifiers

  # Re-create the triggers on auth.users, last.
  #
  # They come out with the first dump, where they cannot work: they call
  # functions that live in public and are not created until the second. Postgres
  # says so and carries on, so a restore appears to succeed while quietly losing
  # on_auth_user_created, which is what writes a profile row when someone signs
  # up. Existing users would be fine and every new one would get no profile.
  #
  # Emitted here rather than left to the restore procedure so the file stays
  # self-sufficient. A backup that needs a remembered manual step is a backup
  # with a step that will be forgotten.
  if [ -x "$PSQL" ]; then
    echo ""
    echo "-- Triggers on auth.users, replayed after their functions exist."
    echo "SET search_path = public;"
    PGCONNECT_TIMEOUT=15 "$PSQL" "$DB_URL" -tA -c \
      "select pg_get_triggerdef(oid)||';' from pg_trigger
        where tgrelid='auth.users'::regclass and not tgisinternal;"
  fi
} | gzip -9 > "$OUT"
then
  rm -f "$OUT"
  echo >&2
  echo "The dump failed. The usual causes, in order of likelihood:" >&2
  echo "  - the database is paused; open the Supabase dashboard to wake it" >&2
  echo "  - the password changed since it was stored" >&2
  echo "  - no network" >&2
  echo >&2
  echo "To re-enter the connection string, run:" >&2
  echo "  security delete-generic-password -s $KEYCHAIN_SERVICE" >&2
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"

# ---------------------------------------------------------------------------
# Verify by naming what has to be there.
#
# The completion marker alone passed happily on a dump that was missing every
# table that matters, because that dump really was complete. It was complete and
# empty. So check the marker for truncation, and check the tables by name for
# the failure the marker cannot see.

# Decompressed once to a temp file rather than into a shell variable, so this
# still works when the dump outgrows comfortable memory.
BODY="$(mktemp -t pbrr-verify)"
trap 'rm -f "$BODY"' EXIT
gzip -dc "$OUT" > "$BODY"

if [ "$(grep -c 'PostgreSQL database dump complete' "$BODY")" -lt 2 ]; then
  echo "INCOMPLETE: $OUT is missing a completion marker, so one of the two" >&2
  echo "dumps was cut short. Treat it as failed and do not rely on it." >&2
  exit 1
fi

MISSING=""
for t in auth.users public.profiles public.rosters public.players public.preferences; do
  schema="${t%%.*}"; table="${t##*.}"
  if ! grep -q "CREATE TABLE \"$schema\".\"$table\"" "$BODY"; then
    MISSING="$MISSING $t"
  fi
done

if [ -n "$MISSING" ]; then
  echo "INCOMPLETE: $OUT has no definition for:$MISSING" >&2
  echo "A dump missing a table restores a database missing that table." >&2
  exit 1
fi

# The trigger has to appear twice: once where pg_dump puts it and cannot work,
# and once at the end where it can. One occurrence means the replay is missing.
if [ "$(grep -c 'on_auth_user_created' "$BODY")" -lt 2 ]; then
  echo "INCOMPLETE: $OUT does not replay on_auth_user_created at the end." >&2
  echo "Restoring it would leave new signups without a profile row." >&2
  exit 1
fi

echo
echo "Rows captured:"
awk '
  /^COPY /   { name=$2; c=0; inb=1; next }
  inb && /^\\\.$/ { printf "  %-24s %d\n", name, c; inb=0; next }
  inb        { c++ }
' "$BODY"

echo
echo "OK  $OUT  ($SIZE)"

# Keep the last 30. Deliberately not unlimited: these hold real names and
# email addresses, so old copies are a liability rather than an asset.
ls -1t "$OUT_DIR"/pbrr-*.sql.gz 2>/dev/null | tail -n +31 | while read -r old; do
  echo "pruning $old"
  rm -f "$old"
done
