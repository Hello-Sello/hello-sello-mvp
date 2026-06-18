---
phase: 06-discover-home-ux
plan: 01
subsystem: ui, database
tags: [supabase, next.js, server-actions, rls, revalidatepath, storage]

# Dependency graph
requires:
  - phase: 05-surface-polish-f-flags
    provides: F3 branding drift fix baseline, connect-scope RPC, ShopView with cover upload
provides:
  - company.city column (append-only migration)
  - list_discoverable_companies RPC extended with city in RETURNS TABLE + SELECT + GROUP BY
  - companies.updateCompanyProfile as the single writer for logo_path + city (D-07)
  - BrandingEditForm — shared branding-edit component (logo upload + city + text fields)
  - getCompanyChrome server reader for TopBar
  - TopBar wired to real logged-in company (name + logo, initials fallback)
  - saveCompanyProfile revalidates all six surfaces on branding write
affects:
  - 06-04 (Discover redesign — consumes city from DiscoverCompany)
  - 06-02, 06-03 (Home checklist, Wordmark — same wave)
  - 07 (Present redesign — BrandingEditForm already mounted in ShopView)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "client-direct logo upload to shop-media with stable path + upsert (copy of ShopView uploadSlot)"
    - "useEffect client-read pattern for TopBar (mirrors IconRail, required because AppShell is use client)"
    - "revalidatePath with 'page' type for dynamic routes, no type for literal paths"
    - "getCompanyChrome: 'use server' reader returning {name, logoUrl} — mirror of account-card.ts"

key-files:
  created:
    - src/app/present/BrandingEditForm.tsx
  modified:
    - supabase/migrations/20260618120000_company_city.sql
    - supabase/migrations/20260618120100_list_discoverable_companies_city.sql
    - src/types/database.types.ts
    - src/app/discover/companies.ts
    - src/modules/companies/index.ts
    - src/modules/catalog/manage.ts
    - src/app/account/AccountClient.tsx
    - src/app/account/actions.ts
    - src/app/present/ShopView.tsx
    - src/app/present/page.tsx
    - src/shared/ui/TopBar.tsx
    - docs/team/sync/muskan.md

key-decisions:
  - "D-07: companies.updateCompanyProfile is the single writer for logo_path + city; catalog/manage.ts no longer writes logo_path"
  - "D-09: Two edit doors (Present + Account) via ONE shared BrandingEditForm — same fields, same writer, no drift"
  - "D-08: TopBar uses useEffect client-read (not async server) because AppShell is use client"
  - "revalidatePath dynamic routes ('/discover/[id]', '/c/[handle]') require 'page' type arg — literal paths must not pass it"
  - "ShopView ProfileEditor split: cover + links save via updateShopProfile; branding saved via BrandingEditForm → saveCompanyProfile"

patterns-established:
  - "Shared form component (BrandingEditForm): mounted in two surfaces, calls one server action — prevents field/validation drift between doors"
  - "getCompanyChrome pattern: 'use server' reader that resolves storage public URL server-side, consumed via useEffect in client component"

requirements-completed: [UX-07, UX-01]

# Metrics
duration: 90min
completed: 2026-06-18
---

# Phase 6 Plan 01: Branding Data Spine + One-Writer Consolidation Summary

**company.city column added, logo/city/text branding consolidated to one writer via a shared BrandingEditForm mounted in Present and Account, TopBar wired to the real logged-in company with logo + initials fallback**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-06-18T12:00:00Z
- **Completed:** 2026-06-18T14:30:00Z
- **Tasks:** 4 (3 code + 1 verification)
- **Files modified:** 12

## Accomplishments
- `company.city` column added via append-only migration; directory RPC (drop + recreate) returns city in RETURNS TABLE, SELECT, and GROUP BY; DiscoverCompany type + mapper carry it through
- `updateCompanyProfile` is now the single writer for `logo_path` and `city`; `catalog/manage.ts` no longer writes `logo_path` (comment explains the D-07 contract)
- Shared `BrandingEditForm` mounted in both Account (company tab) and Present (edit drawer) — one component, one server action, no drift between doors (D-09)
- `saveCompanyProfile` revalidates all six surfaces (`/account`, `/present`, `/home`, `/discover`, `/discover/[id]`, `/c/[handle]`) so branding changes propagate without a hard reload (D-08)
- TopBar wired via `getCompanyChrome` server reader + `useEffect` client-read pattern — renders real company logo (img) or initials badge; "Aurora Deutschland GmbH" hardcoding removed (D-08)
- `supabase db reset` exits 0 — all migrations apply clean on a fresh local DB (Task 4 BLOCKING gate passed)

## Task Commits

1. **Task 1: City data spine — migrations, types hand-edit, mapper** - `c015f03` (feat) — committed by prior agent
2. **Task 2: One writer + shared BrandingEditForm + remove ShopView logo write** - `7d76bb9` (feat)
3. **Task 3: Branding propagation (revalidatePath) + TopBar real-company wiring** - `eb1a075` (feat)
4. **Task 4: Apply schema clean on local stack** - verified via `supabase db reset` (no code commit — verification only)

