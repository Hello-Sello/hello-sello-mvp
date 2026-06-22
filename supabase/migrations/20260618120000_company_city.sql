-- Phase 6 · Plan 01 — company.city column (D-02)
-- Append-only; no default, no backfill. Mirrors 20260614140000 pattern.
-- City is displayed on the Discover directory row as "City, Country".
-- Captured via updateCompanyProfile (edit-form-only for v1; onboarding stays null).

alter table public.company
  add column if not exists city text null;
