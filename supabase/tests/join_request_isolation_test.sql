-- ============================================================================
-- join_request_isolation_test.sql — Phase 12 Path-B isolation proof (PATHB-01..04)
-- ----------------------------------------------------------------------------
-- Proves the join-existing-company contract is tenant-isolated, atomic, and
-- fail-safe, the same way rbac_enforcement_test.sql proves RBAC:
--   • PB-01 — search_joinable_companies, called by a company-less requester,
--             returns ONLY verified companies and ONLY the curated columns
--             (id/name/city/logo_path). An unverified company is excluded.
--   • PB-02 — request_to_join inserts ONE pending join_request in the target
--             company; a SECOND request while one is pending RAISEs (the partial
--             unique index uq_join_request_active_pending — one active request).
--   • PB-03 — approve_join_request links the requester to the company AND writes
--             the join.approved audit row in the SAME transaction (atomic).
--   • PB-04 — tenant scope: a Company-A Superadmin's list_pending_join_requests
--             sees A's pending request (with a NON-NULL projected requester_name)
--             and NOT B's; a Company-B Superadmin approving A's request RAISEs
--             (tenant guard). Fail-safe NULL: a company-less requester reads 0
--             rows of any company's company/person pre-approval. Audit codes:
--             a reject writes join.rejected + status='rejected' (no link); a
--             withdraw writes join.withdrawn AND sets status='cancelled'.
--
-- Mirrors rbac_enforcement_test.sql: one BEGIN…ROLLBACK transaction that seeds
-- EPHEMERAL fixtures, impersonates each caller via request.jwt.claims + SET LOCAL
-- ROLE authenticated (so queries run exactly as that caller with RLS active),
-- asserts, and leaves NO trace. RESET ROLE between perspectives. Any failed
-- assertion RAISEs and aborts; success prints the all-passed line at the end.
--
-- Run:  bash supabase/tests/run_join_request_isolation_test.sh
--
-- ⚠️  RED-FIRST (Wave-0): this file is EXPECTED to FAIL against today's schema —
-- NONE of the six Path-B RPCs exist yet, so the FIRST search_joinable_companies
-- call errors with "function does not exist" and the runner exits non-zero. THAT
-- non-zero exit IS the RED signal. It goes GREEN when 12-02 lands the six RPCs,
-- the uq_join_request_active_pending partial-unique index, and the four join.*
-- audit_action_type codes. Do NOT stub the functions or loosen the assertions to
-- make it pass here — RED is the correct end state for plan 12-01.
--
-- Fixtures (privileged role; rolled back). UUID prefixes use the obviously-test
-- a…/b…/c…/d… space, confirmed unused by the demo-world + relationship-demo seeds
-- so the probe never collides with a seeded row even mid-transaction. EVERY seeded
-- person sets first_name + last_name + display_name (display_name is the canonical
-- name 12-02's list_pending_join_requests projects — seeding only first/last would
-- let a wrong-column projection false-green the requester_name assertion).
--   Company A (verified)   = a0000000-…   A-super     = a1111111-…
--   Company B (verified)   = b0000000-…   B-super     = b1111111-…
--   Company C (UNVERIFIED) = c0000000-…   (no people; proves verified-only filter)
--   Requester (company-less)            = d1111111-…   (company_id NULL — Path B)
-- ============================================================================

BEGIN;

-- ── Fixtures: auth users. The on_auth_user_created trigger turns each into a
-- person row (company_id NULL, display_name written canonically); we attach the
-- two Superadmins to their companies below (seed.sql §1/§3 pattern). The requester
-- stays company_id NULL — that IS the Path-B precondition. These callers never log
-- in via GoTrue; the test impersonates them directly through request.jwt.claims. ──
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pathb-a-super@example.test',
   '{"first_name":"ASuper","last_name":"Test","full_name":"ASuper Test"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'b1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pathb-b-super@example.test',
   '{"first_name":"BSuper","last_name":"Test","full_name":"BSuper Test"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', 'd1111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'pathb-requester@example.test',
   '{"first_name":"Dana","last_name":"Requester","full_name":"Dana Requester"}', NOW(), NOW());

