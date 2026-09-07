-- ============================================================================
-- inbox_insert_receiver_gate_test.sql — HEL-75
-- ----------------------------------------------------------------------------
-- Proves: an authenticated person can no longer land a connection request on a
-- company that is soft-deleted or deactivated, while every request a real
-- browser session legitimately sends still inserts unchanged.
--
-- Run:  bash supabase/tests/run_inbox_insert_receiver_gate_test.sh
--
-- ⚠️  RED-FIRST, IN BOTH DIRECTIONS — this suite fails against two different
--     wrong implementations, which is why it is worth its length:
--
--   §B fails against the PRE-FIX policy. `inbox_insert`'s WITH CHECK constrains
--   only the sender, so the request is ACCEPTED. That acceptance IS the
--   reproduction of HEL-75.
--
--   §A4 fails against the fix THE TICKET SKETCHED. A bare
--   `EXISTS (SELECT 1 FROM public.company …)` inside a policy is evaluated as
--   the CALLING role and so obeys `company_select`, which shows `authenticated`
--   only its own company, HS-team rows, and companies it already shares a
--   connection with. A company you have never met is invisible, so the inline
--   form refuses the very request the product exists to send. Measured, not
--   reasoned: as Alice, a direct SELECT on `company` returns 5 of 6 rows and
--   PendingCo is the missing one. A4 is the cell that catches it.
--
-- ⚠️  §A IS THE REAL WORK OF THIS SUITE. Narrowing a WITH CHECK is easy to do
--     too widely, and every over-wide version still passes §B.
--
-- ⚠️  DRIVEN FROM `authenticated`, NEVER THROUGH A DEFINER (the ticket's own
--     final AC). `deliver_deal` and `accept_connection_request` are SECURITY
--     DEFINER and bypass RLS entirely; a test routed through them would pass no
--     matter what this policy said.
--
-- SCOPE PINNED HERE, from Muskan's ruling 2026-08-25: DELETED + DEACTIVATED
-- only. An unverified / re-verifying company stays reachable (A4). If that
-- ruling is ever revisited, A4 is the cell that must be changed deliberately
-- rather than discovered.
--
-- Shape: one BEGIN…ROLLBACK, ZERO net seed mutation (L-033 / HEL-73). The seed
-- has no deactivated or soft-deleted company, so this suite makes two inside the
-- transaction and rolls them back — no throwaway rows, no hard deletes, and
-- nothing for a later spec to trip over.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Rheinland, NordCanna and Bavaria are looked up by name, not hardcoded:
-- seed.sql's "5b" block creates them with gen_random_uuid() (unlike the fixed
-- Alice/GreenLeaf/Bob/StonePharm/PendingCo block), so a literal here would be
-- a fresh random miss on every single db reset.
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT '11111111-1111-1111-1111-111111111111'::uuid AS alice,      -- sender
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid AS greenleaf,  -- her company
       '22222222-2222-2222-2222-222222222222'::uuid AS bob,        -- a person receiver
       'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid AS stonepharm, -- live + verified
       (SELECT id FROM public.company WHERE name = 'Rheinland Apotheke GmbH')       AS rheinland,  -- live + verified
       'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid AS pendingco,  -- live + UNVERIFIED
       (SELECT id FROM public.company WHERE name = 'NordCanna Distribution GmbH')   AS nordcanna,   -- -> deactivated below
       (SELECT id FROM public.company WHERE name = 'Bavaria Medical Cannabis GmbH') AS bavaria;     -- -> soft-deleted below
GRANT SELECT ON _t TO authenticated;

-- Fixture guard. Every cell below reads a state; if the seed drifted, the suite
-- must say so rather than pass because a company quietly changed underneath it.
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT * FROM _t LOOP
    IF NOT EXISTS (SELECT 1 FROM public.company
                    WHERE id = v.pendingco AND verification_status <> 'verified'
                      AND deleted_at IS NULL AND deactivated_at IS NULL)
      THEN RAISE EXCEPTION 'FIXTURE: PendingCo must be live and UNVERIFIED — it is what pins the ruling in A4'; END IF;
    IF EXISTS (SELECT 1 FROM public.company
                WHERE id IN (v.stonepharm, v.rheinland, v.nordcanna, v.bavaria)
                  AND (deleted_at IS NOT NULL OR deactivated_at IS NOT NULL))
      THEN RAISE EXCEPTION 'FIXTURE: a control company is already dead in the seed — the A/B split is meaningless'; END IF;
    IF (SELECT company_id FROM public.person WHERE id = v.alice) IS DISTINCT FROM v.greenleaf
      THEN RAISE EXCEPTION 'FIXTURE: Alice is not at GreenLeaf — the sender predicate would refuse for the wrong reason'; END IF;
  END LOOP;
