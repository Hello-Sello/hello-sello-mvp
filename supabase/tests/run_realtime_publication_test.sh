#!/usr/bin/env bash
# Run the realtime-publication invariant proof (IN-03) against the LOCAL Supabase
# stack. Prefers host psql; falls back to the stack's DB container.
#
# Asserts BOTH deal_pending_change AND deal_card are members of the
# supabase_realtime publication (added by 20260617130000 + 20260618120010). This
# is the standing invariant that a stale e2e-fixture comment denied — it must
# stay GREEN so the false "never published" claim can never creep back.
set -uo pipefail

TEST_FILE="supabase/tests/realtime_publication_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  # The file is fed on STDIN (`-f -`), never as `-f <path>`: on a dev machine where
  # `psql` is the shim (~/.local/bin/psql) that execs psql INSIDE the supabase_db
  # container, a host-relative path does not exist there and this branch fails with
  # "No such file or directory". Stdin works for a real psql and for the shim alike.
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
