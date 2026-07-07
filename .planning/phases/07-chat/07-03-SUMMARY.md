---
phase: 07-chat
plan: 03
subsystem: database
tags: [supabase, plpgsql, rpc, audit, postgrest, deals, edge-function]

# Dependency graph
requires:
  - phase: 03A/03C/03F (deal card + held-change + batch)
    provides: getPendingChange, confirm_detected_deal, confirm_deal_change, sella-summarize, writeAudit
provides:
  - "ProposalLineView.productId carried through getPendingChange (unblocks the 07-07 on-card red/green diff)"
  - "confirm_detected_deal returns { deal_card_id, born_now }; confirmDetectedDeal stamps deal.created exactly once (AUDIT-01)"
  - "Mechanical deal-event narration speaks as sender='system' (confirm_deal_change announce + sella-summarize), OBS-3"
affects: [07-07, 07-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OUT-param composite RPC return read via a tolerant object-or-array-of-one parse at the action layer"
    - "Re-emit the LATEST live function body verbatim + change ONE thing, verified by a body-diff against the source migration"

key-files:
  created:
    - supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql
    - supabase/migrations/20260707130300_deal_event_system_voice.sql
  modified:
    - src/modules/deals/types.ts
    - src/modules/deals/supabase/reads.ts
    - src/modules/deals/actions.ts
    - supabase/functions/sella-summarize/index.ts

key-decisions:
  - "Based both RPC re-emits on the LATEST live bodies (20260618150000 / 20260618140000), NOT the stale migrations the plan referenced, to avoid reverting the 3f batch snapshot + D-09 margin carry-forward"
  - "confirm_detected_deal converted to OUT params (deal_card_id, born_now) via DROP+CREATE, since a return-type change cannot ride CREATE OR REPLACE"
  - "born_now = true ONLY on the both-accepted birth path; idempotent re-call / reject / first-accept all return false, so the deal.created audit row is written exactly once"
  - "sella-summarize idempotency probe moved to changed_by='system' in lockstep with the log author, else it would re-summarize every call"
  - "ai:true metadata tag kept on the narration message (still Haiku-generated; Art. 50 is about provenance, not display author)"

patterns-established:
  - "Live-body-verbatim migration: extract the current function definition, change only the target lines, diff the two bodies to prove no logic drift"
  - "Tolerant RPC record parse: (Array.isArray(data) ? data[0] : data) guards against PostgREST object-vs-array shape differences for OUT-param functions"

requirements-completed: [SELL-01, OBS-3, AUDIT-01]

# Metrics
duration: 18min
completed: 2026-07-07
---

# Phase 7 Plan 03: Backend prerequisites (diff productId + born_now audit + System voice) Summary

**getPendingChange now carries productId (unblocks the on-card diff), RPC-born deals stamp deal.created exactly once via a new born_now flag, and mechanical deal-event narration speaks as System while Sella is a placeholder.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-07T07:16Z (approx)
- **Completed:** 2026-07-07T07:32Z
- **Tasks:** 3
- **Files modified:** 6 (4 modified, 2 created)

## Accomplishments
- SELL-01/D-18: `ProposalLineView` gains `productId: string | null`; `getPendingChange` maps it from the held draft's camelCase `productId` key, so 07-07 can pair current-vs-proposed lines by id instead of by name/index.
- AUDIT-01: `confirm_detected_deal` now returns `{ deal_card_id, born_now }`; `confirmDetectedDeal` writes the hash-chained `deal.created` audit row exactly once, only on the true born-now path (idempotent re-calls never double-stamp).
- OBS-3/D-10: the four `confirm_deal_change` announce inserts and the `sella-summarize` narration (log author + message sender + idempotency probe) move from `sella` to `system` - the neutral audit voice while Sella is a functionless placeholder.

## Task Commits

Each task was committed atomically:

1. **Task 1: Carry productId through ProposalLineView + getPendingChange** - `5c74398` (feat)
2. **Task 2: Close the born_now audit gap** - `5ee1901` (feat)
3. **Task 3: Switch mechanical deal-event narration to the System voice** - `1cbab67` (feat)

**Plan metadata:** committed separately with this SUMMARY.

## Files Created/Modified
- `src/modules/deals/types.ts` - `ProposalLineView` gains `productId: string | null` (documented).
- `src/modules/deals/supabase/reads.ts` - `getPendingChange` maps `productId` from the held draft; `getPendingProposal` fills `productId: null` (birth proposals have no product link) to satisfy the now-required field.
- `src/modules/deals/actions.ts` - `confirmDetectedDeal` reads the `{ deal_card_id, born_now }` record and stamps `writeAudit('deal.created')` once when `born_now` is true; doc comment updated.
- `supabase/functions/sella-summarize/index.ts` - log `changed_by`, message `sender`, and the idempotency probe all move to `system`; `ai:true` tag kept; header updated.
- `supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql` - DROP+CREATE `confirm_detected_deal` with OUT params `(deal_card_id, born_now)`, re-emitting the live batch-carrying body verbatim.
- `supabase/migrations/20260707130300_deal_event_system_voice.sql` - CREATE OR REPLACE `confirm_deal_change` re-emitting the live batch/margin/notes body verbatim, with only the 4 announce inserts' `sender` changed to `system`.

## Decisions Made
- **Live-body sourcing (critical):** The plan's `<interfaces>` pointed at the ORIGINAL migrations (`20260612140000` for `confirm_detected_deal`, `20260617140050` for `confirm_deal_change`), but both functions were `CREATE OR REPLACE`d several times since. I re-emitted from the LATEST live definitions (`20260618150000` and `20260618140000`) so the 3f batch snapshot, D-09 margin carry-forward, and note-slot behavior are preserved byte-for-byte. Verified `confirm_deal_change` with a body-diff (only the 4 sender values + 2 comment blocks differ).
- **DROP+CREATE for born_now:** A composite/OUT-param return changes the return type, which Postgres forbids under `CREATE OR REPLACE`, so `confirm_detected_deal` is dropped and recreated. Safe - the only caller is the app action; no SQL object depends on it.
- **OUT-param single-record parse:** The action reads the RPC result with `(Array.isArray(data) ? data[0] : data)` to be robust to PostgREST returning a single object vs an array-of-one for OUT-param functions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-emitted both RPCs from their LATEST live bodies, not the plan's stale references**
- **Found during:** Tasks 2 and 3
- **Issue:** The plan referenced `20260612140000` (confirm_detected_deal) and `20260617140050` (confirm_deal_change). Both had been re-defined by later migrations (`20260618150000`, `20260618140000`) carrying the 3f batch snapshot and D-09 margin carry-forward. Re-emitting the stale bodies verbatim would have silently reverted that behavior - a regression.
- **Fix:** Located the latest `create or replace` per function and re-emitted from those. For `confirm_deal_change` I diffed my body against the live source and confirmed the ONLY differences are the 4 `sella`->`system` sender values plus the comment updates.
- **Files modified:** both new migration files
- **Verification:** `diff` of the two `confirm_deal_change` bodies shows only the intended lines; `tsc`/`eslint` clean.
- **Committed in:** `5ee1901`, `1cbab67`

**2. [Rule 3 - Blocking] Added productId to the second ProposalLineView constructor (getPendingProposal)**
- **Found during:** Task 1
- **Issue:** Making `productId` a required field forced BOTH constructors of `ProposalLineView` to provide it; the plan only named `getPendingChange`. `getPendingProposal` (reads.ts:196) would have failed `tsc` otherwise.
- **Fix:** Added `productId: ... ?? null` to `getPendingProposal` too (a birth proposal has no product link and no existing card to diff against, so null is correct).
- **Files modified:** src/modules/deals/supabase/reads.ts
- **Verification:** `npx tsc --noEmit` exits 0.
- **Committed in:** `5c74398`

**3. [Rule 1 - Bug] Moved the sella-summarize idempotency probe to changed_by='system' in lockstep with the log author**
- **Found during:** Task 3
- **Issue:** The plan pointed at the log `changed_by` and the message `sender`, but the idempotency check queries `changed_by='sella'`. Changing only the insert would leave the probe never matching its own prior row - so Sella would re-summarize every version on every call (duplicate log lines + duplicate chat bubbles).
- **Fix:** Changed the probe's `.eq("changed_by", "sella")` to `"system"` so it matches the new author.
- **Files modified:** supabase/functions/sella-summarize/index.ts
- **Verification:** grep confirms all three author references are `system`; no `sella` author literals remain.
- **Committed in:** `1cbab67`

**4. [Rule 3 - Required] DROP+CREATE instead of CREATE OR REPLACE for the return-type change**
- **Found during:** Task 2
- **Issue:** The plan said "CREATE OR REPLACE" confirm_detected_deal, but adding OUT params changes the return type, which Postgres rejects under CREATE OR REPLACE.
- **Fix:** `drop function if exists ... (uuid, text)` then `create function ...`, with a header note. The plan itself anticipated "composite return / OUT param", which implies this.
- **Files modified:** supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql
- **Verification:** migration parses as expected; runtime apply is 07-08's job.
- **Committed in:** `5ee1901`

---

**Total deviations:** 4 auto-fixed (3 blocking, 1 bug). All necessary for correctness / to avoid regression. No scope creep.
**Impact on plan:** The two migrations preserve current live behavior exactly except the three intended changes.

## Issues Encountered
- **Stale line/file references in the plan interfaces.** The RPC bodies and line numbers had moved on since the referenced migrations. Resolved by grepping for the latest `create or replace` per function and re-emitting from there, then diffing to prove no logic drift.

## Minor Notes (not fixed - out of declared file scope)
- `e2e/fixtures/two-company.ts:94` has a now-stale COMMENT mentioning `sender='sella'` for the announcement. The `DELETE` it documents (lines 98-100) filters by message `type`, not `sender`, so the cleanup is unaffected by the voice switch. Left untouched (shared Muskan fixture, outside this plan's files).
- The `sella-summarize` AI-summary log line will now render with the Cog (System) icon in `LogsTab.tsx` instead of the Sparkles (Sella) icon - an intended visual consequence of OBS-3; `system` was already in `ACTOR_ICON`, so no code change was needed.

## Migration / DB Note
Both migration files were written and committed but NOT applied (`supabase db reset` / `db push` deferred to plan 07-08, which owns the single local schema apply after all migration plans merge). Because the new `born_now` OUT-param shape is not yet applied, `confirmDetectedDeal` reads it via the `as never` cast (no `database.types.ts` regen this phase - 07-08 regenerates).

## Verification
- `npx tsc --noEmit` -> 0
- `npx eslint src/modules/deals` -> 0
- Both migration timestamps (`20260707130200`, `20260707130300`) sort after the current tip (`20260622091000`).
- `confirm_deal_change` body diff vs live source: only the 4 sender swaps + comment updates.

## Next Phase Readiness
- 07-07 (on-card diff) can now pair current-vs-proposed lines by `productId`.
- 07-08 owns the local `supabase db reset` + `database.types.ts` regen that applies all Wave-1..4 migrations and exercises the born_now audit row + system-voiced announcement at runtime.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260707130200_confirm_detected_deal_born_now.sql
- FOUND: supabase/migrations/20260707130300_deal_event_system_voice.sql
- FOUND: .planning/phases/07-chat/07-03-SUMMARY.md
- FOUND commit 5c74398 (Task 1), 5ee1901 (Task 2), 1cbab67 (Task 3)
- `npx tsc --noEmit` 0; `npx eslint src/modules/deals` 0

---
*Phase: 07-chat*
*Completed: 2026-07-07*
