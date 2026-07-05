---
phase: 07-present-catalogue-ux
plan: 03
subsystem: catalog
tags: [typescript, next, supabase, rls, vitest, catalog, present, server-actions, security]

# Dependency graph
requires:
  - phase: 07-present-catalogue-ux (plan 01)
    provides: product.location column, product_media table (video_link/coa/doc) + RLS, extended ShopProduct.media shape
provides:
  - renameProduct / softDeleteProduct / setProductLocation server actions
  - addProductMediaRecord / removeProductMedia / setProductMediaOrder (back-of-card media write side)
  - isAllowedVideoUrl / normalizeVideoUrl pure video-host allowlist validator
  - ProductMediaInput + MediaRemoveResult exported types
affects: [07-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure host-allowlist validator (mediaLinks.ts) beside the write action, unit-tested with no DB"
    - "Media write actions mirror the image-action convention exactly (session company, { ok } | { error }, path-recording only, revalidatePath)"
    - "Untrusted embed URL validated server-side before persistence (anchored suffix match, not substring)"

key-files:
  created:
    - src/modules/catalog/mediaLinks.ts
    - src/modules/catalog/mediaLinks.test.ts
  modified:
    - src/modules/catalog/manage.ts

key-decisions:
  - "Host match is by registrable domain (host === base || endsWith('.'+base)) so look-alikes (youtube.com.evil.com) fail — not a substring check"
  - "normalizeVideoUrl returns the trimmed validated string, not URL.href, to avoid surprise canonicalization; the action uses isAllowedVideoUrl directly (explicit gate)"
  - "removeProductMedia returns path: string | null (null for video_link) via a new MediaRemoveResult — video links have no bucket object to delete"
  - "softDeleteProduct stamps deleted_at (never hard delete); getMyShop already filters is-null so it drops from owner + public reads"

patterns-established:
  - "Discriminated-union media input (ProductMediaInput) keeps video_link.url and coa/doc.path mutually exclusive at the type level"

requirements-completed: [UX-04]

# Metrics
duration: ~10min
completed: 2026-07-05
---

# Phase 7 Plan 03: Owner Product + Media Write Actions Summary

**The owner write surface the redesigned Present card needs — rename, soft-delete, set-location, and back-of-card media create/remove/reorder — mirroring the proven image-action convention (session-resolved company, `{ ok } | { error }`, path-recording only), plus a tested video-link host allowlist so a pasted embed URL can't inject an arbitrary `<iframe src>`.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-07-05
- **Tasks:** 2 (Task 1 TDD allowlist validator, Task 2 manage.ts actions)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- Added a pure `isAllowedVideoUrl` / `normalizeVideoUrl` validator (TDD RED→GREEN, 8 cases) restricting video links to https URLs on youtube.com / youtu.be / vimeo.com / loom.com and their subdomains — rejecting foreign hosts, look-alikes, `javascript:`/`data:` schemes, and malformed input.
- Extended `manage.ts` with 6 owner actions: `renameProduct`, `softDeleteProduct` (stamps `deleted_at`), `setProductLocation`, `addProductMediaRecord` (host-validates video_link before insert), `removeProductMedia` (returns the storage path so the browser deletes the file), `setProductMediaOrder`.
- Every action is session-scoped via `getCurrentCompanyId()` (no `companyId` parameter) and leans on the product / product_media RLS — satisfying the T-07-06/07/08 mitigations from the threat register.
- Preserved the one-writer logo rule: no new code writes `logo_path` (the only two mentions are the existing one-writer comment note).

## Task Commits

1. **Task 1 (TDD): video-link host allowlist**
   - RED: failing allowlist test - `611bca5` (test)
   - GREEN: mediaLinks.ts validator - `2dc77a6` (feat)
2. **Task 2: manage.ts owner product + media edit actions** - `50d5f36` (feat)

_No REFACTOR commit — GREEN implementation was clean._

## Files Created/Modified
- `src/modules/catalog/mediaLinks.ts` - `isAllowedVideoUrl` + `normalizeVideoUrl` host allowlist (pure, no DB)
- `src/modules/catalog/mediaLinks.test.ts` - 8 vitest cases: allowed hosts, rejected/look-alike hosts, dangerous schemes, malformed input, normalize
- `src/modules/catalog/manage.ts` - +6 exported server actions, `ProductMediaInput` + `MediaRemoveResult` types, `isAllowedVideoUrl` import

## Decisions Made
- **Registrable-domain host match:** a host passes iff it equals a base domain or ends with `.<base>` — so `player.vimeo.com`/`www.youtube.com` pass while `youtube.com.evil.com` and `notyoutube.com` fail. A substring check would be an XSS hole.
- **Action calls `isAllowedVideoUrl` directly** (not `normalizeVideoUrl`) so the security gate is explicit at the call site and the persisted value is the plain trimmed URL — no surprise `URL.href` canonicalization.
- **`removeProductMedia` returns `path: string | null`** via a new `MediaRemoveResult`; a video_link has no bucket object, so the caller gets `null` and skips the storage delete — mirroring `removeProductImage`'s row-first/file-second contract.
- **Soft delete only:** `softDeleteProduct` stamps `deleted_at`; `getMyShop`'s existing `is("deleted_at", null)` filter makes it disappear from both owner and public reads without destroying the row or its media.

## Deviations from Plan

None - plan executed exactly as written.

## Verification
- `npx vitest run src/modules/catalog/mediaLinks.test.ts` — 8/8 green.
- `npx tsc --noEmit` — the catalog module is clean (0 errors). The only remaining tsc errors are in `src/app/present/locationFilter.test.ts`, which is **07-02's own RED contract** (per the 07-01 SUMMARY: "only 07-02's own RED locationFilter contract remains") — out of this plan's scope and owned by the parallel 07-02 executor.
- Grep gates: all 6 actions exported; `addProductMediaRecord` calls `isAllowedVideoUrl`; `softDeleteProduct` sets `deleted_at`; no action accepts a `companyId`; `logo_path` appears only in the pre-existing one-writer comment.

## Known Stubs
None — all actions are fully wired to `product` / `product_media`. Media bytes are uploaded client-direct by the 07-04 UI (by design, dodges the Server-Action body cap); these actions record path/url only, which is the intended contract, not a stub.

## User Setup Required
None. No new packages, no external service config. (The product_media table + PDF-widened bucket shipped in 07-01; cloud `supabase db push` for the Phase-7 migrations remains batched per the ledger, unchanged by this plan.)

## Next Phase Readiness
- 07-04 (MediaManager + edit affordances) has the full owner write surface: rename, delete, set-location, and media create/remove/reorder, all with the same `{ ok } | { error }` shape as the image actions.
- Video links are host-allowlisted server-side, so the 07-04 card can render a validated `url` into an embed without re-checking.

## Self-Check: PASSED

All 2 created files (`mediaLinks.ts`, `mediaLinks.test.ts`) exist on disk; `manage.ts` modified. All 3 task commits (611bca5, 2dc77a6, 50d5f36) present in git history.

---
*Phase: 07-present-catalogue-ux*
*Completed: 2026-07-05*
