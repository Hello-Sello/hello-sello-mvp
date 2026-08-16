#!/usr/bin/env bash
# Run the decline_deal status-guard proof (decline_deal_test.sql, WR-02) against
# the LOCAL Supabase stack. Prefers host psql; falls back to the stack's DB
# container (host psql may be absent).
#
# ⚠️  RED-FIRST: this EXITS NON-ZERO before the WR-02 guards land — decline
# silently cancels an unsent draft AND a confirmed deal. It goes GREEN once the
# two guards ship in 20260724120600_deal_transition_rpcs.sql.
set -uo pipefail

TEST_FILE="supabase/tests/decline_deal_test.sql"

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
