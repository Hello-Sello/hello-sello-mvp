---
phase: 18-buy-page
plan: 08
subsystem: api
tags: [supabase, server-action, csv-import, postgres]

# Dependency graph
requires:
  - phase: 18-buy-page (plan 18-04)
    provides: parsePurchaseHistoryCsv() pure CSV parser with CellError/missingHeaders contract
  - phase: 18-buy-page (plan 18-05)
    provides: purchase_history_import table schema + RLS
provides:
  - "importPurchaseHistoryCsv() server action — parse, validate, atomic insert"
affects: [18-buy-page (plan 18-12 upload UI)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validate-then-insert discipline: zero errors required before any DB write, mirrors src/modules/catalog/import.ts"
    - "Single multi-row INSERT (no RPC) for flat single-table imports — atomic in Postgres by default"

key-files:
  created: [src/modules/buy/csvImport.ts]
  modified: []

key-decisions:
  - "No RPC wrapper — a single Supabase .insert() call with an array of rows already compiles to one atomic multi-row INSERT statement; an RPC would be a thin pass-through with no complexity-hiding value for this flat table."
  - "buyer_company_id resolved server-side via getCurrentCompanyId(), created_by via getCurrentUser().id — never accepted from the client."

patterns-established:
  - "CSV import server actions: parse (pure) -> validate (errors.length guard before any .insert) -> atomic insert -> revalidatePath"

requirements-completed: [BUY-01]

# Metrics
duration: 6min
completed: 2026-07-08
---

# Phase 18 Plan 08: Purchase-History CSV Import Server Action Summary

**`importPurchaseHistoryCsv()` server action — atomic, all-or-nothing insert of parsed purchase-history CSV rows into `purchase_history_import`, buyer company always server-resolved**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-08T03:20:00Z
- **Completed:** 2026-07-08T03:26:22Z
- **Tasks:** 1
- **Files modified:** 1 (created)

## Accomplishments
- Wired `parsePurchaseHistoryCsv()` (plan 18-04) to a real DB write into `purchase_history_import` (plan 18-05's schema)
- Validation guard (`errors.length > 0 || missingHeaders.length > 0`) blocks any insert on a bad upload — verified positioned before the `.insert(` call
- `buyer_company_id` always resolved via `getCurrentCompanyId()`; `created_by` via `getCurrentUser()` — neither ever accepted from a caller-supplied value
- Single multi-row `.insert()` call — atomic in Postgres, no partial imports possible
- `revalidatePath("/buy")` on success so the Analytics table reflects the import immediately

## Task Commits

Each task was committed atomically:

1. **Task 1: importPurchaseHistoryCsv() server action** - `3fdd297` (feat)

**Plan metadata:** committed separately by orchestrator (per phase execution contract, this agent does not update STATE.md/ROADMAP.md)

## Files Created/Modified
- `src/modules/buy/csvImport.ts` - `"use server"` action: parses CSV via `parsePurchaseHistoryCsv()`, early-returns on any error/missing-header, otherwise atomically inserts all rows with server-resolved `buyer_company_id`/`created_by`, then revalidates `/buy`

## Decisions Made
- Skipped the RPC pattern used by `import_products` (catalog module) — that RPC exists because it fans out across multiple tables (product, pricelist, product_cost, batch, terpenes); `purchase_history_import` is a single flat table, so a plain multi-row `INSERT` is already atomic and avoids an unnecessary abstraction layer (per the plan's own interface note).
- `created_by` populated from `getCurrentUser()` (auth.uid(), matches `person.id` per existing codebase convention e.g. `deals/actions.ts`) rather than left null, for audit-trail completeness — the column is nullable so this isn't a required-field fix, just following established convention.

## Deviations from Plan

None - plan executed exactly as written. The interface, logic steps 1-4, and threat mitigations (T-18-13, T-18-14) match the plan's `<interfaces>` block verbatim.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`importPurchaseHistoryCsv()` is ready to be called from plan 18-12's upload UI — the `CsvImportResult` shape (`imported`/`errors`/`missingHeaders`) matches the parser's `CellError`/`missingHeaders` contract exactly, so the UI can render precise per-cell feedback with no re-shaping. No blockers.

---
*Phase: 18-buy-page*
*Completed: 2026-07-08*
