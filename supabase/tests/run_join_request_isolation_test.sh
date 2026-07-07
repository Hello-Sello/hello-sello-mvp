#!/usr/bin/env bash
# Run the Phase 12 Path-B isolation test (join_request_isolation_test.sql) against
# the LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB
# container (host psql may be absent — as on this machine).
#
# ⚠️  RED-FIRST (Wave-0): this EXITS NON-ZERO today by design — the six Path-B
# RPCs (search_joinable_companies, list_pending_join_requests, request_to_join,
# approve_join_request, reject_join_request, withdraw_join_request) do not exist
# yet. It goes GREEN when 12-02 lands those RPCs + the uq_join_request_active_pending
# index + the four join.* audit action codes.
set -uo pipefail

TEST_FILE="supabase/tests/join_request_isolation_test.sql"

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
