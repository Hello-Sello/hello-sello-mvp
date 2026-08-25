#!/usr/bin/env bash
# pending change lock
# A held change blocks a second concurrent proposal.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== pending change lock =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/pending_change_lock_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR|FAIL" || true

if echo "$out" | grep -q "PENDING CHANGE LOCK TEST PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
