-- ============================================================================
-- confirm_deal_change_workspace_gate_test.sql — HEL-85
-- ----------------------------------------------------------------------------
-- Proves: a relationship member who is NOT a `deal_member` cannot make
-- `confirm_deal_change` write into a PRIVATE deal workspace's chat thread.
--
-- Run:  bash supabase/tests/run_confirm_deal_change_workspace_gate_test.sh
--
-- ⚠️  RED-FIRST: §B fails against the pre-fix function. `confirm_deal_change`
-- checks only that the caller's company is one of the relationship's two
-- (`confirm_deal_change: caller is not a member of this relationship`) and then
-- announces into the deal thread. A SECURITY DEFINER bypasses RLS, so nothing
-- else stops it. Dana's decline lands in a private thread she cannot read.
-- That landing IS the reproduction.
--
-- ── THE MECHANISM, WHICH IS NOT SPECIFIC TO THIS FUNCTION ──
-- `can_access_workspace` (live body, production 2026-09-03) is:
--
--     deal_workspace w WHERE w.id = p_ws_id
--       AND public.card_relationship_member(w.deal_card_id)
--       AND (w.visibility = 'company_wide' OR public.is_workspace_member(w.id))
--
-- Two conjuncts. `confirm_deal_change` re-imports the FIRST and drops the
-- SECOND. On a `company_wide` workspace — the table's DEFAULT, and every
-- ordinary deal — the two are equivalent, which is exactly why this is easy to
-- miss and why it survived review. It diverges only once a workspace is
-- flipped `private`, and then the relationship-level check is strictly weaker.
--
-- `announce_deal_event` had the identical defect and it was live-proven
-- exploitable during HEL-84's post-build `security` re-check; the fix was to
-- call `can_access_workspace` directly. Its regression guard is
-- `announce_deal_event_test.sql` §G, whose fixture shape this file reuses
-- deliberately — same Dana, same private/company_wide flip — so the two suites
-- stay legible as one pattern rather than two coincidences.
--
-- ── WHY THE DECLINE ARM AND NOT THE ACCEPT ARM ──
-- `p_decision = 'decline'` announces unconditionally on a single call
-- (function body :92-121: log, two chat inserts, delete the pending row). The
-- accept arm needs BOTH companies' votes before it commits, so it would need a
-- second caller and would prove the same thing with more moving parts. The gap
-- is in the shared membership guard above both arms, so the cheaper arm is the
-- honest probe.
--
-- ── SCOPE THIS SUITE DOES NOT CLAIM ──
-- `sign_deal` was checked for the same shape and does NOT have it: it writes no
-- `chat_message` at all (`pg_proc` census, 2026-09-03). `confirm_detected_deal`
-- carries its own `deal_member` check already. This is the last instance.
--
-- ⚠️  EVERY MESSAGE COUNT IN THIS FILE IS TAKEN PRIVILEGED, NEVER AS THE PROBE
-- USER. This is not a style choice, it is the whole correctness of the suite.
-- An earlier draft counted `chat_message` rows from inside Dana's own session
-- and reported before=0 / after=0 on a write that HAD landed — because the very
-- RLS boundary under test (`can_access_thread`) also hides the resulting row
-- from her. The suite passed, vacuously, on a live exploit. A bypass cannot be
-- observed from inside the role being bypassed; the observer must sit outside
-- it. The `silent-pass` assertion below exists to catch exactly that mistake if
-- it is ever reintroduced (L-064: a cell must prove WHY it passed).
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                                    AS alice,
  (SELECT company_id FROM public.person WHERE id = a.id)  AS greenleaf,
  b.id                                                    AS bob,
  (SELECT company_id FROM public.person WHERE id = b.id)  AS stonepharm
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel_id
FROM public.relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

GRANT SELECT ON _fix, _rel TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1
    THEN RAISE EXCEPTION 'FIXTURE: Alice/GreenLeaf<->StonePharm relationship not found — seed drift'; END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'active'
    THEN RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — assert_relationship_writable would refuse for the wrong reason'; END IF;
END $$;

