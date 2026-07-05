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

---

## DEV-99 #3 — Two-level business taxonomy (design 2026-07-03)
**Status:** 📐 designed (brainstormed w/ Muskan) · replaces flat `company_type` single-level select

### Decision summary
- Two **independent**, both-multi-select levels: **Business Category** (sector) + **Business Activities** (supply-chain role). Independent (not nested) so the platform can expand past cannabis to Food/Automotive/etc. without re-modelling.
- **Both required** at onboarding (≥1 each). "Other" activity is the escape hatch.
- Schema shape = **two separate lookup tables** (research-backed — avoids the OTLT/"one true lookup table" anti-pattern; each level gets DB-enforced domain integrity). Sources: ITPro Today + TDAN lookup-table articles.
- **Custom category** (prototype iteration 2026-07-03): Business Category includes a `custom` option → user types a free-text label stored **on the assignment row** (`custom_label`), required when `custom` is picked. Lookup stays clean; the text is private per-company (no shared-table pollution / dedup / moderation). ⚠️ **Extends beyond Marcel's fixed 5 categories — flag to Marcel on DEV-99.**
- **UI decided via prototype** (`prototypes/onboarding-taxonomy-prototype/`): **dropdown multiselects** (not chips), MVP `Field` styling, Custom reveals an **inline** free-text box *inside* the panel (no closing to type). Validate **on submit**.

### Taxonomy (Marcel, DEV-99 #3 — source of truth)
- **Category (5):** Pharma · Food · FMCG/CPG · Automotive · Services
- **Activity (8):** Pharmacy · Wholesaler · Importer · GACP Cultivator · EU-GMP Cultivator · TGA-GMP Cultivator · Manufacturer Pharma · Other

### Schema
- **Reuse** `company_type` (= Activity) + `company_type_assignment` — grow rows 4→8. No rename.
- **NEW** `business_category` lookup + `company_business_category` junction — mirror the existing pair exactly (soft-delete, unique-active index, same RLS: public lookup read via the lookup-read loop; assignment insert requires `company_id = current_company_id()` → copy the `cta_all` policy verbatim as `cbc_all`).
- `business_category` seeds **6 rows**: pharma, food, fmcg_cpg, automotive, services, **custom**.
- `company_business_category` adds a nullable `custom_label TEXT` column — free-text for the `custom` code. **CHECK**: `custom_label` non-null/non-empty **iff** `business_category_code = 'custom'` (define the invalid state out of existence).

### Data migration (rule-based, idempotent) — new stamp `20260703…` (avoid Ayush collision)
1. Add 5 new activity codes; keep wholesaler/importer/pharmacy.
2. Re-point `cultivator` assignments → `eu_gmp_cultivator`, then drop `cultivator` lookup row.
3. Insert 6 category rows (incl. `custom`).
4. Backfill every company that has an activity with a **Pharma** category.
5. Update `seed.sql` to new codes.

### RPC
- `onboard_company` gains `p_category_codes text[]` (looped like `p_type_codes`, same tx + ordering trap) **and** `p_custom_category text default null` (the `custom` row's label). Guards ≥1 of each; if `'custom'` in categories, require non-empty `p_custom_category`. Re-emit the **full latest body** (`create or replace`; latest lives in `…phase12_pathb_followups.sql`).

### UI (`OnboardingStepper.tsx`) — decided in prototype
- Company step gains **two dropdown-multiselects** (built on `<details>` + checkboxes, MVP `Field` styling): Business Category + Business Activities. Both required, validate **on submit**.
- **Custom** is the last Category option; ticking it reveals an **inline** free-text input *inside the panel* (typing keeps the dropdown open). Its value → `custom_label`.
- Two state sets + custom-label state. Server `page.tsx` fetches both lookups (`.from('business_category')…`) and passes them. `actions.ts`: `formData.getAll('category_codes')` + `custom_category` → RPC args. New small reusable **`MultiSelect`** control.

### Testing (TDD)
- Migration probe: cultivator remapped, no orphan FK, category backfill, `custom_label` CHECK rejects bad states.
- RPC test: categories + custom_label persist; ≥1-each + custom-needs-label guards fire.
- UI test (`renderToStaticMarkup`): both dropdowns render; submit validation blocks empties.

### Task checklist
- [x] Ayush sync check — idle, no locks (2026-07-03). Persist-time lock still TODO (worktree/parallel-session; do from the branch that owns `claude/muskan/work`).
- [x] Prototype the onboarding UI (`prototypes/onboarding-taxonomy-prototype/`) — dropdowns + inline custom + eye-in-box
- [x] Migration `20260704090000_business_category_taxonomy.sql` — TDD red→green, **verified in a rolled-back txn** (non-destructive). Bug caught by test: untyped `NULL::uuid`.
- [x] Extend `onboard_company` RPC (categories + custom_label) — dropped old 3-arg, added 5-arg; TDD red→green (rolled back).
- [ ] Regenerate `database.types.ts` (after persistent apply)
- [ ] `MultiSelect` control + rework `OnboardingStepper.tsx` company step — Vitest (no Docker)
- [ ] `page.tsx` fetch `business_category` + `actions.ts` pass category_codes/custom_category
- [x] `PasswordField` (eye) → login/signup/reset — TDD green (2/2), typecheck + lint clean. Stable `aria-label` + `aria-pressed` (a11y).
- [ ] Update `seed.sql` to new codes (required for `db reset` to stay green)
- [ ] Persistent apply (`supabase migration up`) + cloud ledger — deferred, coordinate sessions
- [ ] Flag "added Custom beyond Marcel's 5" on DEV-99

**Verified SQL tests:** `supabase/tests/business_category_taxonomy_test.sql` + `onboard_company_categories_test.sql` (+ runners). Green when run over the applied migration; today proven via `BEGIN … ROLLBACK`.

### Separate (belongs to 1b-auth-screens): show-password eye
- Reusable client `PasswordField` = MVP `Field` box + eye **inside** on the right. Semantic `<button>`, stable `aria-label` (Show/Hide) + `aria-pressed`, keyboard-operable. `Field` (`AuthCard.tsx`) is currently stateless/server-safe → extract a client variant. Icons from `lucide-react` (already a dep). Drop into login / signup / reset-password.
