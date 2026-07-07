#!/usr/bin/env bash
# Run the Phase 13 SET-04 notification-preference invariant test
# (notification_pref_rls_test.sql) against the LOCAL Supabase stack. Prefers host
# psql; falls back to the stack's DB container (host psql may be absent).
#
# GREEN-on-arrival: it runs AFTER `supabase db reset` has applied
# 20260706090100_notification_preference.sql, so the three tables + own-row RLS
# already exist. A non-zero exit here means a real invariant regressed (own-row
# scope leak, or a category turned non-transactional → a dead toggle).
set -uo pipefail

TEST_FILE="supabase/tests/notification_pref_rls_test.sql"

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
