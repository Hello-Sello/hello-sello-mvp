#!/usr/bin/env bash
# Run the send_deal c2c-announce proof (send_deal_c2c_announce_test.sql)
# against the LOCAL Supabase stack. Prefers host psql; falls back to the
# stack's DB container (host psql may be absent — as on this machine).
#
# ⚠️  RED-FIRST: this EXITS NON-ZERO before T01/HEL-63 lands — send_deal's
# company arm still calls deliver_deal only and posts no chat_message. It
# goes GREEN once 20260825090000_send_deal_c2c_announce.sql ships.
set -uo pipefail

TEST_FILE="supabase/tests/send_deal_c2c_announce_test.sql"

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
