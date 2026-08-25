#!/usr/bin/env bash
# Run the HEL-69 price-view single-owner proof
# (pricelist_view_single_owner_test.sql) against the LOCAL Supabase stack.
# Prefers host psql; falls back to the stack's DB container (host psql may be
# absent — as on this machine).
#
# ⚠️  RED-FIRST: §A cells 2-4 and §D's viewdef assertion EXIT NON-ZERO against
# the pre-fix schema by design — today's view has no seller-verification, no
# seller-soft-delete and no location term, and reprints the predicate instead
# of calling product_price_visible_to_caller(). They go GREEN once
# 20260825100000_pricelist_view_single_owner.sql lands.
set -uo pipefail

TEST_FILE="supabase/tests/pricelist_view_single_owner_test.sql"

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
