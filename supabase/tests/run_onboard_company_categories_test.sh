#!/usr/bin/env bash
# onboard_company category assignments
# This suite carries NO transaction of its own — the runner wraps it in BEGIN/ROLLBACK, as its header requires.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== onboard_company category assignments =="
echo "   stack: ${DB_URL}"

out="$( { echo "BEGIN;"; cat "$HERE/onboard_company_categories_test.sql"; echo "ROLLBACK;"; } | psql "$DB_URL" -v ON_ERROR_STOP=1 2>&1 )" || true
echo "$out" | grep -E "NOTICE|ERROR|FAIL" || true

if echo "$out" | grep -q "ONBOARD CATEGORY ASSERTIONS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