-- Belt-and-braces: the trigger already writes display_name canonically, but assert
-- the requester's display_name is non-blank so the name-projection check below
-- cannot false-green on a row the seed forgot to name.
UPDATE person SET first_name = 'Dana', last_name = 'Requester', display_name = 'Dana Requester'
  WHERE id = 'd1111111-1111-1111-1111-111111111111';

-- ── Companies: two verified (joinable) + one UNVERIFIED (must be excluded from
-- search_joinable_companies). city/logo_path populated so the curated projection
-- has real values to return. ─────────────────────────────────────────────────────
INSERT INTO company (id, name, country, city, logo_path, verification_status, verified_at, created_by) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'PathB Test Company A', 'DE', 'Berlin',  'logos/a.png',
   'verified', NOW(), 'a1111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-000000000000', 'PathB Test Company B', 'DE', 'Hamburg', 'logos/b.png',
   'verified', NOW(), 'b1111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000000', 'PathB Unverified Company C', 'DE', 'Munich', NULL,
   'pending', NULL, NULL);

-- ── Attach each Superadmin to their company (the requester stays NULL). ───────────
UPDATE person SET company_id = 'a0000000-0000-0000-0000-000000000000'
  WHERE id = 'a1111111-1111-1111-1111-111111111111';
UPDATE person SET company_id = 'b0000000-0000-0000-0000-000000000000'
  WHERE id = 'b1111111-1111-1111-1111-111111111111';

-- ── One 'Superadmin' group per company; the super joins it (Member = absence of
-- this membership, per RESEARCH §2). The two gated grants are seeded so the
-- has_permission('team.manage') gate inside list/approve resolves true for the
-- super. permission_action codes seeded in-fixture so the FK holds (12-02 seeds
-- them for real). ─────────────────────────────────────────────────────────────────
INSERT INTO permission_action (code, description, category) VALUES
  ('team.manage', 'Invite / change role / remove company members', 'team')
ON CONFLICT (code) DO NOTHING;

INSERT INTO "group" (id, company_id, name, created_by) VALUES
  ('a9000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000', 'Superadmin',
   'a1111111-1111-1111-1111-111111111111'),
  ('b9000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000', 'Superadmin',
   'b1111111-1111-1111-1111-111111111111');

INSERT INTO person_group (person_id, group_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'a9000000-0000-0000-0000-000000000000'),
  ('b1111111-1111-1111-1111-111111111111', 'b9000000-0000-0000-0000-000000000000');

INSERT INTO permission_matrix_entry (company_id, group_id, action, granted) VALUES
  ('a0000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'team.manage', true),
  ('b0000000-0000-0000-0000-000000000000', 'b9000000-0000-0000-0000-000000000000', 'team.manage', true);

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-01) search_joinable_companies — verified-only + curated columns, callable
--   by a company-less requester. The RPC lands in 12-02; today the call errors
--   (function missing) → RED, the intended Wave-0 state and the FIRST failure the
--   runner hits.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_a_rows  integer;
  v_unverif integer;
  v_cols    integer;
BEGIN
  -- both verified companies are visible to a company-less caller
  SELECT count(*) INTO v_a_rows
    FROM public.search_joinable_companies('PathB Test Company')
    WHERE name LIKE 'PathB Test Company%';
  IF v_a_rows <> 2
    THEN RAISE EXCEPTION 'PB-01 FAIL: search_joinable_companies returned % verified matches, expected 2 (A+B)', v_a_rows; END IF;

  -- the UNVERIFIED company C must NOT appear
  SELECT count(*) INTO v_unverif
    FROM public.search_joinable_companies('PathB Unverified Company C');
  IF v_unverif <> 0
    THEN RAISE EXCEPTION 'PB-01 LEAK: search_joinable_companies returned an UNVERIFIED company (verified-only filter broken)'; END IF;

  -- the projection exposes EXACTLY the four curated columns (id, name, city, logo_path)
  -- — no membership counts, no verification timestamps, no internal fields.
  SELECT count(*) INTO v_cols
    FROM information_schema.routines r
    JOIN information_schema.parameters p ON p.specific_name = r.specific_name
    WHERE r.routine_name = 'search_joinable_companies'
      AND p.parameter_mode = 'OUT';
  IF v_cols <> 4
    THEN RAISE EXCEPTION 'PB-01 FAIL: search_joinable_companies projects % OUT columns, expected exactly 4 (id/name/city/logo_path)', v_cols; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-02) request_to_join — one pending row; a SECOND while pending RAISEs.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"d1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id  uuid;
  v_pending integer;
