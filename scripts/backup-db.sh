#!/usr/bin/env bash
#
# Take a restorable snapshot of the Supabase database.
#
# Supabase's free plan has no automated backups, so until that changes this is
# the only copy of an account that exists anywhere but the user's own phone.
#
# Usage:
#   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
#   ./scripts/backup-db.sh
#
# The connection string comes from the Supabase dashboard, under
# Project Settings > Database > Connection string > URI. It contains the
# database password, so it is read from the environment and never written to
# disk, never passed as an argument where `ps` would show it, and never
# committed. If you put it in a file, put that file outside this repository:
# the repository is public.
#
# Output goes to a sibling of the repo rather than inside it, for the same
# reason. That location is inside Dropbox, so a dump is replicated off this
# machine within seconds of being written, which is what makes this a backup
# rather than a second copy on the same failing disk.

set -euo pipefail

OUT_DIR="${BACKUP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/pickleball-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$OUT_DIR/pbrr-$STAMP.sql.gz"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is not set. See the comment at the top of this script." >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump not found. Install the Postgres client tools first:" >&2
  echo "  brew install libpq && brew link --force libpq" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

# Both schemas, and this is the part that is easy to get wrong. The four tables
# in `public` are all keyed by user_id against auth.users. Dumping public alone
# produces rows that reference accounts that no longer exist, which restores
# into a database nobody can sign in to. The users have to come too.
#
# --no-owner and --no-privileges because the roles on a fresh project are not
# the roles here, and a restore that halts on a missing role is not a restore.
echo "Dumping to $OUT"
pg_dump "$SUPABASE_DB_URL" \
  --schema=public \
  --table=auth.users \
  --no-owner \
  --no-privileges \
  --quote-all-identifiers \
  | gzip -9 > "$OUT"

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
