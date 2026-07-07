---
phase: 07-present-catalogue-ux
plan: 05
subsystem: present-ui
tags: [react, nextjs, typescript, tailwind, present, in-place-edit, playwright]

# Dependency graph
requires:
  - phase: 07-present-catalogue-ux (plan 02)
    provides: ShopView grouped square grid + location dropdown + editing state
  - phase: 07-present-catalogue-ux (plan 04)
    provides: ProductCard back (MediaManager) + front edit affordances (the editing state 07-05 lifts)
  - phase: 06-discover-home-ux
    provides: shared BrandingEditForm (the one logo/branding writer, reused here)
provides:
  - reusable PresentBanner (LinkedIn 4:1 MVP banner + banner-mounted controls + in-place name/tagline + cover upload)
  - reusable SaveBar (sticky top-right Save that pulses only when dirty, no jiggle, reduced-motion safe)
  - reusable InfoBox + DescriptionEditor (equal-height expandable info box, 2600-char cap, both prototype bugs fixed)
  - ShopView chrome fully in-place editable, committing through the existing updateShopProfile writer
affects: [07-06-present-mode, phase-16-shops-locations, buyer-present-view]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sticky dirty-gated pulse animates box-shadow ONLY (styled-jsx keyframe) so the Save never jiggles; gated behind prefers-reduced-motion"
    - "Expandable panel over a 3D-card grid: give the box its own stacking context (relative z-30) + solid-white open state so it paints ABOVE the flip cards"
    - "Click-away collapse without the prototype's detach bug: React state (no innerHTML rebuild) + stopPropagation on the openers + a document listener attached only while open"
    - "Committing in-place edits through a full-replace server action safely: round-trip the untouched fields (links/address/website) in the same FormData so they are never nulled"

key-files:
  created:
    - src/app/present/SaveBar.tsx
    - src/app/present/PresentBanner.tsx
    - src/app/present/InfoBox.tsx
  modified:
    - src/app/present/ShopView.tsx
    - e2e/present-banner.spec.ts
    - e2e/present-info.spec.ts

key-decisions:
  - "Split the prototype's single toggling button into a banner-mounted 'Manage shop' entry (PresentBanner) + a sticky 'Save changes' bar (SaveBar) that appears only in edit mode — cleaner separation of enter-edit vs commit, and both banner labels stay literal"
  - "Links are DISPLAY-only (Phase-16 fence). Because updateShopProfile is a full-replace writer, Save re-sends the current links/address/website so they are preserved (Rule 1: omitting them would silently wipe the seller's links) — manage.ts left unchanged"
  - "Logo/branding edits stay behind the shared BrandingEditForm (one logo writer, D-07); PresentBanner opens it via an onEditBranding callback and never writes a logo path itself"
  - "InfoBox expands INLINE with a solid-white + z-30 open state (not an absolute overlay) — keeps the editable description textarea single-instance and still guarantees it paints above the 3D cards"

patterns-established:
  - "PresentBanner + SaveBar + InfoBox are the reusable Present chrome for the buyer view, present mode (07-06), and future surfaces"

requirements-completed: [UX-05, UX-06]

# Metrics
duration: ~45min
completed: 2026-07-06
---

# Phase 7 Plan 05: MVP Banner + In-Place Edit + Sticky Save + Info Boxes Summary

**The shop chrome becomes premium and fully in-place editable: a LinkedIn-4:1 PresentBanner carrying "+Add products" / "Manage shop" with in-place name & sub-headline, an equal-height expandable InfoBox row (2600-char description, click-away collapse, both prototype bugs fixed), and a sticky top-right SaveBar that pulses only when dirty (no jiggle) — committing every field through the existing updateShopProfile writer while preserving links/address/website.**

## Performance
- **Duration:** ~45 min
- **Completed:** 2026-07-06
- **Tasks:** 2 (both `type=auto`)
- **Files:** 6 changed (3 created, 3 modified)

