---
phase: 07-chat
plan: 04
subsystem: database
tags: [supabase-storage, rls, deal-artifact, invoice, finalize, stages, tdd, vitest]

# Dependency graph
requires:
  - phase: 07-01
    provides: "Stages/Deal-Room UI retirement (deleted the components that consumed the stage reads)"
  - phase: 07-03
    provides: "prior touches to actions.ts / reads.ts / types.ts (confirm_detected_deal born_now, event voice) so the central-file edits sequence cleanly"
provides:
  - "Private PDF-only `deal-artifacts` storage bucket (RLS scoped by can_access_workspace on the first path segment)"
  - "`uploadDealInvoice` client write - session-derived uploader company, D-28 one-shot guard"
  - "`canFinalizeByInvoice` pure gate + a rewritten `finalizeDeal` (seller invoice closes the deal, seller-caller guarded)"
  - "Stages backend fully retired; `thing.stage_code` made nullable so Things are flat/stageless"
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Session-derived uploader company on a CLIENT write (person self-read), never a client-passed value"
    - "Invoice-based finalize gate: agreed status + a seller-uploaded deal_artifact(invoice)"

key-files:
  created:
    - supabase/migrations/20260707130000_deal_artifacts_storage.sql
    - supabase/migrations/20260707130100_thing_stage_code_nullable.sql
  modified:
    - src/modules/deals/supabase/writes.ts
    - src/modules/deals/components/DocumentsTab.tsx
    - src/modules/deals/lib/finalize.ts
    - src/modules/deals/lib/finalize.test.ts
    - src/modules/deals/actions.ts
    - src/modules/deals/supabase/reads.ts
    - src/modules/deals/types.ts
    - src/modules/deals/index.ts

key-decisions:
  - "The D-28 one-shot invoice guard lives in uploadDealInvoice (rejects a second invoice at the point of the second upload attempt), not in finalizeDeal"
  - "finalizeDeal drops the deal_confirmation seal write entirely - the seal is retired with the Stages gate; the invoice PDF is the close artifact"
  - "finalizeDeal strengthens the session-company guard to require caller == sellerCompanyId (a buyer-session finalize is rejected, meeting the acceptance criterion + T-07-04-02)"
  - "ThingView.stageCode removed outright (not nulled); Things are flat, so the stage field is gone"

patterns-established:
  - "Deal-artifact storage bucket: private, PDF-only, first-path-segment = deal_workspace_id, RLS via can_access_workspace"
  - "Invoice close gate: canFinalizeByInvoice(status, hasSellerInvoice) as the pure unit-tested decision"

requirements-completed: [FIN-01, INV-01, DROOM-01]

# Metrics
duration: 35min
completed: 2026-07-07
---

# Phase 7 Plan 04: Invoice close + Stages retirement Summary

**The seller's invoice-PDF upload is now the one close trigger (private deal-artifacts bucket + `uploadDealInvoice` + an invoice-based, seller-guarded `finalizeDeal`), and the Stages backend is fully retired with a nullable `thing.stage_code`.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-07-07T07:50:00Z (approx)
- **Completed:** 2026-07-07T08:09:12Z
- **Tasks:** 3 (Task 2 was TDD: RED + GREEN)
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- Private PDF-only `deal-artifacts` bucket with `storage.objects` RLS scoped by `can_access_workspace` on the first path segment (D-28 / ASVS V5).
- `uploadDealInvoice` client write: session-derived uploader company, D-28 one-shot guard, uploads to `<workspace_id>/<file>` then inserts a `deal_artifact(category='invoice')`.
- DocumentsTab turned from a disabled stub into a real seller-only PDF upload control that, on select, uploads then finalizes then dispatches `hs:deal-updated`.
- `canFinalizeByInvoice` (pure, unit-tested) replaces `allStagesDone`/`canFinalizeFromStatus`; `finalizeDeal` now gates on a seller-uploaded invoice and rejects a buyer-session call (ASVS V4).
- Stages backend retired: `getStagesAndThings`/`getStageCompletions`/`markStageDone`/`STAGE_LABELS` + the `StageView`/`StageCode`/`StageCompletionView` types removed from the module + barrel; `thing.stage_code` made nullable so Things insert flat.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bucket + uploadDealInvoice + real DocumentsTab** - `2b6a0e1` (feat)
2. **Task 2: Rewrite the finalize gate (TDD)** - `08a77fb` (test, RED) → `45a9801` (feat, GREEN)
3. **Task 3: Retire the Stages backend + nullable stage_code** - `7bc4503` (refactor)

_Note: Task 2 is TDD, hence the RED test commit before the GREEN implementation._

