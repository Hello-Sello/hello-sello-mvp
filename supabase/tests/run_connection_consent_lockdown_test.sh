#!/usr/bin/env bash
# Run the connection-consent + verification lockdown proof
# (connection_consent_lockdown_test.sql) against the LOCAL Supabase stack.
# Prefers host psql; falls back to the stack's DB container (host psql may be
# absent — as on this machine).
#
# ⚠️  RED-FIRST: this EXITS NON-ZERO against the pre-fix schema by design —
# blocks 1, 3, 3b, 3c and 7 currently SUCCEED at the self-write/forgery they
# attempt (that success IS the hole each proves), and blocks 4/5/6/8/9/11
# fail with 42883 because accept_connection_request / resubmit_company_
# verification do not exist yet. It goes GREEN once
# 20260823090000_connection_consent_and_verification_lockdown.sql lands.
set -uo pipefail

TEST_FILE="supabase/tests/connection_consent_lockdown_test.sql"

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
