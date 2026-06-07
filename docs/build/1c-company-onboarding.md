# 1c — Company onboarding (setup · license · verification)
**Status:** 🔨 WIP · **Size:** M · **Owner:** Muskan

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

## Decisions for Muskan (scope-lock) — see chat
1. Path A only (defer B)?  2. Demo-minimal vs full gated flow?  3. Include `/admin/verifications`?  4. Modal-sequence vs simple step pages?

## Task checklist
_(locks on approval)_

## Done criteria
_(locks on approval)_
