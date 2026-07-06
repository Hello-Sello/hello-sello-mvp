---
phase: 07-present-catalogue-ux
plan: 06
subsystem: present-ui
tags: [react, nextjs, typescript, tailwind, present, present-mode, playwright]

# Dependency graph
requires:
  - phase: 07-present-catalogue-ux (plan 05)
    provides: PresentBanner (4:1 MVP banner + banner-mounted controls) + ShopView edit state
  - phase: 07-present-catalogue-ux (plan 04)
    provides: ShopView grouped square grid + ProductCard (the shop content present mode wraps)
provides:
  - in-app "Present mode" (a `presenting` UI state that hides the app chrome so the shop fills the app window — Zoom/Teams-shareable, NOT the OS Fullscreen API)
  - Exit control + ESC handler restoring normal chrome; reduced-motion-gated fade-in
  - company chip (banner logo + name) linking to /present (own shop, DEV-127)
  - present-mode E2E (chrome-occlusion + Exit/ESC restore + chip navigation)
affects: [buyer-present-view, phase-16-shops-locations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "In-app 'present' mode = a self-contained fixed inset-0 layer that COVERS the app chrome (opaque PAGE_BG mirroring the body gradient) — no OS Fullscreen API, no shared AppShell/globals.css edit"
    - "Assert visual occlusion (not DOM removal) in Playwright via document.elementFromPoint — a covered element does NOT flip toBeVisible(), so hit-testing the chrome's own box proves the layer sits on top"
    - "Reusable LogoTile shared by the editable-banner and the chip (Link) variants so the two stay pixel-identical"

key-files:
  created:
    - e2e/present-mode.spec.ts
  modified:
    - src/app/present/ShopView.tsx
    - src/app/present/PresentBanner.tsx
    - e2e/present-banner.spec.ts

key-decisions:
  - "Present mode is an in-app `presenting` UI state (D-07), realized as a self-contained fixed full-window layer in ShopView that covers the chrome — deliberately NOT element.requestFullscreen() (cuts off, not cleanly Zoom-shareable). No shared-file edit needed."
  - "The present layer paints an opaque PAGE_BG (the body gradient, duplicated inline) because an opaque cover is what hides the still-mounted chrome; the plan's preferred self-contained approach over a shared `presenting` signal AppShell reads."
  - "Entering present mode clears edit mode first (matches the prototype's setPresent → setEdit(false)); the SaveBar only renders while editing, so the two states never coexist."
  - "The company chip is the banner logo + name wrapped in a Next <Link href=/present> only when NOT editing (in edit mode those become in-place inputs)."

patterns-established:
  - "present-mode chrome-hide layer + elementFromPoint occlusion assertion are reusable for the buyer view and any future full-window present surface"

requirements-completed: [UX-06]

# Metrics
duration: ~75min
completed: 2026-07-05
---

# Phase 7 Plan 06: In-App Present Mode + Company Chip Summary

**Closes the Present redesign's interaction layer: an in-app "Present mode" that hides the app chrome so the shop fills the app window and stays Zoom/Teams-shareable (a `presenting` UI state + a self-contained full-window cover layer — explicitly NOT the OS Fullscreen API), an Exit control + ESC handler that restore the chrome, and the top-right company logo/name chip that opens your own Present page (DEV-127) — all covered by a new present-mode E2E that asserts real visual occlusion.**

## Performance
- **Duration:** ~75 min (incl. root-causing the pre-existing present-manage rename flake)
- **Completed:** 2026-07-05
- **Tasks:** 3 (2 `type=auto` executed + committed; 1 `checkpoint:human-verify` — approved, scoped)
- **Files:** 4 changed (1 created, 3 modified) in one commit

## Accomplishments
- **In-app Present mode (DEV-119).** Added a `presenting` state to `ShopView`. When on, the same shop surface is wrapped in a `fixed inset-0 z-40 overflow-auto` layer (below the z-50 AddProductsDrawer) that **covers** the IconRail + TopBar and fills the app window. The layer paints an opaque `PAGE_BG` (mirroring the `globals.css` body gradient) so the still-mounted chrome is hidden behind it. A fixed **"Exit present"** button (top-right) and an **ESC** handler (listener attached only while presenting) return to normal chrome. Entrance fade (`0.18s ease-out`, opacity only) is gated behind `prefers-reduced-motion: no-preference` (D-09). **No `requestFullscreen`** anywhere in the present surface (grep-verified — only design-note comments mention it).
- **"Present mode" control** in `PresentBanner` (ScreenShare icon), shown when `!editing`; the whole banner control row is hidden while presenting so the shared window stays clean. Entering present mode clears edit mode first, so present and edit never coexist.
- **Company chip (DEV-127).** The banner logo + company name is a `Link href="/present"` (own shop) when not editing; extracted a shared `LogoTile` so the chip and the editable-banner variants stay pixel-identical.
- **`e2e/present-mode.spec.ts` (created, 3 cases green).** Asserts (1) the Present-mode control exists and entering it **visually occludes** the TopBar (`header`) and IconRail (`aside`) — proven via `document.elementFromPoint` (a covered element does not flip `toBeVisible`), while a `product-card` stays visible; (2) **Exit** and **ESC** both remove the layer and un-occlude the chrome; (3) the **company chip** has `href="/present"` and navigating keeps `/present`.
- **Enabled the 07-05 fixme.** The present-mode `test.fixme` pointer in `present-banner.spec.ts` is now a real assertion (the Present-mode button lives in the banner).

## Task Commits
1. **Task 1: present mode (chrome-hide) + company chip + present-mode E2E** — `04e9b85` (feat)
2. **Task 2: phase capstone verification** — no committable code (verification only; findings logged to the gitignored `deferred-items.md`)

## Files Created/Modified
- `e2e/present-mode.spec.ts` — chrome-occlusion + Exit/ESC restore + chip navigation (created)
- `src/app/present/ShopView.tsx` — `presenting` state, full-window cover layer, Exit + ESC, `PAGE_BG`, reduced-motion fade
- `src/app/present/PresentBanner.tsx` — "Present mode" control + company chip `Link` + shared `LogoTile`; control row hidden while presenting
- `e2e/present-banner.spec.ts` — the 07-05 present-mode fixme enabled (button now in banner)

## Decisions Made
- **In-app state, not the Fullscreen API.** Present mode is a `presenting` UI state rendered as a self-contained full-window cover layer, deliberately NOT `element.requestFullscreen()` (which cuts off and is not cleanly Zoom-shareable) — the D-07 lock. Self-contained in ShopView so no AppShell/globals.css shared-file edit was needed.
- **Opaque cover over shared signal.** The layer paints the body gradient (duplicated inline as `PAGE_BG`) to hide the still-mounted chrome — the plan's preferred self-contained approach over a shared `presenting` signal that AppShell reads (which would have required the sync ritual on AppShell.tsx).
- **Occlusion, asserted honestly.** Because the chrome stays in the DOM (just covered), `toBeVisible()` cannot detect the hide; the E2E uses `document.elementFromPoint` over the chrome's own box to prove the present layer is on top.

## Deviations from Plan

### Alignment (no user decision needed)
**1. [Process — parallel execution] ShopView.tsx sync ritual handled by the orchestrator's phase lock**
- The plan's Task 1 asks for a `muskan.md` lock-then-release on `ShopView.tsx`. Per the executor's `<parallel_execution>` contract the orchestrator holds the phase-level lock and I must NOT edit `docs/team/sync/muskan.md`. Left it untouched. No behavior impact.

**2. [Scope — out of scope, deferred] present-manage rename E2E flake NOT fixed here**
- Task 2's capstone found `present-manage.spec.ts` "seller renames a product (persists)" red (5/6). This is a **pre-existing 07-04 spec flake, not a 07-06 regression** — 07-06 never touches the rename path (`ProductCard.saveName` → `manage.ts renameProduct` → `page.tsx`). The feature is proven correct: the renamed row is committed in the DB, and a **fresh browser context** renders the new name immediately; only the **same tab that performed the save** shows a stale post-reload render (not eventual consistency, not a server bug). Hit the 3-attempt fix limit (unique-name guard, `expect.toPass` reload-retry, cache-busting nav — none resolved it), so per the scope-boundary rule I reverted 07-04's spec to pristine and logged full analysis + a recommended fix (assert in a fresh `browser.newContext()`) to `deferred-items.md`. `supabase db reset` was NOT run (correctly denied — shared across parallel worktrees).

**3. [Scope, per coordinator] Card/banner fidelity rework is a separate re-plan**
- The Task 3 human-verify surfaced broader card/banner fidelity items (Muskan). Per the coordinator these are handled as **separate new plans F-01/F-02/F-03** and are explicitly NOT part of 07-06. The present-mode + company-chip deliverable was verified good and kept; no banner-button or card changes were made here.

## Known Stubs / Interim
None for this plan's surface. (The broader card/banner fidelity items are a separate re-plan, not stubs in the present-mode work.)

## Threat Surface
- **T-07-16 (present mode exposing seller-only data on a shared screen):** mitigated — present mode renders the same own-shop content (`/present` = `getMyShop`); no buyer/asymmetric data path introduced.
- **T-07-17 (OS fullscreen cutting off shared content):** mitigated — in-app `presenting` cover layer, NOT `requestFullscreen` (grep-verified). Zoom-shareable window.
- **T-07-SC (npm installs):** N/A — no new packages.
- No new endpoints, schema, packages, or auth paths. No new threat flags.

## User Setup Required
None. No new packages, migrations, or external config. (`.env.local` was copied into the worktree for the local E2E only — gitignored, not committed. The Phase-7 cloud migration push remains batched per the ledger.)

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint` (both touched source files) — clean.
- `npx vitest run` — **111 passed** (15 files).
- `npx playwright test present-mode` — **3 passed**; `present-grid` + `present-banner` + `present-info` + `present-mode` together — **13 passed** (in-scope surface green).
- `present-basket.spec.ts` + `present-buyer.spec.ts` remain `test.fixme` (Phase 17 / deferred) — grep-confirmed.
- `present-manage.spec.ts` — 5/6; the rename case is a documented pre-existing flake (see Deviation 2 / `deferred-items.md`), feature verified working via DB + fresh-context render.
- Grep gates: `presenting` + `Escape` in ShopView; `/present` chip link + `present-banner` testid in PresentBanner; **no `requestFullscreen` call** in `src/app/present` or `src/modules/catalog`.

_E2E ran against a worktree-local `next dev` on :3210 (the shared :3000 may serve another checkout), via an uncommitted temp Playwright config (deleted after) — same posture as 07-04/07-05._

## Next Phase Readiness
- Present mode + the company chip complete the Present redesign's **interaction** layer. The chrome-hide layer + occlusion-assertion pattern are reusable for the buyer view.
- **Card/banner visual fidelity is a separate re-plan (F-01/F-02/F-03)** — not carried here.
- Cloud migration push for the Phase-7 batch remains outstanding (ledger) before any cloud Present use.

## Self-Check: PASSED

---
*Phase: 07-present-catalogue-ux*
*Completed: 2026-07-05*
