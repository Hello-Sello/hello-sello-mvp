#!/usr/bin/env bash
# announcement projection (ANNC-01/ANNC-02)
# 🔴 FAILS 2026-08-25, first run ever. The suite asserts sender='sella'; migration
# 20260707130300_deal_event_system_voice.sql changed it to sender='system'. The
# feature works - the TEST is stale. Left failing on purpose: now it is visible.
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
