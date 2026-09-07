#!/usr/bin/env bash
# Run the HEL-85 confirm_deal_change workspace-gate proof
# (confirm_deal_change_workspace_gate_test.sql) against the LOCAL Supabase stack.
# Prefers host psql; falls back to the stack's DB container (host psql may be
# absent, or be the shim that execs psql INSIDE supabase_db).
#
# ⚠️  RED-FIRST: §B EXITS NON-ZERO against the pre-fix function by design —
# confirm_deal_change checks only relationship membership, so Dana's decline lands in
# a private thread. Goes GREEN once 20260903100000_confirm_deal_change_workspace_gate.sql lands.
#
# This suite does NOT require a `db reset`, and you should not run one for it:
# every reset rotates the local stack secret, which manufactures Playwright
# auth failures for any session sharing this stack. The suite wraps itself in
# BEGIN…ROLLBACK and asserts its own teardown.
set -uo pipefail

TEST_FILE="supabase/tests/confirm_deal_change_workspace_gate_test.sql"

if command -v psql >/dev/null 2>&1; then
  DB_URL="$(supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  # Fed on STDIN (`-f -`), never as `-f <path>`: where `psql` is the shim that
  # execs inside the supabase_db container, a host-relative path does not exist
  # there. Stdin works for a real psql and for the shim alike.
  exec psql "$DB_URL" -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
fi

DBC="$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)"
if [ -z "$DBC" ]; then
  echo "ERROR: no host psql and no running supabase_db_* container" >&2
  exit 1
fi
exec docker exec -i "$DBC" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < "$TEST_FILE"