END $$;

-- Make the two dead receivers. Rolled back with everything else.
UPDATE public.company SET deactivated_at = now() WHERE id = (SELECT nordcanna FROM _t);
UPDATE public.company SET deleted_at     = now() WHERE id = (SELECT bavaria   FROM _t);

-- ============================================================================
-- §A — CONTROLS. Every request a real browser session sends must still insert.
--      A predicate that fails any cell here breaks production.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- A1 — the plain Discover connect (discover/actions.ts:76, no note)
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
SELECT 'connect', alice, greenleaf, stonepharm, 'pending', 'HEL75 A1' FROM _t;

-- A2 — connect WITH a note becomes connect_message (same call site)
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
SELECT 'connect_message', alice, greenleaf, rheinland, 'pending', 'HEL75 A2' FROM _t;

-- A3 — the per-product pricing ask (same call site, productId branch)
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
SELECT 'pricelist_request', alice, greenleaf, rheinland, 'pending', 'HEL75 A3' FROM _t;

-- A4 — ⚠️ THE RULING CELL, and the one that catches the ticket's own sketch.
--      PendingCo is LIVE but UNVERIFIED, and `company_select` hides it from
--      Alice entirely. Muskan ruled 2026-08-25 that an unverified company stays
--      REACHABLE — it is arriving, not leaving. An inline `EXISTS` refuses this
--      row; the definer helper accepts it.
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
SELECT 'connect', alice, greenleaf, pendingco, 'pending', 'HEL75 A4' FROM _t;

-- A5 — person-to-person (discover/personActions.ts:56). receiver_company_id is
--      NULL by CHECK, so the new clause must short-circuit and leave it alone.
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status, note)
SELECT 'connect_person', alice, greenleaf, bob, NULL, 'pending', 'HEL75 A5' FROM _t;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.pending_inbox_item WHERE note LIKE 'HEL75 A%') <> 5
    THEN RAISE EXCEPTION 'A/control: expected 5 legitimate requests to insert, got % — the predicate is too wide',
      (SELECT count(*) FROM public.pending_inbox_item WHERE note LIKE 'HEL75 A%'); END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — THE GATE. Alice is an ordinary, fully legitimate sender. She simply may
--      not land a request on a company that has left.
--      RED against the pre-fix policy: today every one of these succeeds.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD;
BEGIN
 FOR v IN SELECT * FROM _t LOOP
  -- B1 — deactivated receiver, the case HEL-70 could not reach from the read side
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
    VALUES ('connect', v.alice, v.greenleaf, v.nordcanna, 'pending', 'HEL75 B1');
    RAISE EXCEPTION 'B1/gate: a request LANDED on a DEACTIVATED company — inbox_insert still constrains only the sender';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B1/gate%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B1/gate: refused, but for the WRONG reason (%) — a cell that passes by accident proves nothing', SQLERRM;
  END;

  -- B2 — soft-deleted receiver
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
    VALUES ('connect', v.alice, v.greenleaf, v.bavaria, 'pending', 'HEL75 B2');
    RAISE EXCEPTION 'B2/gate: a request LANDED on a SOFT-DELETED company';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B2/gate%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B2/gate: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B3 + B4 — the gate is on the RECEIVER, not on the type. If either of these
  -- passes while B1 fails, someone has written a type-specific special case.
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
    VALUES ('connect_message', v.alice, v.greenleaf, v.nordcanna, 'pending', 'HEL75 B3');
    RAISE EXCEPTION 'B3/gate: connect_message reached a DEACTIVATED company — the gate is type-specific, not receiver-based';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B3/gate%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B3/gate: refused for the WRONG reason (%)', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
    VALUES ('pricelist_request', v.alice, v.greenleaf, v.nordcanna, 'pending', 'HEL75 B4');
    RAISE EXCEPTION 'B4/gate: pricelist_request reached a DEACTIVATED company';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B4/gate%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B4/gate: refused for the WRONG reason (%)', SQLERRM;
  END;
 END LOOP;

  IF EXISTS (SELECT 1 FROM public.pending_inbox_item WHERE note LIKE 'HEL75 B%')
    THEN RAISE EXCEPTION 'B/gate: a refused insert left a row behind'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE DEFINER DOOR IS UNHARMED. `deliver_deal` is SECURITY DEFINER owned by
