# 3c - Stage pipeline + Things checklist

**Status:** LOCKED with Ayush (2026-06-10). Ready to build.
**Owner:** Ayush. **Builds on:** 3b (workspace container, merged). **Seeded card:** `04695a2d`.
**Created:** 2026-06-10.

> 3c fills the **Things tab stub** in `WorkPanel` (Things are REAL - ticking saves to the DB) and adds a
> **screen-only 5-stage bar** across the top. The bar communicates the concept; it is NOT wired to the database
> (stages become a custom feature later, so we don't over-build a model we'll redesign). Status flip
> (Draft -> Confirmed) is 3d, and is driven by the two-sided confirm gate, NOT by the stage - so a screen-only
> bar does not block 3d.

---

## 1. Decisions locked (2026-06-10, with Ayush)

- **D1 - Things group BY STAGE.** Things sit under the 5 stage headings: Negotiation, Compliance & Quality,
  Agreement, Payment, Fulfilment. Zero schema change (`thing.stage_code` already exists). The old "by domain"
  naming is dead.
- **D2 - Stage bar = Level B (clickable, screen-only).** A strip across the top, clickable to highlight a stage so
  it feels alive, but it does **not** save to the DB and resets on refresh. **No `current_stage_code` column, no
  advance plumbing, no audit on advance.** Reasoning: advancing is a manual marker anyway, and stages will become
  custom later - building real stage plumbing now means building something we plan to throw away. This **overrides**
  the old prototype note ("stages are NOT a UI element"); that note is stale and gets fixed at wrap.
- **D3 - Things are REAL (tick + create).** Ticking a Thing writes `thing.status` (`open` <-> `done`) to the DB and
  survives a refresh. **`+ Add a thing` is now LIVE too** (pulled in from post-demo at Ayush's request, 2026-06-11):
  an inline title input creates a `task` Thing in the selected stage. RLS (`thing_all`, FOR ALL) permits both the
  update and the insert - no schema change. This is where 3c's real value sits. (Special types approval/upload and
  stage editing stay deferred.)
- **D4 - FUTURE (noted, not built): domain as a subset of a stage.** Inside each stage there can be different
  **domains** (different kinds of work needed to finish that stage). Add a `domain` table/field later, scoped under
  a stage, once stages go custom. Captured here so it is not lost; out of scope for June 11.

## 2. Schema - NO change needed

Level B (screen-only bar) means **no `deal_workspace` column** and **no stage migration**. The only DB write is
the Things seed (Phase 0) and the tick toggle (Phase 3, an UPDATE to `thing.status`). The `deal_stage` list (5
stages) and the `thing` table are already there - 3c only reads `deal_stage` and reads/updates `thing`.

## 3. What already exists (so 3c just consumes it)

- `deal_stage` seeded with the 5 stages (codes: `negotiation`, `compliance_quality`, `agreement`, `payment`,
  `fulfilment_delivery`; `sort_order` 1-5).
- `thing` table migrated: `stage_code` FK -> `deal_stage`, `status` (`open`/`done`), `type`
  (`task`/`approval`/`document_upload`), `sort_order`, `completed_at`, `completed_by_person_id`,
  `linked_confirmation_id`, `linked_artifact_id`.
- **RLS already allows it:** `thing_all` and `ws_all` are `FOR ALL TO authenticated USING(can_access_workspace(...))`
  - deal members can SELECT/INSERT/UPDATE Things and the workspace. **No new RLS needed.**
- `getWorkspace()` in `deals/supabase/reads.ts` returns the workspace + members + deal thread. 3c extends it.

## 4. Phases (build + verify each in Claude Preview, tsc + eslint clean)

- **Phase 0 - seed Things.** One migration `..._seed_demo_things.sql`: seed a handful of Things across stages on the
  demo workspace - a few `task` Things in Negotiation + Compliance (mix of `open`/`done` so progress shows), one
  `approval` Thing in Agreement (the e-sign gate, 3d wires it), a couple of `task`/`document_upload` Things in
  Payment/Fulfilment. **No workspace column.** *Verify:* rows present, FKs valid, both sides read them via RLS.

- **Phase 1 - types + reads.** Add `StageView` (code, label, sortOrder, thingsTotal, thingsDone) and `ThingView`
  (id, title, type, status, stageCode, sortOrder). Add `getStagesAndThings(workspaceId)` to `reads.ts`: read the 5
  `deal_stage` rows + the workspace's Things, group Things under their stage. *Verify:* console-log the shape both
  sides; RLS returns Things.

- **Phase 2 - StageBar (screen-only).** A 5-stage strip in the top band (under `WorkspaceHeader`). Clicking a stage
  highlights it via **local React state only** - no DB write, no audit. Stages 4-5 styled as "ahead." Default
  highlight = stage 1. *Verify:* clicking highlights, reads clean both sides, no console errors. (Resets on refresh
  by design.)

- **Phase 3 - Things tab REAL.** Replace the `WorkPanel` Things stub: Things grouped under the 5 stage headings,
  each with an open/done checkbox + a per-stage done-count/progress. Tick toggles `thing.status`
  (`open`<->`done`, sets `completed_at`/`completed_by_person_id`) - a real **client-side** DB write (same client as
  reads) that survives refresh. `approval` Things render with an e-sign affordance but the **real two-sided gate is
  3d** (display/link only here). `+ Add a thing` stays disabled (user-created Things are post-demo). *Verify:* tick
  persists + survives refresh both sides; progress updates.

  > **Audit deferred (finding 2026-06-10):** `audit_log` has a `thing` content type but **no `thing.*` action code**,
  > and the `writeAudit` helper has **no callers anywhere** - 3a/3b never wired audit either. So 3c does **not** add
  > audit (it would need a new action-code migration + a server action just for this one write). Audit becomes one
  > cross-cutting pass, best paired with 3d (which already has the `esignature.signed` code). Tracked as a doubt.

- **Phase 4 - verify both sides + wrap.** Full walk Alice <-> Bob; `tsc` + eslint clean; update sync file, this log,
  CLAUDE.md Last-session / What's-next; fix the stale prototype/CLAUDE.md "stages NOT a UI element / by domain"
  notes; record the D4 domain-future note in CONTEXT if it earns a term.

## 5. Boundaries (what 3c does NOT do)

- **No status flip.** The stage bar does not touch the deal's status - Draft -> Confirmed is 3d, driven by the
  two-sided confirm gate (the lifecycle pill stays display-only). The bar is purely visual.
- **No real stage state.** The bar is screen-only (D2): no stored stage, no advance plumbing, no audit on click.
  Auto-advance-when-Things-done and a stored/custom stage model are the documented next layer.
- **No user-created STAGES.** Stages are still the fixed 5-template. (User-created *Things* ARE now built - D3.)
- **No real e-sign / confirmation.** The `approval` Thing is a placeholder that 3d wires to `deal_confirmation`.
- **No document upload.** Documents tab stays a stub (later task; `deal_artifact` migrated).

## 6. Process

1. Lock §1-§2 with Ayush (especially the migration). 2. Build phase by phase, verify each in Preview.
3. Keep behind the `deals/index.ts` barrel. 4. Wrap: sync file + this log + CLAUDE.md.
