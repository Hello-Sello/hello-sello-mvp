-- ============================================================================
-- relationship_admin_suspend_end_test.sql
-- ----------------------------------------------------------------------------
-- Proves HEL-82's suspend/reactivate/end surface: an HS team member (and ONLY
-- an HS team member) can transition a relationship through
-- active -> suspended -> active, and separately active/suspended -> ended
-- (terminal — no RPC can move it back out). Also proves `relationship` itself
-- gained NO read broadening — an earlier draft of 20260825170000 added
-- `OR is_hs_team()` to `rel_all`'s USING; review found the page that would
-- have needed it (`/connect/relationship/[id]`) is unreachable by a
-- companyless HS account regardless (it sits behind `requireVerified()`), so
-- that broadening was dropped in favour of `list_relationships_admin()` — a
-- SECURITY DEFINER RPC on its own `/admin/relationships` route, same shape as
-- `list_pending_verifications()`. §A proves both halves of that: the base
-- table stayed narrow, and the RPC is the real (fail-safe) door.
--
-- Run:  bash supabase/tests/run_relationship_admin_suspend_end_test.sh
--
-- Fixture (seeded): Rheinland Apotheke <-> GreenLeaf Cultivation. Clara Vogt
-- (dynamic uid) is at Rheinland; Alice Green (fixed 1111...) is at GreenLeaf —
-- both real relationship members, neither HS team. Bob (fixed 2222...) is the
-- established stranger fixture (a real person, member of a DIFFERENT
-- relationship — has a company, just not this one; not companyless).
-- The seeded HS reviewer
-- is fixed at 9999...9999 (supabase/seed/seed.sql:203-208).
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033) — every status
-- flip below is rolled back at the end, so the fixture relationship is back
-- to 'active' for any suite that runs after this one.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT r.id                                            AS rel_id,
       r.company_a_id                                  AS ca,
       r.company_b_id                                  AS cb,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
       '11111111-1111-1111-1111-111111111111'::uuid    AS alice,
       '22222222-2222-2222-2222-222222222222'::uuid    AS bob,
       '99999999-9999-9999-9999-999999999999'::uuid    AS hsteam
  FROM public.relationship r
  JOIN public.company ca ON ca.id = r.company_a_id
  JOIN public.company cb ON cb.id = r.company_b_id
 WHERE (ca.name LIKE 'Rheinland%' AND cb.name LIKE 'GreenLeaf%')
    OR (ca.name LIKE 'GreenLeaf%' AND cb.name LIKE 'Rheinland%')
 LIMIT 1;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _t) THEN
    RAISE EXCEPTION 'FIXTURE: no Rheinland<->GreenLeaf relationship — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hs_team_member WHERE person_id = (SELECT hsteam FROM _t) AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'FIXTURE: seeded HS reviewer row missing — seed drift';
  END IF;
END $$;

-- ============================================================================
-- §A — READ DOOR: list_relationships_admin() is HS-team-only, `relationship`
--      itself stays exactly as narrow as before this ticket (no RLS change).
-- ============================================================================

-- A1 — `relationship` is still NOT directly readable to a non-member,
--      non-HS caller (proves the base table was never broadened).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) THEN
    RAISE EXCEPTION 'A1/base-table: a stranger could read a relationship they are not a party to via the base table';
  END IF;
END $$;
RESET ROLE;

-- A2 — list_relationships_admin() DOES surface it to HS team, via the RPC
--      only — the fail-safe `and public.is_hs_team()` predicate, not RLS.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.list_relationships_admin() WHERE id = (SELECT rel_id FROM _t)) THEN
    RAISE EXCEPTION 'A2/rpc: HS team could not see the relationship via list_relationships_admin()';
  END IF;
END $$;
RESET ROLE;

-- A3 — the SAME RPC returns 0 rows for a non-HS caller (fail-safe by
--      construction, same shape as list_pending_verifications).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_relationships_admin()) THEN
    RAISE EXCEPTION 'A3/fail-safe: list_relationships_admin() returned rows for a non-HS caller';
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — SUSPEND is HS-team-only.
-- ============================================================================

-- B1 — a real company member (Alice, GreenLeaf side) cannot suspend her own
--      relationship — this is an operator transition, not company self-service.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.suspend_relationship((SELECT rel_id FROM _t), 'B1 attempt');
    RAISE EXCEPTION 'B1/member: a relationship member was allowed to suspend their own relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B1/member%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%forbidden%' THEN
        RAISE EXCEPTION 'B1/member: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- B2 — a stranger (Bob) cannot suspend it either.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', bob, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.suspend_relationship((SELECT rel_id FROM _t), 'B2 attempt');
    RAISE EXCEPTION 'B2/stranger: a stranger was allowed to suspend a relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B2/stranger%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%forbidden%' THEN
        RAISE EXCEPTION 'B2/stranger: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- B3 — HS team CAN suspend it: status flips, and one audit_log row lands per
