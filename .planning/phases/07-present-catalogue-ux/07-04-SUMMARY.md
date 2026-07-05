---
phase: 07-present-catalogue-ux
plan: 04
subsystem: present-ui
tags: [react, nextjs, typescript, tailwind, catalog, present, storage, playwright, dnd]

# Dependency graph
requires:
  - phase: 07-present-catalogue-ux (plan 01)
    provides: product_media table + product.location + PDF-widened shop-media bucket + ShopProduct.media/images
  - phase: 07-present-catalogue-ux (plan 02)
    provides: reusable flip ProductCard (front) + LocationGroup (display) + ShopView grouped grid + editing state
  - phase: 07-present-catalogue-ux (plan 03)
    provides: renameProduct / softDeleteProduct / setProductLocation / addProductMediaRecord / removeProductMedia + video-host allowlist
provides:
  - reusable MediaManager (card-back Documents & Media manager) in the catalog module
  - ProductCard back wired to MediaManager + front edit affordances (rename / show-hide / soft-delete / drag grip)
  - LocationGroup as an edit-mode drop target (card→group move persists) + client-side group reorder
  - present-manage E2E turned green for the UX-04 cases
affects: [07-05, phase-16-shops-locations, buyer-present-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client-direct upload of image/PDF bytes → shop-media, then a record-path server action (orphan-cleanup on record failure) — mirrors ShopView's cover upload"
    - "Native HTML5 DnD with typed dataTransfer payloads (application/product-id vs application/group-loc) to distinguish card-move from group-reorder on one drop target"
    - "Cross-origin download via fetch→blob→native <a download> (single + sequential all) — no zip dependency"
    - "Module boundary kept clean: LocationGroup takes a targetLocation prop (app maps the synthetic Unassigned→null) rather than importing the app-layer UNASSIGNED sentinel"

key-files:
  created:
    - src/modules/catalog/components/MediaManager.tsx
  modified:
    - src/modules/catalog/components/ProductCard.tsx
    - src/modules/catalog/components/LocationGroup.tsx
    - src/modules/catalog/components/index.ts
    - src/app/present/ShopView.tsx
    - e2e/present-manage.spec.ts

key-decisions:
  - "Availability control = the existing profile_visible show/hide toggle (real, persisted via setProductProfileVisible) — a true 3-state stock/availability enum is a schema field deferred to a later plan (consistent with 07-02's static front indicator); avoided an out-of-scope Rule-4 column"
  - "Image drag-reorder applies to images only (product_image); video links keep their own product_media order — the two tables have independent position sequences, so a mixed reorder is not meaningful"
  - "Group-section reorder is client-only/ephemeral (Phase 16 owns a persisted location order) — no location-order schema added here, per the scope fence"
  - "Download uses fetch→blob→<a download> (not a bare cross-origin href) so a public-bucket file downloads instead of navigating, and fires a reliable download event"

patterns-established:
  - "Reusable MediaManager is the single card-back media/COA surface for seller present, buyer view, present mode, and the future deal basket"

requirements-completed: [UX-04]

# Metrics
duration: ~50min
completed: 2026-07-05
---

# Phase 7 Plan 04: Card BACK (Documents & Media) + Edit Surface Summary

**The card becomes a full editing surface: a reusable MediaManager on the back (image/video grid with client-direct upload ≤10 MB, drag-reorder, X-delete, paste-a-video-link, COA/custom-doc PDF folders + upload, single + sequential download-all — no zip, inert Sella slot), front edit affordances wired into ProductCard (in-place rename, show/hide, soft-delete, drag grip), and an edit-mode LocationGroup drop target that persists a card's move between location groups via setProductLocation — closing UX-04.**

## Performance
- **Duration:** ~50 min
- **Completed:** 2026-07-05
- **Tasks:** 2 (both `type=auto`)
- **Files:** 6 changed (1 created, 5 modified)

## Accomplishments
- Built the reusable **`MediaManager`** (card back): a Media grid of gallery images + external video links with image drag-reorder, per-tile X-delete and single-file download; an Upload affordance that pushes image bytes **client-direct** to `shop-media` then records the path via `addProductImageRecords`; a "paste a video link" input that host-validates through `addProductMediaRecord(video_link)`; COA + custom-doc **folders** listing `product_media` coa/doc rows as PDF download links, plus COA/document PDF upload (client-direct); a **Download all** control that sequentially triggers native `<a download>` per file (no `jszip`); and an **inert Sella "Marktvergleich" slot** (static label, no figure — legal-gated). Client-side 10 MB + accepted-type guards mirror the bucket policy.
- Wired **ProductCard**: the placeholder back face now mounts `<MediaManager>`; the front gains edit affordances shown only when `editing` — an in-place editable name with an explicit **Save name** button (`renameProduct`), a **show/hide** toggle (`setProductProfileVisible`), a **soft-delete** control with a confirm (`softDeleteProduct`), and a **drag grip** that starts the card move.
- Turned **LocationGroup** into an edit-mode drop target: a card dragged (by its grip) into another group calls **`setProductLocation`** and re-pulls the shop; a group header dragged onto another reorders the sections client-side. Distinct `dataTransfer` payload types keep the two drags unambiguous. ShopView passes `editing`, the client-side group order, and the `Unassigned`→null mapping down.
- Greened **`e2e/present-manage.spec.ts`** for the UX-04 cases against the built DOM + real seed.

## Task Commits
1. **Task 1: reusable MediaManager** — `f8ed178` (feat)
2. **Sync ritual (ShopView.tsx):** lock (sync) → work → release (sync)
3. **Task 2: wire card back + front edit + location drag + E2E** — `3a219bb` (feat)

## Files Created/Modified
- `src/modules/catalog/components/MediaManager.tsx` — reusable card-back media/COA manager (created)
- `src/modules/catalog/components/ProductCard.tsx` — back mounts MediaManager; front edit affordances + drag grip
- `src/modules/catalog/components/LocationGroup.tsx` — edit-mode drop target (card move) + group reorder
- `src/modules/catalog/components/index.ts` — exports MediaManager
- `src/app/present/ShopView.tsx` — passes editing/onChanged/onReorder + client-side group order
- `e2e/present-manage.spec.ts` — UX-04 cases aligned to the built DOM (RED scaffold → green)

## Decisions Made
- **Availability = the profile show/hide toggle.** There is no stock/availability column (07-02 confirmed the front indicator is a static "Available"), and adding a 3-state enum is a schema change out of this plan's scope. The edit-mode control wires to the existing, persisted `setProductProfileVisible` (Visible/Hidden) — a real availability-style control, not a stub. A true availability field is a later data-model addition.
- **Image-only reorder.** `product_image` and `product_media` (video links) hold independent `position` sequences; drag-reorder rewrites the image order (`setProductImageOrder`), and video tiles keep their own order.
- **Ephemeral group reorder.** Dragging a group header reorders the sections in client state only — persisting a bespoke location order is Phase 16 (structured locations own ordering), so no schema was added.
- **Clean module boundary.** `LocationGroup` takes a `targetLocation` prop (ShopView maps the synthetic `Unassigned` bucket to `null`) rather than importing the app-layer `UNASSIGNED` sentinel — the catalog module never imports from `src/app`.

## Deviations from Plan

### Alignment (no user decision needed)

**1. [Rule 3 - Stale reference] Client-direct upload template moved**
- **Found during:** Task 1. The plan's `<interfaces>` pointed at `ShopView.tsx ProductGallery.add ~L527-560` as the upload template, but **07-02 removed the inline gallery**. Copied the equivalent live pattern (`ShopView.uploadCover` + the PATTERNS client-direct template): browser→`shop-media` upload, server records the path, orphan-cleanup `catch` on record failure. No behavior change.

**2. [Design mapping] Availability control → profile visibility**
- See Decisions. The plan asked for "an availability control"; wired to the existing `setProductProfileVisible` to avoid an out-of-scope schema column. Documented as interim.

**3. [Test alignment] Rewrote the RED E2E scaffold to the built DOM + real seed**
- The scaffold assumed a per-card "edit" button; edit is a **shop-wide** state, so the cases enter edit via the top "Manage shop" button. The seed has **no product images**, so the image/download cases upload first (self-contained). The rename case waits for the Save button to disable (persist + re-pull) before reloading to avoid a reload/save race.
- **Human-UAT (not asserted headless), same posture as the plan's download-all:** media tile **drag-reorder** and **card→location-group drag**. Playwright cannot faithfully drive native HTML5 DnD (`dataTransfer`) events; both flows are implemented in the UI and persist via `setProductImageOrder` / `setProductLocation`, and are verified manually. Documented in the spec header.

## Known Stubs / Interim
- **Front availability indicator stays a static "Available"** (07-02 interim, unchanged) — no per-product stock field exists yet. The edit-mode control toggles `profile_visible` (real). A true availability enum is a later data-model addition.
- **Sella "Marktvergleich" slot renders inert by design** (static label, no figure) — live comparison is legal-gated (UWG §7). Not a stub — intentional per the scope fence and T-07-11.

## Threat Surface
- **T-07-09 (oversized/wrong-type upload):** mitigated — client-side 10 MB + accepted-type (JPG/PNG/WebP for images, application/pdf for docs) guards before upload, plus the server-side bucket limits (07-01); paths scoped to `{companyId}/products/...`.
- **T-07-10 (video XSS):** mitigated — the pasted URL is host-allowlisted server-side (`isAllowedVideoUrl`, 07-03) and rendered only as an allowlisted external link (`<a target=_blank rel=noreferrer>`), never an unchecked `<iframe src>`.
- **T-07-11 (Sella price leak):** mitigated — the slot is a static label with no figure derived from master/margin/cogs.
- **T-07-12 / T-07-SC:** mitigated — all writes go through the session-scoped 07-03 actions (RLS company-scoped); download-all uses native `<a download>`, no `jszip`/new package.

No new security surface beyond the plan's threat model.

## User Setup Required
None. No new packages, no migrations, no external service config. (The `product_media` table + PDF-widened bucket shipped in 07-01; cloud `db push` for the Phase-7 migrations remains batched per the ledger.)

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint` (all touched files) — clean.
- `npx playwright test e2e/present-manage.spec.ts` — **6/6 green** (rename persists, soft-delete, image upload, video link, COA PDF upload, single download). `e2e/present-grid.spec.ts` — 2/2 green (no regression from the ShopView/ProductCard edits).
- Grep gates: `MediaManager` exported from components/index.ts + mounted in ProductCard; `renameProduct` + `softDeleteProduct` in ProductCard; `setProductLocation` + a drop handler in LocationGroup; `shop-media` in MediaManager; **no `jszip`** anywhere.

_Note: the E2E ran against a fresh worktree dev server on port 3100 — the reused server on :3000 belongs to another checkout and served stale code. The manage cases MUTATE the local seed (rename/delete/upload persist); re-run `supabase db reset` to restore._

## Next Phase Readiness
- The card is now a complete editing surface (front + back). `MediaManager` is exported through `@/modules/catalog` for the buyer view, present mode, and the Phase 17 deal basket.
- 07-05 (banner + save-bar / present mode) builds on the same ShopView editing state.
- Cloud migration push for the Phase-7 migrations remains outstanding (ledger) before any cloud Present use.

## Self-Check: PASSED

---
*Phase: 07-present-catalogue-ux*
*Completed: 2026-07-05*
