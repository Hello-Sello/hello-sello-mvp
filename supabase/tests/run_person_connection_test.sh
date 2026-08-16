#!/usr/bin/env bash
# Run the person_connection edge proof (person_connection_test.sql) against the
# LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB container
# (host psql may be absent — as on this machine).
#
# ⚠️  RED-FIRST: EXITS NON-ZERO against the pre-PG-1 schema by design — the
# person_connection table does not exist yet. Goes GREEN once the PG-1 migration
# lands the table + canonical CHECK + partial unique index + RLS.
set -uo pipefail

TEST_FILE="supabase/tests/person_connection_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  # Pipe via stdin (not -f): the host psql wrapper on this machine mishandles -f.
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 < "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