-- This suite's OWN card + workspace + deal thread, minted privileged (before
-- any SET LOCAL ROLE). Workspace defaults to 'company_wide'; §A uses it that
-- way and §B flips it 'private'.
CREATE TEMP TABLE _card (id uuid, deal_thread uuid, workspace uuid) ON COMMIT DROP;
WITH card AS (
  INSERT INTO public.deal_card (relationship_id, status, deal_type, initiating_company_id, currency)
  SELECT rel_id, 'negotiation', 'offer', f.greenleaf, 'EUR'
  FROM _rel, _fix f
  RETURNING id
),
ws AS (
  INSERT INTO public.deal_workspace (deal_card_id) SELECT card.id FROM card
  RETURNING id, deal_card_id
),
thread AS (
  INSERT INTO public.chat_thread (relationship_id, type, deal_card_id)
  SELECT (SELECT rel_id FROM _rel), 'deal', ws.deal_card_id FROM ws
  RETURNING id, deal_card_id
)
INSERT INTO _card SELECT thread.deal_card_id, thread.id, ws.id FROM thread, ws WHERE ws.deal_card_id = thread.deal_card_id;
GRANT SELECT ON _card TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _card) <> 1 OR (SELECT deal_thread FROM _card) IS NULL
     OR (SELECT workspace FROM _card) IS NULL
    THEN RAISE EXCEPTION 'FIXTURE: failed to mint this suite''s own deal_card + workspace + deal thread'; END IF;
END $$;

-- Dana: a GreenLeaf colleague. A relationship member by company, never a
-- `deal_member`. This is the exact population the gap exposes.
CREATE TEMP TABLE _dana ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'hel85-cdc-dana@example.test',
          '{"first_name":"Dana","last_name":"Colleague","full_name":"Dana Colleague"}', NOW(), NOW())
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _dana TO authenticated;
UPDATE public.person SET company_id = (SELECT greenleaf FROM _fix) WHERE id = (SELECT id FROM _dana);

DO $$
BEGIN
  IF (SELECT company_id FROM public.person WHERE id = (SELECT id FROM _dana)) IS DISTINCT FROM (SELECT greenleaf FROM _fix)
    THEN RAISE EXCEPTION 'FIXTURE: Dana is not at GreenLeaf — the relationship guard would refuse for the wrong reason, and §B would pass vacuously'; END IF;
  IF EXISTS (SELECT 1 FROM public.deal_member m
              WHERE m.deal_workspace_id = (SELECT workspace FROM _card)
                AND m.person_id = (SELECT id FROM _dana) AND m.removed_at IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: Dana is unexpectedly already a deal_member — the negative case cannot be tested'; END IF;
END $$;

-- A held change proposed by the OTHER side (StonePharm/Bob), so Dana declining
-- it is the natural counterparty action rather than a self-decline.
CREATE OR REPLACE FUNCTION pg_temp.hel85_arm_pending() RETURNS void
LANGUAGE sql AS $fn$
  INSERT INTO public.deal_pending_change
    (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
     proposer_reason, draft, votes)
  SELECT c.id, 1, 'manual', f.stonepharm, f.bob, 'HEL85 probe: proposed change',
         '{}'::jsonb, '{}'::jsonb
  FROM _card c, _fix f
  ON CONFLICT (deal_card_id) DO NOTHING;
$fn$;

-- The probe user writes her SQLERRM here so a privileged block outside her role
-- can read it back; she cannot be trusted to observe her own effect.
CREATE TEMP TABLE _probe (cell text PRIMARY KEY, err text) ON COMMIT DROP;
GRANT INSERT, SELECT ON _probe TO authenticated;
CREATE TEMP TABLE _obs (cell text, phase text, msgs int) ON COMMIT DROP;

-- Counts run as the connecting superuser, outside every RLS boundary.
CREATE FUNCTION pg_temp.observe(p_cell text, p_phase text) RETURNS void
LANGUAGE sql AS $fn$
  INSERT INTO _obs
  SELECT p_cell, p_phase, count(*) FROM public.chat_message
   WHERE thread_id = (SELECT deal_thread FROM _card);
$fn$;

CREATE FUNCTION pg_temp.delta(p_cell text) RETURNS int
LANGUAGE sql STABLE AS $fn$
  SELECT (SELECT msgs FROM _obs WHERE cell = p_cell AND phase = 'after')
       - (SELECT msgs FROM _obs WHERE cell = p_cell AND phase = 'before');
$fn$;

-- ============================================================================
-- §A — CONTROL, company_wide. Dana IS entitled here: `can_access_workspace`'s
--      second conjunct is satisfied by `visibility = 'company_wide'` without
--      any `deal_member` row. Her decline must land. If this cell fails, the
--      fix over-restricts and would break every ordinary deal in the product —
--      which is the failure mode that matters most, since company_wide is the
--      table DEFAULT.
-- ============================================================================
SELECT pg_temp.hel85_arm_pending();
SELECT pg_temp.observe('A', 'before');
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _dana), true);
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM _dana), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_deal_change((SELECT id FROM _card), 'decline', 'HEL85 A control decline');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _probe (cell, err) VALUES ('A', SQLERRM);
  END;
