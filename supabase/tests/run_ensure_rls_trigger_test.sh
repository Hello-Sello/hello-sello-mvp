#!/usr/bin/env bash
# Run the ensure_rls event-trigger proof (ensure_rls_trigger_test.sql) against
# the LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB
# container (host psql may be absent — as on this machine).
#
# ANY function in schema public becomes anon-executable. Because Postgres always
# grants EXECUTE to PUBLIC on newly created functions and that default cannot be
# revoked via ALTER DEFAULT PRIVILEGES, this test — not the database — is what
# keeps new RPCs from silently reopening the hole.
#
# an ordinary member can still self-grant team.manage through
# seed_company_superadmin. It goes GREEN once 20260817120000 lands.
set -uo pipefail

TEST_FILE="supabase/tests/ensure_rls_trigger_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
