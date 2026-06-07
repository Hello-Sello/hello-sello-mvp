# 1c — Company onboarding (setup · license · verification)
**Status:** 🧪 built + verified (pending commit/merge) · **Size:** M · **Owner:** Muskan

## Goal
The flow a freshly-signed-up (company-less) user walks to create their company, upload a
license, and enter the platform in a "verification pending" state. Replaces the `/onboarding`
placeholder from 1b. **In-app → light theme.** Demo uses seed (pre-verified) companies, so this
is a real build but not on the June-11 demo path.

## Research notes (sources: DECISIONS.md 2026-05-25 locks · prototype `phase-1-onboarding` · SCHEMA-DRAFT)
- **Flow (locked 2026-05-25):** after signup → **"Existing or new company?"** question → **Path A**
  (new company → HS-team review) or **Path B** (join existing → that company's Superadmin approves).
- **Path B is deferred** (coded-but-unexercised in v0 — per Path-B deferral lock). **v0 ships Path A.**
- **Company setup (Path A):** name + country + **business-category multi-select** (`company_type` +
  `company_type_assignment`; NOT a buy/sell role) + **license upload REQUIRED** (`company_license_file`
  → Supabase Storage **private bucket**; PDF/JPG/PNG/HEIC; multi-file via "add another"; optional description).
- **After submit:** `company.verification_status = 'pending'`. **Split-gate:** internal setup allowed
  while pending; external actions (Connect/Discover/deals) hard-locked until HS-team verifies. Persistent
  verification banner until verified.
- **Group setup:** lightweight templates (4 default groups) + **Skip**; full matrix lives in Settings (out of onboarding).
- **HS verification surface:** `/admin/verifications` (hard-coded HS-team `person_id` allowlist) — approve → `verified`; reject → reason emailed + resubmit.
- **Pattern (locked):** modal-sequence, each step skippable, + a checklist on Home.
- **Schema is ready:** `company`, `company_license_file`, `company_type(+assignment)`, `company_verification_status` all exist (Phase 1). **Infra gap:** the Supabase Storage private bucket + its RLS likely needs creating.

## Scope — LOCKED 2026-06-08
**Build:** the 5 Path-A screens for real (real rows + real Storage upload), land in `pending` + banner.
**Cut (additive follow-ups, off demo path):** split-gate enforcement across surfaces · `/admin/verifications` HS approval surface · Path B.
**UI:** modal-sequence stepper, each step skippable, + checklist on Home. **Theme:** light.
- Decisions (chat): 1. Path A only ✓ (Path-B deferral lock). 2. Real Path-A slice, no enforcement/admin ✓. 3. No `/admin/verifications` ✓. 4. Modal-sequence ✓.

## Key findings (orientation)
- **All tables already exist** (Phase-1 migrations) — `company` (`verification_status` default `'pending'`), `company_license_file`, `company_type` (4 seeds), `company_type_assignment`, `company_verification_status` (pending/verified/rejected), `group`, `person` (`company_id` nullable). **No new tables, no column changes.**
- **RLS ordering trap:** `company` INSERT allowed only when `current_company_id() IS NULL`; `company_type_assignment` / `company_license_file` INSERT require `company_id = current_company_id()` — i.e. `person.company_id` must already be linked. → forces order: create company → link person → then children. Loose sequential calls risk orphan companies on partial failure.
- **Infra gap (confirmed):** zero Storage buckets exist (`list_storage_buckets` → `[]`).

## Task checklist
- [ ] **Migration** `…_onboarding.sql` (additive; no tables touched):
  - [ ] private bucket `company-licenses` (20 MB, pdf/jpg/png/heic) + `storage.objects` RLS (own-company folder write/read/delete; HS read)
  - [ ] `onboard_company(p_name, p_country, p_type_codes[])` — `SECURITY INVOKER`, one tx: insert company (`created_by=auth.uid()`) → link `person.company_id` → insert type assignments → return id. RLS stays enforced; ordering hidden.
  - [ ] apply to remote · regenerate `database.types.ts`
- [ ] **Stepper** at `/onboarding` (modal-sequence, client): step0 existing/new (A active · B disabled) → step1 company → step2 license (required, multi-file) → step3 groups (4 templates · Skip)
- [ ] **Server action** `onboardCompany`: RPC → Storage upload → `company_license_file` rows → groups → redirect `/home`
- [ ] **Home**: `pending` verification banner + onboarding checklist card (keeps 1c out of AppShell)

## Done criteria
- Fresh signup → stepper → company created, license in bucket, lands `/home` with pending banner. Rows verified in DB + file in bucket. typecheck + lint clean. Path-B invariants intact (nullable `company_id`, one accessor). Status → ✅.

## Verification (2026-06-08) — all via REAL JWT (signed-up user Nadia, since file-input automation isn't available)
- **typecheck** clean · **lint** clean for 1c files (pre-existing `Wordmark.tsx` error is Ayush's 1A, untouched).
- **Bug found + fixed during verify:** `onboard_company` originally used `INSERT … RETURNING id`. Under RLS, `RETURNING` runs the `company_select` policy (`id = current_company_id() OR is_hs_team()`) on the brand-new row — but the caller isn't linked to it yet, so the row is invisible → insert rejected ("violates RLS policy"). Confirmed real via the live JWT path (not a harness quirk). **Fix:** pre-generate the company id (`gen_random_uuid()`) and INSERT without RETURNING; no shared RLS changed. → candidate ARCHITECTURE-NOTES entry (bites any create-then-link flow).
- **RPC** (real JWT, company-less user): 200 → company born `pending`, person linked, categories `[cultivator,wholesaler]`. `already_has_company` guard intact.
- **Storage RLS** (real JWT): own folder upload 200 · other company's folder 400 (denied) · delete own 200.
- **Home**: renders real pending banner + checklist (company/categories/licence ✓, awaiting verification ⧗).
- Test artifacts (Nadia + Nordic Greens AS + file) cleaned up — 0 left.

## Known follow-ups (additive, out of v0 scope)
- **Audit gap:** onboarding writes (company/group create) are NOT audited — foundation seeds no `company.created`/`group.created` action code, and no content-type for license/type-assignment rows. Add seeds + `writeAudit` (or a DB trigger on `company` INSERT) later.
- **Cut from scope (per lock):** split-gate enforcement across surfaces · `/admin/verifications` · Path B.
