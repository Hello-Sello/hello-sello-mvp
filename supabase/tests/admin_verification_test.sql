-- ============================================================================
-- admin_verification_test.sql — VERIF-04 + VERIF-05 invariant proof
-- ----------------------------------------------------------------------------
-- Proves the admin verification RPCs enforce correct audit rows (VERIF-04) and
-- that the RLS/grant doors are properly locked (VERIF-05):
--
--   • VERIF-04: approve_company → one audit row with action='company.verify_approved',
--               actor_type='hs_team', actor_person_id=reviewer, company_id=reviewed,
--               created_at non-null, entry_hash non-null (chain intact).
--               reject_company → one audit row with action='company.verify_rejected',
--               reason=supplied text, metadata->>'preset' = supplied preset code.
--   • VERIF-05 (RLS/grant door):
--               has_function_privilege('anon', 'approve_company(uuid)', 'EXECUTE') = false
--               A non-HS authenticated caller calling list_pending_verifications()
--               returns 0 rows.
--
-- Mirrors cross_tenant_lockdown_test.sql: one BEGIN…ROLLBACK transaction,
-- ephemeral fixtures, role impersonation via set_config('request.jwt.claims', …)
-- + SET LOCAL ROLE, RAISE EXCEPTION on any failed assertion, RESET ROLE between
-- perspectives. A success RAISE NOTICE prints at the end.
--
-- Run:  bash supabase/tests/run_admin_verification_test.sh
--
-- ⚠️  RED-FIRST (Wave-0): this file is EXPECTED to FAIL against today's schema —
-- the RPCs list_pending_verifications(), approve_company(uuid), and
-- reject_company(uuid, text, text) do NOT exist yet. That failure is the proof
-- this test genuinely exercises the real doors. It goes GREEN in 03-02/03-03,
-- after the SECURITY DEFINER RPCs and their grants land. Do NOT "fix" it green
-- here — keeping it RED is the purpose of this Wave-0 plan.
-- ============================================================================

BEGIN;

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- We use the seeded fixed UUIDs from seed.sql rather than INSERT-ing our own:
--   HS reviewer = 99999999-9999-9999-9999-999999999999  (hsteam@hello-sello.test)
--   PendingCo   = cccccccc-cccc-cccc-cccc-cccccccccccc  (PendingCo GmbH, pending)
--   Alice (non-HS) = 11111111-1111-1111-1111-111111111111 (alice@greenleaf.test)
--
-- Reset the pending company to 'pending' in-fixture in case a prior run left it
-- in a different state (only matters if ROLLBACK was somehow skipped previously).
UPDATE company
   SET verification_status = 'pending',
       verified_at = NULL,
       verified_by = NULL
 WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ── (1) VERIF-05 — grant door: anon must NOT hold EXECUTE on admin RPCs ──────
