-- ============================================================================
-- auth_gate_test.sql — AUTH-03 prerequisite invariant proof (Phase 4 / 04-01)
-- ----------------------------------------------------------------------------
-- Proves three invariants introduced by 20260617140000_auth04_revoked_status.sql:
--
--   (A) The `revoked` row exists in company_verification_status with is_terminal=TRUE.
--       AUTH-03 prerequisite: without this row, any UPDATE to verification_status='revoked'
--       throws an FK violation and cannot be tested or deployed.
--
--   (B) UPDATE-ing a company to verification_status='revoked' succeeds — no FK error.
--       Confirms the lookup row is present at the time the UPDATE runs.
--
--   (C) list_decided_verifications() returns the revoked company.
--       Confirms the Decided-tab filter was widened to include 'revoked' (RESEARCH A3).
--
-- ⚠️  GREEN AFTER MIGRATION APPLIED: this file goes GREEN when the 04-04 reset
-- applies 20260617140000_auth04_revoked_status.sql. Until then it is RED (the
-- 'revoked' lookup row does not exist and the function filter is unwidened).
-- That RED state is the purpose of this Wave-0 plan — do NOT "fix" it GREEN here.
--
-- Mirrors admin_verification_test.sql: one BEGIN…ROLLBACK transaction, seeded
-- UUIDs from seed.sql, RAISE EXCEPTION on failure, final SELECT success message.
--
-- Run:  bash supabase/tests/run_auth_gate_test.sql.sh
-- ============================================================================

BEGIN;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Use the seeded Alice GreenLeaf company (verified) as our revocation target.
-- All mutations are inside BEGIN…ROLLBACK so no seed row is permanently altered.
--
--   Alice company  = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa (GreenLeaf Cultivation, verified)
--   HS reviewer    = 99999999-9999-9999-9999-999999999999 (hsteam@hello-sello.test)

-- ── (A) 'revoked' lookup row must exist with is_terminal=TRUE ────────────────
DO $$
DECLARE
  v_code        text;
  v_is_terminal boolean;
BEGIN
  SELECT code, is_terminal
    INTO v_code, v_is_terminal
    FROM public.company_verification_status
   WHERE code = 'revoked';

  IF v_code IS NULL THEN
    RAISE EXCEPTION
      'AUTH-03 PREREQ: ''revoked'' row missing from company_verification_status — migration 20260617140000 not applied';
  END IF;

  IF NOT v_is_terminal THEN
    RAISE EXCEPTION
      'AUTH-03 PREREQ: ''revoked'' row exists but is_terminal=FALSE — expected TRUE';
  END IF;
END $$;

-- ── (B) UPDATE to verification_status=''revoked'' must not raise FK violation ─
DO $$
BEGIN
  -- Direct UPDATE (no revoke_company RPC in scope — this is the fixture path).
  UPDATE public.company
     SET verification_status = 'revoked'
   WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  -- Confirm the update was persisted inside this transaction
  IF (SELECT verification_status FROM public.company
       WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') <> 'revoked' THEN
    RAISE EXCEPTION
      'AUTH-03: expected verification_status=''revoked'' after UPDATE, got something else';
  END IF;
END $$;

-- ── (C) list_decided_verifications() must return the revoked company ──────────
-- Impersonate the HS reviewer so is_hs_team() returns TRUE (the fail-safe guard).
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*)
    INTO v_count
    FROM public.list_decided_verifications()
   WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
     AND verification_status = 'revoked';

  IF v_count < 1 THEN
    RAISE EXCEPTION
      'AUTH-03: list_decided_verifications() did not return the revoked company — filter not widened';
  END IF;
END $$;

RESET ROLE;

ROLLBACK;

SELECT 'ALL AUTH GATE TESTS PASSED' AS result;
