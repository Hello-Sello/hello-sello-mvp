#!/usr/bin/env bash
set -uo pipefail
TEST_FILE="supabase/tests/list_incoming_person_requests_test.sql"
if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 < "$TEST_FILE"
fi
DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
[ -z "$DBC" ] && { echo "ERROR: no host psql and no running supabase_db_* container" >&2; exit 1; }
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
