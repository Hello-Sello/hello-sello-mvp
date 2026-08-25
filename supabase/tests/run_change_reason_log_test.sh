#!/usr/bin/env bash
# change reason log
# Reason text is recorded against a resolved held change.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== change reason log =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/change_reason_log_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR|FAIL" || true

if echo "$out" | grep -q "CHANGE REASON LOG TEST PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