## Accomplishments
- Built **`SaveBar`** — a sticky top-right control that renders only in edit mode with "Save changes" + "Exit". The Save **pulses only while `dirty`** via a styled-jsx keyframe that animates **box-shadow only** (never layout → no jiggle, Muskan's explicit lock), gated behind `prefers-reduced-motion: no-preference`. Exposes `data-dirty` + `data-testid="save-changes-btn"` for the E2E.
- Built **`PresentBanner`** — a **LinkedIn 4:1** (`aspect-[4/1]`) cover with the logo tile + **enlarged** company name (h1) and sub-headline (tagline). Banner-mounted controls "+Add products" (opens the existing AddProductsDrawer) and "Manage shop" (enters edit). In edit mode the name/tagline become in-place inputs (calm ring + wash), "Change banner" uploads a new cover **client-direct** → `cover_path`, and "Edit logo & branding" opens the shared **BrandingEditForm** (the one logo writer). The DEV-117 "all-locations" strip is dropped.
- Built **`InfoBox`** (+ `DescriptionEditor`) — an **equal-height** box that expands on click to reveal `more` over the grid and collapses on **✕ or click-away**, with **both prototype bugs fixed**: (1) click-away detach — React state (no innerHTML rebuild) + `stopPropagation` on the openers + a document listener attached only while open; (2) panel-behind-cards — `relative z-30` own stacking context + **solid-white** open state so it paints above the 3D flip cards. `DescriptionEditor` is a textarea hard-capped at **2600** with a live counter.
- Rewired **`ShopView`**: `ProfileHero`/`ProfileEditor` are replaced by `PresentBanner` + a three-box `ShopInfoRow` (About/description, Location/HQ + single warehouse line, Links/display-only) + the sticky `SaveBar`. Edit state (`edits` + `dirty`) is lifted so any banner/info change pulses the Save; **Save commits through the existing `updateShopProfile`** (no new manage.ts action), round-tripping the untouched links/address/website so the full-replace action never wipes them. The 07-02/07-04 grid, LocationTabs, and card edit affordances are untouched.
- Turned **`e2e/present-banner.spec.ts`** (banner controls + dirty-Save pulse) and **`e2e/present-info.spec.ts`** (expand / ✕ / click-away / above-cards z-index / 2600 cap) green for the in-scope cases; the present-mode button assertion is re-scoped to 07-06 (`test.fixme`).

## Task Commits
1. **Task 1: SaveBar + PresentBanner** — `f5a0973` (feat)
2. **Task 2: InfoBox + wire chrome into ShopView + E2E** — `70b9004` (feat)

## Files Created/Modified
- `src/app/present/SaveBar.tsx` — sticky dirty-gated pulsing Save (created)
- `src/app/present/PresentBanner.tsx` — 4:1 MVP banner + banner-mounted controls + in-place edit (created)
- `src/app/present/InfoBox.tsx` — expandable equal-height info box + DescriptionEditor (2600 cap) (created)
- `src/app/present/ShopView.tsx` — composed the new chrome; in-place edit + Save via updateShopProfile; removed ProfileHero/ProfileEditor
- `e2e/present-banner.spec.ts` — banner controls + dirty-Save cases (RED scaffold → green)
- `e2e/present-info.spec.ts` — expand/collapse/2600/above-cards cases (RED scaffold → green)

## Decisions Made
- **Split the toggling button into two controls.** The prototype used one button whose label flipped Manage↔Save. Here "Manage shop" (enter edit) lives in the banner and "Save changes" (commit, dirty-pulse) lives in the sticky SaveBar shown only in edit mode. Cleaner enter-vs-commit separation; both banner labels stay literal for the E2E.
- **Links display-only + safe round-trip.** Per the Phase-16 fence, link *management* is deferred; the Links InfoBox is read-only. Since `updateShopProfile` is a full-replace writer (its `links`/`address`/`website` come solely from the form, defaulting to empty), Save re-sends the current values so nothing is wiped. `manage.ts` is unchanged (threat model T-07-14).
- **One logo writer preserved.** Logo/branding continues through the shared `BrandingEditForm`/`saveCompanyProfile`; PresentBanner only opens it via a callback and never touches `logo_path`.
- **Inline expand, not absolute overlay.** The InfoBox grows inline with a solid-white + `z-30` open state rather than an absolute overlay — this keeps the editable description textarea single-instance while still guaranteeing the expanded panel paints above the 3D cards (asserted via computed z-index in the E2E).

## Deviations from Plan

### Alignment (no user decision needed)

**1. [Process — parallel execution] ShopView.tsx sync ritual handled by the orchestrator's phase lock**
- The plan's Task 2 asks for a `muskan.md` lock-then-release on `ShopView.tsx`. Per the executor's `<parallel_execution>` contract, the orchestrator holds the phase-level lock and I must NOT edit `docs/team/sync/muskan.md`. Left `muskan.md` untouched to avoid clobbering the orchestrator's write. No behavior impact.

**2. [Rule 1 — bug prevention] Round-trip links/address/website on Save**
- `updateShopProfile` nulls any field it reads but the form omits, and rebuilds `metadata.links` solely from the form. A naive in-place Save (name/tagline/description/warehouse only) would silently wipe the seller's links/address/website. Fix: the Save FormData re-sends the current `company.links`/`address`/`website`. Verified they survive a Save. Files: `src/app/present/ShopView.tsx` — commit `70b9004`.

**3. [Re-scope, per plan] present-mode button assertion → 07-06**
- The old `present-banner` scaffold asserted a "Fullscreen"/present-mode button. Present mode (in-app chrome-hide) is 07-06, so that case is a `test.fixme` pointer here and the banner spec now covers the UX-06 controls + dirty-Save. Matches the plan's `<read_first>` re-scope note.

**4. [Test infra, not committed] Worktree dev server + gitignored .env.local**
- The shared `:3000` server belongs to another checkout serving pre-Phase-7 code, so the E2E ran against a worktree-local `npm run dev` on `:3200` (baseURL override via a temp, uncommitted config; deleted after). Copied main's gitignored LOCAL `.env.local` in to reach local Supabase. Same posture as 07-02/07-04. No committed change.

## Known Stubs / Interim
- **Link management is display-only** (add/remove/reorder links deferred to Phase 16 per the scope fence). Links still render and are preserved on Save — this is an intentional phase boundary, not a blocking stub. The chrome is otherwise fully editable in place (banner name/tagline/cover, description, warehouse line, logo/branding).

## Threat Surface
- **T-07-13 (edit another company's profile):** mitigated — Save routes through `updateShopProfile`, which resolves the company from the session (no id param) under `company_update` RLS.
- **T-07-14 (second logo/links writer):** mitigated — one-writer rule intact; logo/branding via `BrandingEditForm` only, links round-tripped unchanged, `manage.ts` untouched.
- **T-07-15 (oversized cover upload):** mitigated — client-side type + 10 MB guard before the client-direct upload, plus the server-side `shop-media` bucket limits.
- No new endpoints, schema, packages, or auth paths. No new threat flags.

## User Setup Required
None. No new packages, no migrations, no external service config. (`.env.local` was copied locally for E2E only — gitignored, not committed. The Phase-7 cloud migration push remains batched per the ledger.)

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint` (all four touched source files + both specs) — clean.
- `npx playwright test e2e/present-banner.spec.ts e2e/present-info.spec.ts` — **7 passed, 1 skipped** (the 07-06 present-mode fixme).
- `npx playwright test e2e/present-grid.spec.ts` — **2/2 green** (no regression from the ShopView chrome rewrite).
- Grep gates: `dirty` in SaveBar; `aspect-[4/1]` in PresentBanner; both "Add products" + "Manage shop" literal in PresentBanner; `stopPropagation` + `2600` in InfoBox; `updateShopProfile` + `BrandingEditForm` in ShopView; no `logo_path` writer added.

_Note: the E2E ran on a worktree dev server (`:3200`); the banner dirty-Save case does not persist (it only edits a field to flip `data-dirty`), and none of these read-mode cases mutate the seed._

## Next Phase Readiness
- The Present chrome (banner + info + sticky Save) is reusable for **07-06 present mode** (which hides the chrome) and the buyer view.
- Per-shop link management + structured multi-warehouse addresses remain **Phase 16**; a live Sella figure remains legal-gated.
- Cloud migration push for the Phase-7 batch is still outstanding (ledger) before any cloud Present use.

## Self-Check: PASSED

---
*Phase: 07-present-catalogue-ux*
*Completed: 2026-07-06*
