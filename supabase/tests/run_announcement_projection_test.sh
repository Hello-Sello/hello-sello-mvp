#!/usr/bin/env bash
# announcement projection (ANNC-01/ANNC-02)
# First run ever was 2026-08-25 and it FAILED: the suite asserted sender='sella'
# while 20260707130300_deal_event_system_voice.sql moved the voice to 'system' on
# 2026-07-07. The feature was fine; the test had rotted unseen for ~7 weeks
# because it had no runner. Assertions corrected the same day - now PASSES.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== announcement projection (ANNC-01/ANNC-02) =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/announcement_projection_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR|FAIL" || true

if echo "$out" | grep -q "ANNOUNCEMENT PROJECTION TEST PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