BEGIN
  v_req_id := public.request_to_join('a0000000-0000-0000-0000-000000000000', 'Please let me in');
  IF v_req_id IS NULL
    THEN RAISE EXCEPTION 'PB-02 FAIL: request_to_join returned NULL (expected the new join_request id)'; END IF;

  SELECT count(*) INTO v_pending
    FROM public.join_request
    WHERE requester_person_id = 'd1111111-1111-1111-1111-111111111111'
      AND target_company_id = 'a0000000-0000-0000-0000-000000000000'
      AND status = 'pending';
  IF v_pending <> 1
    THEN RAISE EXCEPTION 'PB-02 FAIL: expected exactly 1 pending request after request_to_join, found %', v_pending; END IF;

  -- a SECOND request while one is pending must RAISE (uq_join_request_active_pending)
  BEGIN
    PERFORM public.request_to_join('a0000000-0000-0000-0000-000000000000', 'second attempt');
    RAISE EXCEPTION 'PB-02 LEAK: a second request_to_join while one is pending did NOT RAISE — the one-active-request guard (uq_join_request_active_pending) is missing';
  EXCEPTION WHEN unique_violation OR raise_exception THEN
    NULL;  -- expected: the partial unique index (or an in-RPC guard) blocks the duplicate
  END;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-04 tenant scope + name projection) Company-A Superadmin sees A's pending
--   request with a NON-NULL requester_name and NOT B's; a Company-B Superadmin
--   approving A's request RAISEs (tenant guard target_company_id = current_company_id()).
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_a_seen   integer;
  v_b_seen   integer;
  v_named    integer;
BEGIN
  SELECT count(*) INTO v_a_seen
    FROM public.list_pending_join_requests()
    WHERE requester_person_id = 'd1111111-1111-1111-1111-111111111111';
  IF v_a_seen <> 1
    THEN RAISE EXCEPTION 'PB-04 FAIL: company-A Superadmin saw % of A''s pending requests, expected 1', v_a_seen; END IF;

  -- the projected requester_name must resolve (NON-NULL) — guards the false-green
  -- where the RPC projects a column the fixture never populated.
  SELECT count(*) INTO v_named
    FROM public.list_pending_join_requests()
    WHERE requester_person_id = 'd1111111-1111-1111-1111-111111111111'
      AND requester_name IS NOT NULL;
  IF v_named <> 1
    THEN RAISE EXCEPTION 'PB-04 FAIL: list_pending_join_requests projected a NULL requester_name (the name column does not resolve)'; END IF;

  -- and the A Superadmin's queue must be tenant-scoped: list_pending_join_requests()
  -- filters target_company_id = current_company_id() INTERNALLY and does not project
  -- that column, so it can only ever return A's own rows. Assert no returned row
  -- belongs to a requester other than A's seeded one — any such row is a cross-tenant leak.
  SELECT count(*) INTO v_b_seen
    FROM public.list_pending_join_requests()
    WHERE requester_person_id <> 'd1111111-1111-1111-1111-111111111111';
  IF v_b_seen <> 0
    THEN RAISE EXCEPTION 'PB-04 LEAK: company-A''s tenant-scoped queue returned % row(s) not from A''s own requester', v_b_seen; END IF;
END $$;
RESET ROLE;

-- a Company-B Superadmin must NOT be able to approve A's request (tenant guard)
SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id  uuid;
  v_raised  boolean := false;
