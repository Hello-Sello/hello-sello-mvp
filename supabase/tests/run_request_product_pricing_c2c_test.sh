#!/usr/bin/env bash
# T02 (0027-retire-connect-inbox, DEV-170): request_product_pricing_c2c posts
# a person-voiced message to the existing c2c thread instead of cutting a
# pending_inbox_item ticket, for a company the caller is already connected to.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== request_product_pricing_c2c (connected pricing ask) =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/request_product_pricing_c2c_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR" || true

if echo "$out" | grep -q "ALL CELLS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
