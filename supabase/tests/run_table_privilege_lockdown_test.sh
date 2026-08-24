#!/usr/bin/env bash
# Run the T11 table-privilege-lockdown proof (table_privilege_lockdown_test.sql) against the
# LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB
# container. Mirrors run_connection_visibility_override_test.sh's idiom
# exactly (single-phase, no race).
set -uo pipefail

TEST_FILE="supabase/tests/table_privilege_lockdown_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  # NOTE: the file is fed on STDIN (`-f -`), never as `-f <path>`. On this machine
  # `psql` is a shim (~/.local/bin/psql) that execs psql INSIDE the supabase_db
  # container, where a host-relative path does not exist — `-f "$TEST_FILE"` fails
  # with "No such file or directory". Stdin works for both a real psql and the shim.
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