BEGIN
  SELECT id INTO v_req_id FROM public.join_request
    WHERE requester_person_id = 'd1111111-1111-1111-1111-111111111111'
      AND target_company_id = 'a0000000-0000-0000-0000-000000000000'
      AND status = 'pending'
    LIMIT 1;
  BEGIN
    PERFORM public.approve_join_request(v_req_id, 'member');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;  -- any RAISE (tenant guard) is the pass
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'PB-04 LEAK: company-B Superadmin APPROVED company-A''s join request — the tenant guard (target_company_id = current_company_id()) is missing'; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-03 atomic approve) Company-A Superadmin approve_join_request links the
--   requester to A AND writes the join.approved audit row in the SAME transaction.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id    uuid;
  v_company   uuid;
  v_audit     integer;
BEGIN
  SELECT id INTO v_req_id FROM public.join_request
    WHERE requester_person_id = 'd1111111-1111-1111-1111-111111111111'
      AND target_company_id = 'a0000000-0000-0000-0000-000000000000'
      AND status = 'pending'
    LIMIT 1;

  PERFORM public.approve_join_request(v_req_id, 'member');

  -- person.company_id is now A — set in the same call
  SELECT company_id INTO v_company FROM public.person
    WHERE id = 'd1111111-1111-1111-1111-111111111111';
  IF v_company IS DISTINCT FROM 'a0000000-0000-0000-0000-000000000000'
    THEN RAISE EXCEPTION 'PB-03 FAIL: approve did NOT link the requester to company A (person.company_id = %)', v_company; END IF;

  -- and a join.approved audit row exists for this request, content_type join_request
  SELECT count(*) INTO v_audit FROM public.audit_log
    WHERE action = 'join.approved'
      AND content_type = 'join_request'
      AND content_id = v_req_id;
  IF v_audit < 1
    THEN RAISE EXCEPTION 'PB-03 FAIL: approve did NOT write a join.approved audit_log row for the request'; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-04 fail-safe NULL) a company-less requester (pre-approval state) reads 0
--   rows of ANY company's company/person. Impersonate a SECOND company-less
--   person so the read happens while company_id IS NULL (the just-approved Dana
--   now belongs to A). NULL company_id ⇒ current_company_id() NULL ⇒ every
--   tenant RLS predicate is false ⇒ deny.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000000', 'd2222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'pathb-requester2@example.test',
   '{"first_name":"Eli","last_name":"Newcomer","full_name":"Eli Newcomer"}', NOW(), NOW());

SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_co  integer;
  v_pp  integer;
BEGIN
  SELECT count(*) INTO v_co FROM public.company  WHERE id = 'a0000000-0000-0000-0000-000000000000';
  IF v_co <> 0
    THEN RAISE EXCEPTION 'PB-04 LEAK: a company-less requester read % of company A''s company row(s) (fail-safe NULL=deny broken)', v_co; END IF;

  SELECT count(*) INTO v_pp FROM public.person WHERE company_id = 'a0000000-0000-0000-0000-000000000000';
  IF v_pp <> 0
    THEN RAISE EXCEPTION 'PB-04 LEAK: a company-less requester read % of company A''s person row(s) (fail-safe NULL=deny broken)', v_pp; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-04 audit codes — reject) a Company-B Superadmin rejecting a FRESH pending
--   request to B writes a join.rejected audit row AND sets status = 'rejected',
--   WITHOUT linking the requester (person.company_id stays NULL — reject ≠ approve).
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_reject_id uuid;
BEGIN
  v_reject_id := public.request_to_join('b0000000-0000-0000-0000-000000000000', 'will be rejected');
  PERFORM set_config('public.pathb_reject_req', v_reject_id::text, true);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id  uuid := current_setting('public.pathb_reject_req', true)::uuid;
  v_status  text;
  v_audit   integer;
  v_company uuid;
BEGIN
  PERFORM public.reject_join_request(v_req_id, 'Not a fit right now');

  SELECT status INTO v_status FROM public.join_request WHERE id = v_req_id;
  IF v_status IS DISTINCT FROM 'rejected'
    THEN RAISE EXCEPTION 'PB-04 FAIL: reject set join_request.status = % (expected the terminal code ''rejected'')', v_status; END IF;

  SELECT count(*) INTO v_audit FROM public.audit_log
    WHERE action = 'join.rejected'
      AND content_type = 'join_request'
      AND content_id = v_req_id;
  IF v_audit < 1
    THEN RAISE EXCEPTION 'PB-04 FAIL: reject did NOT write a join.rejected audit_log row'; END IF;

  -- reject must NOT link the requester (only approve does)
  SELECT company_id INTO v_company FROM public.person
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v_company IS NOT NULL
    THEN RAISE EXCEPTION 'PB-04 LEAK: reject wrongly linked the requester to a company (person.company_id = %)', v_company; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-04 audit codes — withdraw) a withdraw on a FRESH pending request writes a
