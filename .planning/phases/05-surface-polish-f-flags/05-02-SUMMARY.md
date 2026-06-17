---
phase: 05-surface-polish-f-flags
plan: 02
subsystem: present
tags: [toggle-error, carousel, lint, shopview, f13, f2]
dependency_graph:
  requires: []
  provides: [POLISH-04, POLISH-05]
  affects: [src/app/present/ShopView.tsx]
tech_stack:
  added: []
  patterns: [no-throw ManageResult error handling, inline Embla effect handler]
key_files:
  modified: [src/app/present/ShopView.tsx]
  created: []
decisions:
  - "Use boxed text-rose-600 (L671 analog) not text-danger for ProductCard toggle errors — text-danger does not exist in ShopView"
  - "Inline onSelect handler inside useEffect instead of useCallback to resolve exhaustive-deps without eslint-disable"
metrics:
  duration: ~12 minutes
  completed: 2026-06-17
  tasks_completed: 2
  tasks_total: 2
---

# Phase 05 Plan 02: ShopView Toggle Errors + Carousel Lint Fix Summary

**One-liner:** Inline error state per ProductCard for failed visibility/price toggles (F13) and restructured Embla carousel effect to clear exhaustive-deps lint without eslint-disable (F2).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | F13 — surface toggle errors in ProductCard | 679cfb2 | src/app/present/ShopView.tsx |
| 2 | F2 — restructure Embla carousel useEffect | 795a165 | src/app/present/ShopView.tsx |

## What Was Built

### Task 1: F13 — Toggle Error Feedback (POLISH-04)

Added per-card error state to `ProductCard` in `ShopView.tsx`:

- `const [error, setError] = useState<string | null>(null)` alongside the existing `busy` state
- Both `togglePrice` and `toggleVisible` now: call `setError(null)` first (clear-on-retry), capture the server action result, check `"error" in res`, and call `setError(res.error)` + early return on failure
- Error renders as a boxed `<p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600 mx-3 mb-3">` after the toggle button row
- No try/catch (actions are no-throw `ManageResult`), no toast, no global state — flat in-card patch

### Task 2: F2 — Carousel Lint Fix (POLISH-05)

Restructured the `ProductGallery` Embla carousel effect in `ShopView.tsx`:

- Replaced `const onSelect = useCallback(...) + useEffect(... [emblaApi, onSelect])` pair with a single `useEffect` defining `onSelect` inline
- Handler is now local to the effect body, so the dep array is exhaustive at `[emblaApi]` with no `eslint-disable`
- Removed `useCallback` from the React import on L11 (no remaining usages)
- The sibling `reInit` effect (`[emblaApi, images.length]`) is unchanged

## Deviations from Plan

None — plan executed exactly as written.

The pre-existing `{/* eslint-disable-next-line @next/next/no-img-element */}` JSX comments (4 total, all pre-existing) were not touched. The plan verification filter `grep -vn '//' | grep -c "eslint-disable"` returns 2 (both pre-existing JSX-style comments, not introduced by this plan). No new suppressions were added.

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced. Changes are client-side only:
- F13 renders only the `res.error` string the server action already chose to return (curated `ManageResult` message, no raw stack/exception detail)
- F2 is a pure lint/refactor with no behavior or boundary change

## Self-Check: PASSED

- [x] `src/app/present/ShopView.tsx` modified (worktree confirmed)
- [x] Commit 679cfb2 exists (feat F13)
- [x] Commit 795a165 exists (fix F2)
- [x] `npx eslint src/app/present/ShopView.tsx` exits 0 (verified)
- [x] `npx tsc --noEmit` reports no new ShopView errors (verified)
- [x] `"error" in res` at L734 + L743 (F13)
- [x] `useCallback` count = 0 (F2, import removed)
- [x] No `eslint-disable` added (count unchanged at 4 pre-existing)
