---
phase: 05-surface-polish-f-flags
plan: "03"
subsystem: discover-directory-rpc
tags: [sql, rpc, discover, badge, connect-scope, f6, local-apply]
dependency_graph:
  requires: []
  provides: [list_discoverable_companies_connect_scoped]
  affects: [discover-directory-badge, connection_state-computation]
tech_stack:
  added: []
  patterns: [create-or-replace-rpc, security-definer-boilerplate, connect-type-filter]
key_files:
  created:
    - supabase/migrations/20260617150000_list_discoverable_companies_connect_scope.sql
  modified: []
decisions:
  - Use create-or-replace (not drop+recreate) because the return signature is unchanged
  - Apply via incremental supabase migration up (not full db reset) since stack was already up-to-date
metrics:
  duration: ~5min
  completed: "2026-06-17T17:26:46Z"
  tasks_completed: 2
  files_created: 1
  files_modified: 0
---

# Phase 05 Plan 03: F6 Directory Badge Connect-Scope Migration Summary

## One-liner

Append-only `create or replace` migration scoping `list_discoverable_companies` `connection_state` to connect-type inbox items only, applied and verified live on the LOCAL stack.

## What Was Built

A new migration `20260617150000_list_discoverable_companies_connect_scope.sql` that replaces the directory RPC `list_discoverable_companies` (signature unchanged) with the same connect-type filter already shipped on the per-company sibling RPC in Phase 5 Plan 01 (F6a). The fix adds `and p.type in ('connect', 'connect_message')` to both the `requested` and `incoming` branches of the `connection_state` CASE expression, so a pending `pricelist_request` no longer flips a directory company's badge away from `'none'`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write the append-only F6 migration | 73d2548 | supabase/migrations/20260617150000_list_discoverable_companies_connect_scope.sql |
| 2 | Apply migration to LOCAL stack and verify RPC | (runtime — no source change) | local DB state |

## Verification Results

- `supabase migration up` applied `20260617150000_list_discoverable_companies_connect_scope.sql` with exit 0
- `pg_get_functiondef` via `docker exec supabase_db_hello-sello-design` confirms the live LOCAL function contains `p.type in ('connect', 'connect_message')` in both branches
- Migration targeted LOCAL only — no cloud apply (cloud deferred per CLAUDE.md carry-over)
- `p.type in ('connect', 'connect_message')` appears exactly **2** times in the migration file (grep count confirmed)
- `create or replace function public.list_discoverable_companies()` used (not drop+recreate); signature unchanged
- No `pricing_requested` column added; return shape matches original
- `security definer`, `set search_path to ''`, `revoke all ... from public`, `grant execute ... to authenticated` all preserved verbatim

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `create or replace` (not drop+recreate) | Return signature unchanged; drop+recreate only needed when signature changes (as in the F6a analog which added `pricing_requested` column) |
| Incremental `supabase migration up` (not full `db reset`) | Stack was already running and up-to-date; incremental apply is sufficient and faster for a single migration |
| No `pricing_requested` column in directory RPC | Per D-04: Discover directory shows Connect state only, no pricing CTA |

## Deviations from Plan

None — plan executed exactly as written. The `supabase db dump` verify command from the plan's `<verify>` block returned 0 matches (the dump format wraps differently), but `pg_get_functiondef` via docker exec confirmed the live definition — this is the fallback documented in the plan's own verify block ("verify the live local function definition manually via pg_get_functiondef").

## Known Stubs

None. This plan writes a SQL migration only; no UI stubs.

## Threat Flags

None. The change only narrows the `exists(...)` subqueries by adding a `type` predicate — it cannot expose additional companies or inbox rows. SEC boilerplate (`security definer`, `set search_path to ''`, REVOKE/GRANT) reproduced verbatim, no regression of Phase 2 scoping (T-05-04, T-05-05 mitigated per plan).

## Self-Check: PASSED

- [x] `supabase/migrations/20260617150000_list_discoverable_companies_connect_scope.sql` — FOUND
- [x] Commit 73d2548 — FOUND (verified via git log)
- [x] Live LOCAL function carries `p.type in ('connect', 'connect_message')` in both branches — CONFIRMED via pg_get_functiondef
