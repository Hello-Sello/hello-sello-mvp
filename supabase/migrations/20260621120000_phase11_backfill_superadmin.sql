-- ============================================================================
-- Phase 11 (11-03, Task 2) — Backfill Superadmin group/grants for existing companies
-- ----------------------------------------------------------------------------
-- Companies created before RBAC enforcement have no Superadmin group, so their
-- founders would have ZERO permissions the instant has_permission() goes live
-- (can't manage team, can't edit branding). This one-time data migration seeds
-- each pre-existing company exactly as onboarding now does (D-02 / RESEARCH §5).
--
-- Rules (threat model):
--   • Founder = company.created_by ONLY. Never guessed (T-11-06 Elevation-of-
--     Privilege: guessing a founder could promote the wrong person). A company
--     with a NULL created_by is SKIPPED and surfaced via RAISE NOTICE so a
--     headless company is visible, never silently left or mis-seeded.
--   • Idempotent (T-11-08): only companies lacking an active Superadmin group are
--     touched, and seed_company_superadmin() is itself idempotent (reuses the
--     active group, ON CONFLICT on membership + grants). Safe to re-run / re-reset.
--
-- Uses the SECURITY DEFINER seed_company_superadmin() helper from plan 02 — the
-- §9 lockdown removed authenticated's direct write path to person_group / pme, so
-- a plain INSERT here would be rejected; the definer helper bypasses RLS.
-- ============================================================================

DO $$
DECLARE
  v_company  record;
  v_seeded   integer := 0;
  v_skipped  integer := 0;
BEGIN
  FOR v_company IN
    SELECT c.id, c.name, c.created_by
    FROM public.company c
    WHERE c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public."group" g
        WHERE g.company_id = c.id
          AND g.name = 'Superadmin'
          AND g.deleted_at IS NULL
      )
  LOOP
    IF v_company.created_by IS NULL THEN
      -- Headless: no founder to seed. Skip + flag (never guess — T-11-06).
      RAISE NOTICE 'phase11 backfill: SKIPPED company % (%) — created_by IS NULL (headless, needs manual founder assignment)',
        v_company.id, v_company.name;
      v_skipped := v_skipped + 1;
    ELSE
      PERFORM public.seed_company_superadmin(v_company.id, v_company.created_by);
      v_seeded := v_seeded + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'phase11 backfill complete: % companies seeded as Superadmin, % skipped (NULL created_by)',
    v_seeded, v_skipped;
END;
$$;