DO $$
BEGIN
  -- approve_company(uuid)
  IF has_function_privilege('anon', 'public.approve_company(uuid)', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on approve_company(uuid)'; END IF;
  -- reject_company(uuid, text, text)
  IF has_function_privilege('anon', 'public.reject_company(uuid,text,text)', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on reject_company(uuid,text,text)'; END IF;
  -- list_pending_verifications()
  IF has_function_privilege('anon', 'public.list_pending_verifications()', 'EXECUTE')
    THEN RAISE EXCEPTION 'LEAK: anon still GRANTed EXECUTE on list_pending_verifications()'; END IF;
END $$;

-- ── (2) VERIF-05 — non-HS authenticated caller gets 0 rows from list RPC ─────
-- Impersonate Alice (GreenLeaf, verified company member — but NOT hs_team_member).
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.list_pending_verifications()) <> 0
    THEN RAISE EXCEPTION 'LEAK: non-HS caller saw % rows via list_pending_verifications()',
      (SELECT count(*) FROM public.list_pending_verifications()); END IF;
END $$;
RESET ROLE;

-- ── (3) VERIF-04 — approve_company writes correct audit row ──────────────────
-- Impersonate the HS reviewer (hsteam@hello-sello.test, hs_team_member row exists).
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_audit_count   int;
  v_actor_type    text;
  v_actor_pid     uuid;
  v_company_id    uuid;
  v_action        text;
  v_created_at    timestamptz;
  v_entry_hash    bytea;
BEGIN
  -- Call the RPC (will FAIL RED until 03-02 lands — that is expected)
  PERFORM public.approve_company('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid);

  -- Assert exactly one audit row was written for this action on this company
  SELECT count(*) INTO v_audit_count
    FROM public.audit_log
   WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND action = 'company.verify_approved';

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'VERIF-04: expected 1 company.verify_approved audit row, got %', v_audit_count;
  END IF;

  -- Assert the audit row has correct actor attribution
  SELECT actor_type, actor_person_id, company_id, action, created_at, entry_hash
    INTO v_actor_type, v_actor_pid, v_company_id, v_action, v_created_at, v_entry_hash
    FROM public.audit_log
   WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND action = 'company.verify_approved';

  IF v_actor_type <> 'hs_team' THEN
    RAISE EXCEPTION 'VERIF-04: actor_type must be ''hs_team'', got ''%''', v_actor_type; END IF;
  IF v_actor_pid <> '99999999-9999-9999-9999-999999999999'::uuid THEN
    RAISE EXCEPTION 'VERIF-04: actor_person_id must be the HS reviewer UUID, got ''%''', v_actor_pid; END IF;
  IF v_company_id <> 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid THEN
    RAISE EXCEPTION 'VERIF-04: company_id must be the reviewed company, got ''%''', v_company_id; END IF;
  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'VERIF-04: created_at must be non-null (VERIF-04 timestamp requirement)'; END IF;
  IF v_entry_hash IS NULL THEN
    RAISE EXCEPTION 'VERIF-04: entry_hash must be non-null (hash chain must be intact)'; END IF;

  -- Assert company status was flipped to 'verified'
  IF (SELECT verification_status FROM public.company
       WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 'verified' THEN
    RAISE EXCEPTION 'VERIF-02: company verification_status must be ''verified'' after approve'; END IF;
END $$;
RESET ROLE;

-- ── (4) VERIF-04 — reject_company writes correct audit row with reason/preset ─
-- Reset the company back to 'pending' so reject can run on a fresh state.
UPDATE company
   SET verification_status = 'pending',
       verified_at = NULL,
       verified_by = NULL
 WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- Impersonate the HS reviewer again
SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
SELECT set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_audit_count   int;
  v_actor_type    text;
  v_actor_pid     uuid;
  v_company_id    uuid;
  v_reason        text;
  v_preset        text;
  v_created_at    timestamptz;
  v_entry_hash    bytea;
BEGIN
  -- Call the reject RPC (will FAIL RED until 03-02 lands)
  PERFORM public.reject_company(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'The submitted licence document is expired.',
    'licence_expired'
  );

  -- Assert exactly one audit row was written
  SELECT count(*) INTO v_audit_count
    FROM public.audit_log
   WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND action = 'company.verify_rejected';

  IF v_audit_count <> 1 THEN
    RAISE EXCEPTION 'VERIF-04: expected 1 company.verify_rejected audit row, got %', v_audit_count;
  END IF;

  -- Assert the audit row has correct fields
  SELECT actor_type, actor_person_id, company_id, reason, metadata->>'preset', created_at, entry_hash
    INTO v_actor_type, v_actor_pid, v_company_id, v_reason, v_preset, v_created_at, v_entry_hash
    FROM public.audit_log
   WHERE company_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
     AND action = 'company.verify_rejected';

  IF v_actor_type <> 'hs_team' THEN
    RAISE EXCEPTION 'VERIF-04: actor_type must be ''hs_team'', got ''%''', v_actor_type; END IF;
  IF v_actor_pid <> '99999999-9999-9999-9999-999999999999'::uuid THEN
    RAISE EXCEPTION 'VERIF-04: actor_person_id must be the HS reviewer UUID, got ''%''', v_actor_pid; END IF;
  IF v_reason <> 'The submitted licence document is expired.' THEN
    RAISE EXCEPTION 'VERIF-04: reason must match the supplied text, got ''%''', v_reason; END IF;
  IF v_preset <> 'licence_expired' THEN
    RAISE EXCEPTION 'VERIF-04: metadata->>''preset'' must be ''licence_expired'', got ''%''', v_preset; END IF;
  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'VERIF-04: created_at must be non-null (VERIF-04 timestamp requirement)'; END IF;
  IF v_entry_hash IS NULL THEN
    RAISE EXCEPTION 'VERIF-04: entry_hash must be non-null (hash chain must be intact)'; END IF;

  -- Assert company status was flipped to 'rejected'
  IF (SELECT verification_status FROM public.company
       WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc') <> 'rejected' THEN
    RAISE EXCEPTION 'VERIF-03: company verification_status must be ''rejected'' after reject'; END IF;
END $$;
RESET ROLE;

ROLLBACK;

SELECT 'ALL ADMIN VERIFICATION TESTS PASSED' AS result;
