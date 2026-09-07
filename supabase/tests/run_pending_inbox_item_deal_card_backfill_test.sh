#!/usr/bin/env bash
# T05 (0027-retire-connect-inbox): the backfill migration resolves every
# still-open `deal_card` pending_inbox_item ticket, leaving every other
# pending ticket and the deal itself untouched.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== pending_inbox_item deal_card backfill =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/pending_inbox_item_deal_card_backfill_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR" || true

if echo "$out" | grep -q "ALL CELLS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
