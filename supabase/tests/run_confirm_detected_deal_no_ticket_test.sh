#!/usr/bin/env bash
# T01 (0027-retire-connect-inbox, DEV-169): confirm_detected_deal stops
# cutting a pending_inbox_item ticket for a c2c-thread detection (v_cp null).
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== confirm_detected_deal no ticket (c2c fixture) =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/confirm_detected_deal_no_ticket_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR" || true

if echo "$out" | grep -q "ALL CELLS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