END $$;
RESET ROLE;
SELECT pg_temp.observe('A', 'after');
DO $$
BEGIN
  IF pg_temp.delta('A') <= 0 THEN
    RAISE EXCEPTION 'A/company-wide FAIL: a company_wide workspace refused a legitimate relationship member (delta=%, err=%) — the gate over-restricts and would break ordinary deals, which are company_wide by DEFAULT',
      pg_temp.delta('A'), coalesce((SELECT err FROM _probe WHERE cell='A'), '<none>');
  END IF;
END $$;

-- ============================================================================
-- §B — THE GATE. Same Dana, same call, workspace flipped PRIVATE. She is not a
--      `deal_member`, so `can_access_workspace` is FALSE for her — she cannot
--      even read this thread. Her decline must NOT land in it.
--      RED against the pre-fix function: the message lands.
-- ============================================================================
UPDATE public.deal_workspace SET visibility = 'private' WHERE id = (SELECT workspace FROM _card);

DO $$
BEGIN
  IF (SELECT visibility FROM public.deal_workspace WHERE id = (SELECT workspace FROM _card)) <> 'private'
    THEN RAISE EXCEPTION 'FIXTURE: the private flip did not take — §B would pass vacuously'; END IF;
END $$;

SELECT pg_temp.hel85_arm_pending();
SELECT pg_temp.observe('B', 'before');
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _dana), true);
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM _dana), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_deal_change((SELECT id FROM _card), 'decline', 'HEL85 B1 forged decline into a private workspace');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _probe (cell, err) VALUES ('B', SQLERRM);
  END;
END $$;
RESET ROLE;
SELECT pg_temp.observe('B', 'after');
DO $$
DECLARE v_err text := (SELECT err FROM _probe WHERE cell = 'B');
BEGIN
  IF pg_temp.delta('B') > 0 THEN
    RAISE EXCEPTION 'B1/private-workspace FAIL: Dana (a relationship member, NOT a deal_member) wrote % row(s) into a PRIVATE deal thread she cannot even read — confirm_deal_change re-imported only the relationship half of can_access_workspace', pg_temp.delta('B');
  END IF;
  IF v_err IS NULL THEN
    RAISE EXCEPTION 'B1/silent-pass: nothing landed AND nothing raised. The RPC neither wrote nor refused, so this cell is not evidence of a gate — find out what it actually did before trusting the green.';
  END IF;
  IF v_err NOT ILIKE '%workspace%' THEN
    RAISE EXCEPTION 'B1/wrong-reason: refused, but not by a workspace check (%) — a cell that passes by accident proves nothing', v_err;
  END IF;
END $$;

-- ============================================================================
-- §C — THE PRIVATE WORKSPACE'S OWN MEMBER IS UNHARMED. Making Dana a real
--      `deal_member` of the SAME private workspace must restore the write.
--      Without this cell §B could pass because the function is broken for
--      everyone on a private workspace, which is a different bug wearing the
--      same green.
-- ============================================================================
INSERT INTO public.deal_member (deal_workspace_id, person_id, role, added_by_person_id)
SELECT (SELECT workspace FROM _card), (SELECT id FROM _dana), 'member', (SELECT alice FROM _fix)
ON CONFLICT DO NOTHING;

SELECT pg_temp.hel85_arm_pending();
SELECT pg_temp.observe('C', 'before');
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _dana), true);
SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM _dana), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.confirm_deal_change((SELECT id FROM _card), 'decline', 'HEL85 C member decline');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _probe (cell, err) VALUES ('C', SQLERRM);
  END;
END $$;
RESET ROLE;
SELECT pg_temp.observe('C', 'after');
DO $$
BEGIN
  IF pg_temp.delta('C') <= 0 THEN
    RAISE EXCEPTION 'C/member FAIL: a genuine deal_member of the PRIVATE workspace was refused (delta=%, err=%) — the gate keys on something other than workspace membership, and §B would be passing for the wrong reason',
      pg_temp.delta('C'), coalesce((SELECT err FROM _probe WHERE cell='C'), '<none>');
  END IF;
END $$;

ROLLBACK;

\echo 'PASS — confirm_deal_change_workspace_gate_test.sql (HEL-85): the private deal workspace holds'