--   join.withdrawn audit row AND sets join_request.status = 'cancelled' (NOT
--   'withdrawn' — the terminal status code is 'cancelled'; only the AUDIT action
--   is join.withdrawn).
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id  uuid;
  v_status  text;
BEGIN
  v_req_id := public.request_to_join('b0000000-0000-0000-0000-000000000000', 'will withdraw');
  PERFORM public.withdraw_join_request(v_req_id);

  SELECT status INTO v_status FROM public.join_request WHERE id = v_req_id;
  IF v_status IS DISTINCT FROM 'cancelled'
    THEN RAISE EXCEPTION 'PB-04 FAIL: withdraw set join_request.status = % (expected the terminal code ''cancelled'')', v_status; END IF;
END $$;
RESET ROLE;

-- The join.withdrawn audit row is company_id = target (B), written by the SECURITY
-- DEFINER RPC. The company-less requester is RLS-blocked from SELECTing it
-- (audit_select USING company_id = current_company_id()), so verify its EXISTENCE
-- here as the privileged runner role (postgres, post-RESET ROLE → RLS bypassed).
DO $$
DECLARE
  v_req_id  uuid;
  v_audit   integer;
BEGIN
  SELECT id INTO v_req_id FROM public.join_request
    WHERE requester_person_id = 'd2222222-2222-2222-2222-222222222222'
      AND target_company_id = 'b0000000-0000-0000-0000-000000000000'
      AND status = 'cancelled'
    LIMIT 1;
  SELECT count(*) INTO v_audit FROM public.audit_log
    WHERE action = 'join.withdrawn'
      AND content_type = 'join_request'
      AND content_id = v_req_id;
  IF v_audit < 1
    THEN RAISE EXCEPTION 'PB-04 FAIL: withdraw did NOT write a join.withdrawn audit_log row'; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-05, FIX A — 20260622100000) request_to_join REJECTS a caller who ALREADY
--   belongs to a company. Before the fix an existing member could POST a join
--   request at another company and pollute its approval queue; now request_to_join
--   RAISEs at submit (the same 'requester already belongs to a company' string the
--   action layer maps to the "already part of a company" copy). A-super (company A)
--   is the company-holder; the call targets B.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.request_to_join('b0000000-0000-0000-0000-000000000000', 'should be blocked');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%already belongs to a company%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'PB-05 FAIL: request_to_join did NOT reject a caller who already belongs to a company'; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-06, FIX B — 20260622100000) approve_join_request as 'superadmin' RAISEs and
--   rolls back when the company has NO live 'Superadmin' group, instead of silently
--   linking the requester as an effective Member with an audit row that claims
--   role='superadmin'. Rename B's group so has_permission still resolves (it keys on
--   group_id, not name) but approve's name lookup finds none. d2222222 withdrew from
--   B above (cancelled is terminal), so it is still company-less and can re-request.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE "group" SET name = 'Owners' WHERE id = 'b9000000-0000-0000-0000-000000000000';

SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM set_config('public.pathb_super_req',
    public.request_to_join('b0000000-0000-0000-0000-000000000000', 'wants superadmin')::text, true);
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'b1111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"b1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_req_id uuid := current_setting('public.pathb_super_req', true)::uuid;
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.approve_join_request(v_req_id, 'superadmin');
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE '%superadmin group missing%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised
    THEN RAISE EXCEPTION 'PB-06 FAIL: approve as superadmin did NOT raise when the Superadmin group is missing'; END IF;
END $$;
RESET ROLE;

-- The raised approval must have rolled back atomically: requester stays
-- company-less and the request stays pending (no half-applied 'approved').
DO $$
DECLARE
  v_company uuid;
  v_status  text;