--      postgres (rolbypassrls), so the deal path must still write here even for
--      a deactivated receiver. Proven with a purpose-built definer rather than by
--      calling deliver_deal, whose side effects would make a pass ambiguous.
-- ============================================================================
CREATE FUNCTION pg_temp.hel75_definer_write(p_receiver uuid, p_sender_p uuid, p_sender_c uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
  VALUES ('connect', p_sender_p, p_sender_c, p_receiver, 'pending', 'HEL75 C1');
$$;

SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT * FROM _t LOOP
    PERFORM pg_temp.hel75_definer_write(v.nordcanna, v.alice, v.greenleaf);
  END LOOP;
  IF (SELECT count(*) FROM public.pending_inbox_item WHERE note = 'HEL75 C1') <> 1
    THEN RAISE EXCEPTION 'C1/definer: a SECURITY DEFINER write was blocked by an RLS policy that must not apply to it'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — KNOWN-OPEN, RECORDED RATHER THAN ASSERTED.
--      A person-to-person request to a person who works at a DEACTIVATED company
--      is still accepted. That is OUT OF SCOPE here by construction — the row
--      carries no receiver_company_id (CHECK inbox_connect_person_has_no_company),
--      so person liveness is a different rule with a different owner.
--      This cell documents the current behaviour so that a future person-side
--      gate changes it deliberately instead of discovering it.
-- ============================================================================
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v RECORD; ok boolean := false;
BEGIN
  FOR v IN SELECT * FROM _t LOOP
    BEGIN
      INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status, note)
      VALUES ('connect_person', v.alice, v.greenleaf, v.bob, NULL, 'pending', 'HEL75 D1');
      ok := true;
    EXCEPTION WHEN insufficient_privilege THEN ok := false;
    END;
  END LOOP;
  IF NOT ok THEN
    RAISE EXCEPTION 'D1: connect_person was refused. Person-to-person is out of this ticket''s scope and must be unaffected';
  END IF;
  RAISE NOTICE 'D1 (recorded, not a defect): connect_person to a person at a DEACTIVATED company is ACCEPTED — person liveness is unowned. See HEL-75.';
END $$;
RESET ROLE;

-- ============================================================================
-- §E — HEL-84: inbox_insert's relationship-write-gate term. A relationship
--      SUSPENDED mid-suite refuses a NEW connect/pricing request onto that
--      pair (AC3); a connect_person row is unaffected (no company pair to
--      derive from — Invariant 8's NULL-passthrough exercised via the real
--      no-company-pair path, not just the function's own unit test in
--      assert_relationship_writable_test.sql); and a soft-deleted + live
--      relationship pair (Invariant 13 / round 2 F4 regression guard) still
--      resolves to exactly one row and inserts — using GreenLeaf<->Rheinland,
--      NOT GreenLeaf<->StonePharm (E3 below already suspends that pair; this
--      cell needs a genuinely ACTIVE one). Position: after D1, before the
--      file's own ROLLBACK.
-- ============================================================================

-- E0 — GreenLeaf<->StonePharm's relationship id, via this suite's own
--      canonical-pair idiom (matching accept_connection_request's own
--      least/greatest). Not in _t today — looked up dynamically.
CREATE TEMP TABLE _e ON COMMIT DROP AS
SELECT id AS rel_id FROM public.relationship
 WHERE company_a_id = LEAST((SELECT greenleaf FROM _t), (SELECT stonepharm FROM _t))
   AND company_b_id = GREATEST((SELECT greenleaf FROM _t), (SELECT stonepharm FROM _t))
   AND deleted_at IS NULL;
GRANT SELECT ON _e TO authenticated;

