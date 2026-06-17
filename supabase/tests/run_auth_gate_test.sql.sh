#!/usr/bin/env bash
# Run the auth-gate invariant test (auth_gate_test.sql)
# against the LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB
# container (host psql may be absent on some machines).
set -euo pipefail

TEST_FILE="supabase/tests/auth_gate_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  if [ -z "$DB_URL" ]; then
    echo "ERROR: could not get DB_URL from supabase status (is the local stack running?)" >&2
    exit 1
  fi
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
