#!/usr/bin/env bash
# HEL-75 — inbox_insert receiver gate.
# Exits non-zero on the first failing cell (ON_ERROR_STOP + a rolled-back txn).
# The suite is piped on stdin rather than passed with `psql -f`: under a
# sandboxed runner psql may not be able to open the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== HEL-75: inbox_insert receiver gate =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/inbox_insert_receiver_gate_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR" || true

if echo "$out" | grep -q "ALL CELLS PASSED"; then
  echo "PASS"
  exit 0
fi
echo "FAIL"
exit 1
