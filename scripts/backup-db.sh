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
  echo "  4. Paste it below and press Return. It will not echo."
  echo
  echo "It is saved to your Keychain, so this is the only time you are asked."
  echo
  printf "Connection string: "
  read -rs DB_URL
  echo

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

  if [[ "$DB_URL" != postgres* ]]; then
    echo "That does not look like a connection string. It should start with" >&2
    echo "postgresql:// — copy the URI, not the psql command." >&2
    exit 1
  fi

  security add-generic-password \
    -s "$KEYCHAIN_SERVICE" -a "$KEYCHAIN_ACCOUNT" -w "$DB_URL" -U
  echo "Saved to Keychain."
  echo
fi

# The transaction pooler speaks a reduced dialect and cannot serve a dump. It
# differs from the one that works by a single digit in the port, so say which.
if [[ "$DB_URL" == *":6543"* ]]; then
  echo "That is the transaction pooler, on port 6543, which cannot make a dump." >&2
  echo "Use the Session pooler instead. To replace the stored one, run:" >&2
  echo "  security delete-generic-password -s $KEYCHAIN_SERVICE" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# Both schemas, and this is the part that is easy to get wrong. The four tables
# in `public` are all keyed by user_id against auth.users. Dumping public alone
# produces rows that reference accounts that no longer exist, which restores
# into a database nobody can sign in to. The users have to come too.
#
# --no-owner and --no-privileges because the roles on a fresh project are not
# the roles here, and a restore that halts on a missing role is not a restore.

echo "Dumping to $OUT"
if ! "$PG_DUMP" "$DB_URL" \
  --schema=public \
  --table=auth.users \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  | gzip -9 > "$OUT"
then
  rm -f "$OUT"
  echo >&2
  echo "The dump failed. The usual causes, in order of likelihood:" >&2
  echo "  - wrong password in the stored connection string" >&2
  echo "  - the database is paused; open the Supabase dashboard to wake it" >&2
  echo "  - no network" >&2
  echo >&2
  echo "To re-enter the connection string, run:" >&2
  echo "  security delete-generic-password -s $KEYCHAIN_SERVICE" >&2
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"

# A dump that failed halfway still leaves a valid gzip file, so size alone
# proves nothing. Postgres writes this marker as the last line of a complete
# dump, and its absence is the difference between a backup and a comforting
# feeling.
if ! gzip -dc "$OUT" | tail -5 | grep -q "PostgreSQL database dump complete"; then
  echo "INCOMPLETE: $OUT does not end with Postgres's completion marker." >&2
  echo "Treat it as failed and do not rely on it." >&2
  exit 1
fi

ROWS="$(gzip -dc "$OUT" | grep -c '^INSERT\|^COPY' || true)"
echo "OK  $OUT  ($SIZE, $ROWS data statements)"

# Keep the last 30. Deliberately not unlimited: these hold real names and
# email addresses, so old copies are a liability rather than an asset.
ls -1t "$OUT_DIR"/pbrr-*.sql.gz 2>/dev/null | tail -n +31 | while read -r old; do
  echo "pruning $old"
  rm -f "$old"
done
