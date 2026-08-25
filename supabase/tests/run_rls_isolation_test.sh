#!/usr/bin/env bash
# RLS isolation
# DEV-161 is STALE - closeable. It reported this suite failing on a FRESH
# `supabase db reset` for 3 reasons; verified 2026-08-25 on an actual fresh reset
# and it PASSES. The dropped `deal_workspace.owner_person_id` insert is gone
# (repaired incidentally by be3abda / 94f9b75, Wave 3). Nobody noticed the ticket
# was fixed because the suite had no runner to prove it with.
# Piped on stdin rather than `psql -f`: a sandboxed runner may not let psql open
# the path itself.
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "== RLS isolation =="
echo "   stack: ${DB_URL}"

out="$(psql "$DB_URL" -v ON_ERROR_STOP=1 < "$HERE/rls_isolation_test.sql" 2>&1)" || true
echo "$out" | grep -E "NOTICE|ERROR|FAIL" || true

if echo "$out" | grep -q "ALL RLS ISOLATION TESTS PASSED"; then echo "PASS"; exit 0; fi
echo "FAIL"; exit 1