--      company (both sides get the same event in their own trail).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _t), 'B3: licence lapsed');
RESET ROLE;
DO $$
DECLARE v_status text; v_audit_rows int;
BEGIN
  SELECT status INTO v_status FROM public.relationship WHERE id = (SELECT rel_id FROM _t);
  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'B3/suspend: status is % after suspend_relationship, expected suspended', v_status;
  END IF;
  SELECT count(*) INTO v_audit_rows FROM public.audit_log
   WHERE content_type = 'relationship' AND content_id = (SELECT rel_id FROM _t)
     AND action = 'relationship.suspended';
  IF v_audit_rows <> 2 THEN
    RAISE EXCEPTION 'B3/audit: expected 2 audit_log rows (one per company), got %', v_audit_rows;
  END IF;
END $$;

-- ============================================================================
-- §C — the guard rejects an out-of-state transition, correctly (not silently).
-- ============================================================================

-- C1 — suspending an ALREADY-suspended relationship is refused, not a silent no-op.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.suspend_relationship((SELECT rel_id FROM _t), 'C1 double-suspend');
    RAISE EXCEPTION 'C1/guard: suspend_relationship succeeded on an already-suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'C1/guard%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%not active or not found%' THEN
        RAISE EXCEPTION 'C1/guard: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — REACTIVATE: suspended -> active, HS-team-only, and only from suspended.
-- ============================================================================

-- D1 — a non-HS caller cannot reactivate.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reactivate_relationship((SELECT rel_id FROM _t));
    RAISE EXCEPTION 'D1/member: a relationship member was allowed to reactivate';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'D1/member%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%forbidden%' THEN
        RAISE EXCEPTION 'D1/member: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- D2 — HS team reactivates, WITH a reason: status flips back to active and
--      the reason is stored (the first draft accepted no reason param at all
--      and the UI's textarea silently discarded it — critic finding 9).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _t), 'D2: licence renewed');
RESET ROLE;
DO $$
DECLARE v_status text; v_reason_rows int;
BEGIN
  SELECT status INTO v_status FROM public.relationship WHERE id = (SELECT rel_id FROM _t);
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'D2/reactivate: status is % after reactivate_relationship, expected active', v_status;
  END IF;
  SELECT count(*) INTO v_reason_rows FROM public.audit_log
   WHERE content_type = 'relationship' AND content_id = (SELECT rel_id FROM _t)
     AND action = 'relationship.reactivated' AND reason = 'D2: licence renewed';
  IF v_reason_rows <> 2 THEN
    RAISE EXCEPTION 'D2/reason: expected 2 audit_log rows carrying the reason, got %', v_reason_rows;
  END IF;
END $$;

-- D3 — reactivating an ACTIVE relationship (not suspended) is refused.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reactivate_relationship((SELECT rel_id FROM _t));
    RAISE EXCEPTION 'D3/guard: reactivate_relationship succeeded on an already-active relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'D3/guard%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%not suspended or not found%' THEN
        RAISE EXCEPTION 'D3/guard: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — END is terminal: no RPC transitions a relationship back out of 'ended'.
-- ============================================================================

-- E1 — HS team ends the (currently active) relationship.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.end_relationship((SELECT rel_id FROM _t), 'E1: business closed');
RESET ROLE;
DO $$
DECLARE v_status text; v_audit_rows int;
BEGIN
  SELECT status INTO v_status FROM public.relationship WHERE id = (SELECT rel_id FROM _t);
  IF v_status <> 'ended' THEN
    RAISE EXCEPTION 'E1/end: status is % after end_relationship, expected ended', v_status;
  END IF;
  SELECT count(*) INTO v_audit_rows FROM public.audit_log
   WHERE content_type = 'relationship' AND content_id = (SELECT rel_id FROM _t)
     AND action = 'relationship.ended';
  IF v_audit_rows <> 2 THEN
    RAISE EXCEPTION 'E1/audit: expected 2 audit_log rows (one per company), got %', v_audit_rows;
  END IF;
END $$;

-- E2 — reactivate CANNOT pull it back from 'ended' — is_terminal means terminal.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.reactivate_relationship((SELECT rel_id FROM _t));
    RAISE EXCEPTION 'E2/terminal: reactivate_relationship pulled a relationship back out of ended';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'E2/terminal%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%not suspended or not found%' THEN
        RAISE EXCEPTION 'E2/terminal: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- E3 — ending an already-ended relationship is refused, not a silent no-op.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.end_relationship((SELECT rel_id FROM _t), 'E3 double-end');
    RAISE EXCEPTION 'E3/guard: end_relationship succeeded on an already-ended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'E3/guard%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%already ended or not found%' THEN
        RAISE EXCEPTION 'E3/guard: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'relationship admin suspend/end: ALL CELLS PASSED (A1-A3, B1-B3, C1, D1-D3, E1-E3)'; END $$;

ROLLBACK;