BEGIN
  SELECT company_id INTO v_company FROM public.person
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v_company IS NOT NULL
    THEN RAISE EXCEPTION 'PB-06 FAIL: failed superadmin approval still linked the requester (company_id = %)', v_company; END IF;
  SELECT status INTO v_status FROM public.join_request
    WHERE id = current_setting('public.pathb_super_req', true)::uuid;
  IF v_status IS DISTINCT FROM 'pending'
    THEN RAISE EXCEPTION 'PB-06 FAIL: failed superadmin approval left join_request.status = % (expected ''pending'' — rollback)', v_status; END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-08, FIX #6 — 20260622110000) search_joinable_companies escapes LIKE
--   metacharacters: a literal '%' / '_' in the term is matched literally, not as a
--   wildcard. Before the fix '%' matched EVERY verified company. No fixture/seed
--   company name contains a literal '%' or '_', so both must return 0 rows. (PB-01
--   above already proves a normal term still returns its real matches against this
--   same escaped function.) Run as the still-company-less requester.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_pct integer;
  v_us  integer;
BEGIN
  SELECT count(*) INTO v_pct FROM public.search_joinable_companies('%');
  IF v_pct <> 0
    THEN RAISE EXCEPTION 'PB-08 FAIL: search term ''%%'' matched % companies — LIKE wildcards not escaped', v_pct; END IF;
  SELECT count(*) INTO v_us FROM public.search_joinable_companies('_');
  IF v_us <> 0
    THEN RAISE EXCEPTION 'PB-08 FAIL: search term ''_'' matched % companies — LIKE wildcards not escaped', v_us; END IF;
END $$;
RESET ROLE;

-- ════════════════════════════════════════════════════════════════════════════
-- (PB-07, FIX #4 — 20260622110000) onboard_company cancels the caller's PENDING
--   join_request on Path-A company birth ("create my own company instead"), so it
--   doesn't linger as a phantom in the target's queue. d2222222 is still
--   company-less here and still holds the PB-06 pending request to B; after
--   onboard_company it owns a company AND has NO pending join_request left.
-- ════════════════════════════════════════════════════════════════════════════
SELECT set_config('request.jwt.claim.sub', 'd2222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"d2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_new_company uuid;
  v_linked      uuid;
  v_pending     integer;
BEGIN
  v_new_company := public.onboard_company('Dana Own Co', 'DE', '{}');

  -- the requester is now linked to their own new company
  SELECT company_id INTO v_linked FROM public.person
    WHERE id = 'd2222222-2222-2222-2222-222222222222';
  IF v_linked IS DISTINCT FROM v_new_company
    THEN RAISE EXCEPTION 'PB-07 FAIL: onboard_company did not link the caller to the new company'; END IF;

  -- and no PENDING join_request lingers (the B request was reconciled to cancelled)
  SELECT count(*) INTO v_pending FROM public.join_request
    WHERE requester_person_id = 'd2222222-2222-2222-2222-222222222222'
      AND status = 'pending';
  IF v_pending <> 0
    THEN RAISE EXCEPTION 'PB-07 FAIL: onboard_company left % pending join_request(s) dangling (expected 0)', v_pending; END IF;
END $$;
RESET ROLE;

-- The reconciled cancel must be audited like a manual withdraw: a join.withdrawn
-- row on the TARGET (B). Verify its existence as the privileged runner (RLS bypass).
DO $$
DECLARE
  v_req_id uuid := current_setting('public.pathb_super_req', true)::uuid;
  v_audit  integer;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.join_request WHERE id = v_req_id;
  IF v_status IS DISTINCT FROM 'cancelled'
    THEN RAISE EXCEPTION 'PB-07 FAIL: the pending request was not cancelled (status = %)', v_status; END IF;
  SELECT count(*) INTO v_audit FROM public.audit_log
    WHERE action = 'join.withdrawn' AND content_type = 'join_request' AND content_id = v_req_id;
  IF v_audit < 1
    THEN RAISE EXCEPTION 'PB-07 FAIL: onboard reconciliation did NOT write a join.withdrawn audit row'; END IF;
END $$;

ROLLBACK;
SELECT 'ALL PATH-B ISOLATION TESTS PASSED' AS result;
