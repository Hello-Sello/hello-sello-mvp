#!/usr/bin/env bash
# HEL-74: send_deal refuses a suspended/ended relationship.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== send_deal relationship liveness =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/send_deal_relationship_liveness_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR" || true

if echo "$out" | grep -q "ALL CELLS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
