#!/usr/bin/env bash
# Run the E1 chat_message_type pill-seed proof against the LOCAL Supabase stack.
# Prefers host psql; falls back to the stack's DB container.
#
# ⚠️  RED-FIRST: EXITS NON-ZERO before the seed — one or both pill codes are
# missing. GREEN once 20260724121200_chat_message_type_pills_seed.sql ships.
set -uo pipefail

TEST_FILE="supabase/tests/chat_message_type_pills_seed_test.sql"

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