## Files Created/Modified
- `supabase/migrations/20260618120000_company_city.sql` — append-only `company.city text null` column
- `supabase/migrations/20260618120100_list_discoverable_companies_city.sql` — drop+recreate RPC adding city to RETURNS TABLE + SELECT + GROUP BY
- `src/types/database.types.ts` — hand-edit: city added to company Row/Insert/Update (not regenerated, F4)
- `src/app/discover/companies.ts` — Row type, DiscoverCompany type, mapper all carry city
- `src/modules/companies/index.ts` — CompanyFields + cols map: city + logoPath; getCompanyProfile selects them
- `src/modules/catalog/manage.ts` — logo_path write removed; cover_path stays (Phase 7 banner)
- `src/app/present/BrandingEditForm.tsx` — NEW: shared logo upload + city + text fields + save bar
- `src/app/account/AccountClient.tsx` — CompanyForm mounts BrandingEditForm
- `src/app/present/ShopView.tsx` — ProfileEditor: cover + links via updateShopProfile; BrandingEditForm for branding
- `src/app/present/page.tsx` — passes getCompanyProfile result to ShopView
- `src/app/account/actions.ts` — saveCompanyProfile: six revalidatePaths; new getCompanyChrome reader
- `src/shared/ui/TopBar.tsx` — useEffect client-read, renders real company name + logo, initials fallback

## Decisions Made

- **ProfileEditor split in ShopView:** cover banner + links save via `updateShopProfile` (ShopView's writer, keeps cover_path for Phase 7); logo + branding text fields save via `BrandingEditForm` → `saveCompanyProfile`. Two separate save bars in the edit view — avoids mixing ShopView's catalog fields with branding fields in a single FormData.
- **getCompanyChrome in actions.ts** (not a separate file): consistent with account-card.ts pattern of co-locating server readers with their related surface actions; the `'use server'` directive at file top covers it.
- **TopBar "…" loading state**: while chrome is null (loading), the badge shows "…" and the name is empty — avoids layout shift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] ProfileEditor restructure beyond minimal import**
- **Found during:** Task 2 (ShopView update)
- **Issue:** The previous agent had only added the BrandingEditForm import and prop to ShopView but did NOT restructure ProfileEditor — logo upload UI was still inline and `uploadSlot` still handled logo (writing via fd.set("logo_path") which is now silently ignored since manage.ts removed the write). The UI inconsistency would confuse users (two logo upload points; the inline one would silently fail to save).
- **Fix:** Restructured ProfileEditor to split into (1) cover + company-name + links form calling updateShopProfile; (2) BrandingEditForm panel for logo + city + text fields. Removed logo state, logoRef, pickLogo, and the logo upload UI from ProfileEditor. Cover upload retained.
- **Files modified:** src/app/present/ShopView.tsx
- **Verification:** Build green; grep confirms no `fd.set("logo_path")` in ShopView
- **Committed in:** 7d76bb9 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 — missing critical: logo UI was silently broken)
**Impact on plan:** Fix was essential for correct one-writer behavior. No scope creep.

## Issues Encountered
- Pre-existing lint errors in `src/modules/messaging/` (RichText.tsx `refs` rule, use-chat-realtime.ts `setState-in-effect` rule) — Ayush's module, out of scope per deviation rules. Filed as deferred. These are not caused by this plan's changes.

## Known Stubs
None — all fields wire to real data. TopBar "…" is a transient loading state, not a stub.

## Threat Flags

No new threat surface beyond what the plan's threat model covers. All T-06-01 through T-06-04 mitigations implemented:
- T-06-01: RLS `company_update` gates the UPDATE (existing policy, verified)
- T-06-02: BrandingEditForm validates ACCEPTED_IMAGE_TYPES + MAX_IMAGE_BYTES client-side
- T-06-03: updateCompanyProfile trims + `|| null` via the existing partial-patch loop
- T-06-04: logo_path write removed from manage.ts — confirmed via grep

## User Setup Required
None — no external services, no new env vars, no manual configuration required. Schema applied locally via `supabase db reset`. Cloud apply is deferred (per CLAUDE.md carry-over: LOCAL-first discipline; cloud apply behind a gated checkpoint + avatars policy reconcile).

## Next Phase Readiness
- `company.city` is in the DB and flows through the RPC → mapper → DiscoverCompany — ready for 06-04 Discover redesign to display "City, Country" in directory rows
- BrandingEditForm is the authoritative edit surface for logo/city/text branding — 06-02 Home checklist and 06-03 Wordmark can proceed in parallel
- TopBar is live: users see their own company logo + name across the app

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| BrandingEditForm.tsx exists | FOUND |
| TopBar.tsx exists | FOUND |
| actions.ts exists | FOUND |
| 06-01-SUMMARY.md exists | FOUND |
| Commit c015f03 (spine) | FOUND |
| Commit 7d76bb9 (one-writer) | FOUND |
| Commit eb1a075 (TopBar) | FOUND |
| patch.logo_path in manage.ts | 0 (correct) |
| "Aurora Deutschland GmbH" in TopBar | 0 (removed) |
| db reset exits 0 | PASS |
| npm run build exits 0 | PASS |

---
*Phase: 06-discover-home-ux*
*Completed: 2026-06-18*