DO $$
BEGIN
  IF (SELECT rel_id FROM _e) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: GreenLeaf<->StonePharm relationship not found for §E — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _e)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: GreenLeaf<->StonePharm is not active at §E start — a prior suite/cell left it dirty';
  END IF;
END $$;

-- E1 — flip. Runs privileged (RESET ROLE — authenticated lacks UPDATE on
--      relationship, 20260823090000:89); a plain UPDATE as authenticated
--      would itself raise before this cell ever reached inbox_insert.
RESET ROLE;
UPDATE public.relationship SET status = 'suspended' WHERE id = (SELECT rel_id FROM _e);

-- E2 — the flip actually took, asserted before relying on it — a wrong/NULL
--      derivation in E0 would otherwise make E3 below pass vacuously.
DO $$
BEGIN
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _e)) <> 'suspended' THEN
    RAISE EXCEPTION 'E2/flip FAIL: relationship status is % after the UPDATE, expected suspended',
      (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _e));
  END IF;
END $$;

-- E3 (AC3) — Alice tries a fresh connect/pricing request onto the
--     now-SUSPENDED GreenLeaf<->StonePharm pair. Refused. Catches
--     raise_exception (P0001), NOT this file's neighboring
--     insufficient_privilege idiom (§B) — assert_relationship_writable's
--     raise is not a table/RLS-privilege denial.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
    SELECT 'connect', alice, greenleaf, stonepharm, 'pending', 'HEL84 E3 refused on a suspended pair' FROM _t;
    RAISE EXCEPTION 'E3/AC3: a connect request landed on a company with a SUSPENDED relationship to the sender';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'E3/AC3%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
        RAISE EXCEPTION 'E3/AC3: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- E4 (Invariant 8, NULL-passthrough via the real no-company-pair path) — a
--     connect_person row has receiver_company_id IS NULL by CHECK, so this
--     gate's own "receiver_company_id IS NULL OR assert_relationship_
--     writable(...)" term short-circuits to true unconditionally (§3's own
--     stated safety: least/greatest collapse to an unsatisfiable predicate
--     for the NULL case, so there is no side-effecting raise to short-
--     circuit around here). Unaffected even though the SENDER's own company
--     has a relationship this very transaction just suspended (E1) —
--     connect_person never derives a company pair at all.
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_person_id, receiver_company_id, status, note)
SELECT 'connect_person', alice, greenleaf, bob, NULL, 'pending', 'HEL84 E4' FROM _t;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.pending_inbox_item WHERE note = 'HEL84 E4') <> 1 THEN
    RAISE EXCEPTION 'E4/Invariant8: a connect_person row (no company pair) was refused by the new relationship-write gate';
  END IF;
END $$;
RESET ROLE;

-- E5 (Invariant 13 / round 2 F4 regression guard) — a company pair with BOTH
--     a soft-deleted and a live relationship row still resolves to exactly
--     one row (the deleted_at IS NULL filter in §3's own derivation
--     subquery) and an ordinary send still succeeds — no "more than one row
--     returned by a subquery" error. GreenLeaf<->Rheinland, NOT GreenLeaf<->
--     StonePharm — E1 above already suspended that pair; this cell needs one
--     that is genuinely 'active'. The extra soft-deleted relationship row is
--     inserted privileged: authenticated has INSERT revoked on relationship
--     too (20260823090000:89), same constraint as the UPDATE above.
RESET ROLE;
INSERT INTO public.relationship (company_a_id, company_b_id, initiated_by_company_id, status, deleted_at)
SELECT LEAST(greenleaf, rheinland), GREATEST(greenleaf, rheinland), greenleaf, 'ended', now() FROM _t;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, status, note)
SELECT 'pricelist_request', alice, greenleaf, rheinland, 'pending', 'HEL84 E5' FROM _t;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.pending_inbox_item WHERE note = 'HEL84 E5') <> 1 THEN
    RAISE EXCEPTION 'E5/Invariant13: an ordinary request onto a pair with a soft-deleted + live relationship row was refused (or raised "more than one row") instead of succeeding';
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'HEL-75 inbox_insert receiver gate: ALL CELLS PASSED (A1-A5, B1-B4, C1, D1, HEL-84: E1-E2 flip, E3 AC3, E4 Invariant8, E5 Invariant13)'; END $$;

ROLLBACK;