## Files Created/Modified
- `supabase/migrations/20260707130000_deal_artifacts_storage.sql` - private PDF-only `deal-artifacts` bucket + storage RLS via `can_access_workspace`.
- `supabase/migrations/20260707130100_thing_stage_code_nullable.sql` - `ALTER TABLE public.thing ALTER COLUMN stage_code DROP NOT NULL` (FK + `deal_stage`/`deal_stage_completion` tables left dormant).
- `src/modules/deals/supabase/writes.ts` - added `uploadDealInvoice`; removed `markStageDone`; `createThing` no longer takes/inserts a stage (stage_code omitted = NULL).
- `src/modules/deals/components/DocumentsTab.tsx` - real seller-only `<input type="file" accept="application/pdf">`; upload → finalize → `hs:deal-updated`.
- `src/modules/deals/lib/finalize.ts` - `canFinalizeByInvoice` replaces the retired stage gates.
- `src/modules/deals/lib/finalize.test.ts` - the invoice close-gate behaviour matrix.
- `src/modules/deals/actions.ts` - rewrote `finalizeDeal` (seller derivation, seller-caller guard, invoice check, `done` flip, `deal_card_log` + audit).
- `src/modules/deals/supabase/reads.ts` - removed `getStagesAndThings`/`getStageCompletions`/`STAGE_LABELS` + the stage imports.
- `src/modules/deals/types.ts` - removed `StageView`/`StageCode`/`StageCompletionView` + `ThingView.stageCode`.
- `src/modules/deals/index.ts` - added `uploadDealInvoice`; dropped the stage exports.

## Decisions Made
- **One-shot in the write (D-28):** `uploadDealInvoice` rejects a second invoice for a deal (a `category='invoice'` row already exists), so the seller sees the rejection at the point of the second upload rather than at finalize. A correction goes via the reopen ticket (out of scope), not a re-upload.
- **Seal retired:** the old `finalizeDeal` upserted a `deal_confirmation` seal; the new one does not. D-27 makes the invoice PDF itself the close artifact (no buyer confirm-receipt), and the seal was part of the retired Stages/finalize model. `deal.finalized` provenance still lands in `deal_card_log` + `audit_log`.
- **Seller-caller guard strengthened:** the plan said "keep the session-company guard (:215)"; the acceptance criterion + threat T-07-04-02 require a buyer-session finalize to be blocked. So `finalizeDeal` derives `sellerCompanyId` from the card + relationship and throws when `companyId !== seller`, on top of requiring the invoice's `uploaded_by_company_id == seller`.
- **`ThingView.stageCode` removed:** since Things are flat now, the field is gone rather than nulled. No component read it (confirmed via grep), so no consumer changed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical / threat mitigation] finalizeDeal did not block a buyer caller**
- **Found during:** Task 2 (finalize gate rewrite)
- **Issue:** The plan's prose said to "keep the session-company guard (:215)", but that guard only checked a company existed - it did NOT block a buyer-session finalize call. The acceptance criterion and threat register (T-07-04-02, disposition = mitigate) both require a buyer to be rejected.
- **Fix:** `finalizeDeal` now derives `sellerCompanyId` from the card + relationship and throws "Only the seller can finalize this deal." when the session company is not the seller, in addition to requiring the invoice's `uploaded_by_company_id == seller`.
- **Files modified:** src/modules/deals/actions.ts
- **Verification:** `canFinalizeByInvoice` unit matrix green; tsc + eslint clean; a buyer caller fails the seller-caller check before the gate.
- **Committed in:** `45a9801` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 missing-critical / threat mitigation).
**Impact on plan:** The mitigation is exactly what the acceptance criterion and threat register asked for; no scope creep.

## Issues Encountered
- **cwd drift (worktree):** one verification `cd`'d into the shared checkout and ran the OLD `finalize.test.ts` (7 passing tests), masking the RED. Caught immediately (test count mismatch), re-ran in the worktree root (each bash call resets to the worktree cwd) and confirmed the true RED (`canFinalizeByInvoice is not a function`). No commit was affected.

## User Setup Required
None - no external service configuration required. The two migrations are NOT applied here; plan 07-08 owns the single local `supabase db reset` after all Phase-7 migration plans merge, and regenerates `database.types.ts`.

## Known Stubs
None. DocumentsTab is a real upload control (no longer disabled). It is not yet rendered by a page - 07-07 owns hosting it (see Next Phase Readiness); that is a wiring gap by design, not a data stub.

## Next Phase Readiness
- **07-07 (card/Deal-Room host):** must render `DocumentsTab` with the new props `workspaceId`, `dealCardId`, and `canUpload` (compute `canUpload = viewerSide === "seller"`), and export `DocumentsTab` from the deals barrel if it renders it from another module (it is currently module-internal). It should also listen for `hs:deal-updated` to re-read the card + artifact list after an upload.
- **07-08 (schema apply + e2e):** applies the two migrations via `supabase db reset`, regenerates `database.types.ts`, and exercises the runtime close flow e2e (seller uploads PDF → status `done` → buyer sees Deal Executed; second upload rejected; buyer cannot finalize).
- Module builds green: `npx tsc --noEmit` 0, `npx eslint src/modules/deals` 0, `npm run test:unit` 71/71, `npm run build` 0.

## Self-Check: PASSED

- Files verified on disk: both migrations + this SUMMARY (FOUND).
- Commits verified in git: `2b6a0e1`, `08a77fb`, `45a9801`, `7bc4503` (FOUND).

---
*Phase: 07-chat*
*Completed: 2026-07-07*
