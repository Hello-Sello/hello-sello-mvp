-- ============================================================================
-- msg_all_deal_detected_gate_test.sql — HEL-67, Gap 1
-- ----------------------------------------------------------------------------
-- Proves: an authenticated thread member can no longer forge a
-- `type = 'deal_detected'` chat message — the row that drives
-- `confirm_detected_deal` into birthing a real deal — while EVERY legitimate
-- client-written message shape still inserts unchanged.
--
-- Run:  bash supabase/tests/run_msg_all_deal_detected_gate_test.sh
--
-- ⚠️  RED-FIRST: §B fails against the pre-fix policy — `msg_all`'s WITH CHECK
-- is `can_access_thread(thread_id)` and nothing else, so the forgery is
-- ACCEPTED. That acceptance IS the reproduction.
--
-- ⚠️  §A IS THE REAL WORK OF THIS SUITE, NOT §B. The ticket sketched banning
-- "Sella-authored types, service-role only", and a census showed that would
-- break FIVE live client paths. §A pins all six shapes an ordinary browser
-- session legitimately writes, so that any future attempt to widen this
-- predicate fails loudly here instead of in production:
--
--     sender   sender_person_id   type                        written by
--     person   auth.uid()         message                     store.ts:478
--     person   auth.uid()         deal_card                   store.ts:512
--     sella    NULL               deal_signed + 3 siblings    announce_deal_event()
--                                                              SECURITY DEFINER RPC
--                                                              (HEL-84 §12.2, NOT a
--                                                              direct client insert
--                                                              any more — §A3 below
--                                                              is now a structural
--                                                              control only)
--     system   NULL               connection_established      store.ts:646
--     sella    NULL               intro                       store.ts:646
--     person   ANOTHER PERSON     message                     store.ts:646
--
-- The last one is the trap: the person ACCEPTING a connection inserts a human
-- message attributed to the REQUESTER (`rollout.ts:179`). It is why HEL-67's
-- Gap 2 — `sender_person_id = auth.uid()` — cannot be built until HEL-68 moves
-- that write into a definer. §A6 exists to make anyone who tries it go red.
--
-- ⚠️  §C COVERS FROM `authenticated`, NOT THROUGH A DEFINER. `deliver_deal` and
-- `confirm_detected_deal*` are SECURITY DEFINER and bypass RLS entirely, so a
-- test driven through them would pass no matter what this policy said.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73).
--
-- Fixture (seeded): the p2p thread between Alice 11111111-… and
-- Bob 22222222-…, resolved dynamically below. Carol (Clara Vogt) is a
-- genuine NON-member of that thread.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- The p2p thread and Carol (Clara Vogt, a genuine non-member) are looked up
-- dynamically, not hardcoded: chat_thread.id and Clara's auth.users id are
-- both gen_random_uuid() in seed.sql, so a literal here would be a fresh
-- random miss on every single db reset.
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT (SELECT ct.id FROM public.chat_thread ct
         WHERE ct.type = 'p2p'
           AND ct.person_a_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
           AND ct.person_b_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
           AND ct.person_a_id <> ct.person_b_id)                       AS thread_id,
       '11111111-1111-1111-1111-111111111111'::uuid                   AS alice,
       '22222222-2222-2222-2222-222222222222'::uuid                   AS bob,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS carol;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_thread
                  WHERE id = (SELECT thread_id FROM _t) AND type = 'p2p' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: the seeded p2p thread is missing — seed drift'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_message_type WHERE code = 'deal_detected')
    THEN RAISE EXCEPTION 'FIXTURE: deal_detected is not a known message type'; END IF;
END $$;

-- ============================================================================
-- §A — CONTROLS. Every shape a real browser session writes must still insert.
--      If any cell here fails, the predicate is too wide and would break
--      production, which is exactly what the ticket's own sketch would have done.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- A1 — an ordinary human message (store.ts:478)
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'person', alice, 'message', 'HEL67 A1 ordinary message' FROM _t;

-- A2 — the clickable deal pill (store.ts:512)
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
SELECT thread_id, 'person', alice, 'deal_card', 'HEL67 A2 deal pill', '{}'::jsonb FROM _t;

-- ── A3–A6 RETIRED 2026-09-03 (HEL-67 Gap 2), NOT DELETED IN PASSING ──
--
-- This suite used to carry four more control cells, and every one of them has
-- now been REFUTED by a shipped migration rather than by a change of opinion.
-- They are recorded here because a control that silently disappears looks like
-- coverage that was never there:
--
--   A3  sella  / NULL     / the four lifecycle pill types  (was actions.ts:682)
--   A4  system / NULL     / connection_established         (was rollout.ts:110)
--   A5  sella  / NULL     / intro                          (was rollout.ts:174)
--   A6  person / BOB'S ID / message                        (was rollout.ts:179)
--
-- A6 was this file's ⚠️ THE TRAP: the accepter seeding the REQUESTER's own
-- note, deliberately attributed to someone other than the caller. Its comment
-- read "any future `sender_person_id = auth.uid()` predicate turns this cell
-- RED, which is the whole point of it existing." That is exactly what
-- happened — and the trap did its job, which is why this block is a rewrite
-- and not a surprise.
--
-- What changed: HEL-68 (`20260826100000`) moved thread creation into
-- `accept_connection_request` and DELETED `rollout.ts`, taking A4/A5/A6's
-- write paths out of the client entirely; HEL-84 (`20260827150000`) moved
-- A3's four types into `announce_deal_event`, a SECURITY DEFINER RPC. None of
-- these four is a legitimate `authenticated` write any more, so
-- `20260903090000_msg_all_sender_attribution_gate.sql` refuses all four.
--
-- Where the coverage went — it did not evaporate:
--   * refusal of all four shapes  -> msg_all_sender_gate_test.sql §B3/§B4/§B5
--   * the definer voices still work -> msg_all_sender_gate_test.sql §C
--   * A6's forgery, now the headline vulnerability -> that file's §B1/§B2
--
-- §A below is now the FULL census of what an ordinary browser session writes.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67 A%') <> 2
    THEN RAISE EXCEPTION 'A/control: expected 2 legitimate rows to insert, got %',
      (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67 A%'); END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — THE GATE. Alice is a full member of this thread and may write anything
--      else in it. She must NOT be able to mint Sella's detection signal.
--      RED against the pre-fix policy: today the insert simply succeeds.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    SELECT thread_id, 'person', alice, 'deal_detected', 'HEL67 B1 forged detection', '{}'::jsonb FROM _t;
    RAISE EXCEPTION 'B1/forgery: a thread member MINTED a deal_detected message — msg_all has no type predicate, and confirm_detected_deal will act on this row';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected: RLS refused it
    WHEN others THEN
      IF SQLERRM LIKE 'B1/forgery%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B1/forgery: refused, but for the WRONG reason (%) — a cell that passes by accident proves nothing', SQLERRM;
  END;

  -- B2 — and not by dressing it up in Sella's voice either.
  --      ⚠️ NO LONGER AN ISOLATED PROOF (HEL-67 Gap 2, 2026-09-03). This row
  --      now violates TWO terms — `type <> 'deal_detected'` AND `sender =
  --      'person'` — and Postgres does not guarantee which one refuses it, so
  --      a pass here no longer attributes to the type term specifically. B1
  --      above is the isolated cell for that (person voice, own id, forged
  --      type) and is what actually protects Gap 1. B2 is kept as
  --      defence-in-depth: whichever term fires, the forgery must not land.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    SELECT thread_id, 'sella', NULL, 'deal_detected', 'HEL67 B2 forged, sella voice', '{}'::jsonb FROM _t;
    RAISE EXCEPTION 'B2/forgery: the gate is on `sender`, not on `type` — a member forged deal_detected by claiming to be Sella';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B2/forgery%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B2/forgery: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — SELLA'S OWN DOOR IS UNHARMED. A SECURITY DEFINER function bypasses RLS,
--      so the real detection path must still write. Proven with a purpose-built
--      definer rather than by calling `deliver_deal`, whose side effects would
--      make a pass ambiguous.
-- ============================================================================
CREATE FUNCTION pg_temp.hel67_definer_insert(p_thread uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  VALUES (p_thread, 'sella', NULL, 'deal_detected', 'HEL67 C1 definer-written detection', '{}'::jsonb);
$fn$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.hel67_definer_insert((SELECT thread_id FROM _t));
  IF (SELECT count(*) FROM public.chat_message WHERE body = 'HEL67 C1 definer-written detection') <> 1
    THEN RAISE EXCEPTION 'C1/definer: the SECURITY DEFINER detection path was BROKEN by this policy — Sella can no longer propose a deal'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — THE EXISTING GATE STILL HOLDS. Carol is not in this thread. Narrowing
--      WITH CHECK must not have loosened anything on the way past.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', (SELECT carol::text FROM _t), true);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', carol, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'person', carol, 'message', 'HEL67 D1 outsider' FROM _t;
    RAISE EXCEPTION 'D1/outsider: a NON-member wrote into someone else''s thread — can_access_thread was lost from WITH CHECK';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'D1/outsider%' THEN RAISE; END IF;
      RAISE EXCEPTION 'D1/outsider: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — THE READ DOOR DID NOT MOVE. `msg_all` is FOR ALL: a careless restate
--      would change who can SELECT every message in the product. Assert the
--      USING half is untouched and the WITH CHECK half gained exactly the term
--      intended (L-037).
-- ============================================================================
DO $$
DECLARE v_using text; v_check text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'public.chat_message'::regclass AND polname = 'msg_all';

  IF v_using ~ 'deal_detected'
    THEN RAISE EXCEPTION 'E1/read-door: the type predicate leaked into the USING half — this now governs who can READ messages: %', v_using; END IF;

  IF v_using !~ 'can_access_thread'
    THEN RAISE EXCEPTION 'E1/read-door: USING no longer calls can_access_thread — the read gate was replaced: %', v_using; END IF;

  IF v_check !~ 'deal_detected'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK does not carry the deal_detected term: %', v_check; END IF;

  IF v_check !~ 'can_access_thread'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK LOST can_access_thread while gaining the type term — the thread gate was traded away: %', v_check; END IF;

  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.chat_message'::regclass) <> 1
    THEN RAISE EXCEPTION 'E3: chat_message no longer carries exactly one policy — a second policy could re-open what this one closes'; END IF;
END $$;

-- ============================================================================
-- §F — HEL-84: msg_all's relationship-write-gate term. F1 re-confirms the
--      pre-existing deal_detected refusal (§B) is unaffected by the new
--      predicate WHILE the relationship is still active (this cell's whole
--      point). F2-F3 flip the relationship SUSPENDED, and F4/F5 prove the
--      new gate: AC1 and AC2 are ONE cell (round 6, N1 — in a psql suite, "an
--      app write" and "a direct PostgREST-shaped call" are indistinguishable
--      — both are a bare INSERT under SET LOCAL ROLE authenticated, exactly
--      what this file's own header (:34-36) already says it covers).
--      CORRECTED SCOPE (HEL-84 §12 addendum — a live-proven exploit found
--      the original four-type exemption was itself client-reachable: setting
--      `type` to one of the four alone bypassed the whole gate): F5 no
--      longer asserts these four types are EXEMPT. After §12.4, `msg_all`
--      carries a plain `assert_relationship_writable` check with no type
--      carve-out at all — F5 now asserts the four types are REFUSED on this
--      SAME suspended relationship, same as any other type, the regression
--      guard that would have caught the vulnerability `security` found. The
--      real Sella voice for these four types moved server-side entirely
--      (`announce_deal_event`, a SECURITY DEFINER RPC, §12.2/
--      announce_deal_event_test.sql) — it bypasses this policy and needs no
--      exemption from it. Last cell, immediately before this file's own
--      ROLLBACK: the flip below persists for anything after it, and every
--      earlier section above already ran.
-- ============================================================================

-- F0 — the relationship id backing the seeded Alice<->Bob p2p thread is NOT
--      in _t today — derived dynamically, matching this file's own
--      convention of resolving values at runtime rather than hardcoding.
CREATE TEMP TABLE _f ON COMMIT DROP AS
SELECT relationship_id AS rel_id FROM public.chat_thread WHERE id = (SELECT thread_id FROM _t);
GRANT SELECT ON _f TO authenticated;

DO $$
BEGIN
  IF (SELECT rel_id FROM _f) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the seeded Alice<->Bob p2p thread has no relationship_id — cannot run §F';
  END IF;
END $$;

-- F1 — REGRESSION GUARD, relationship still ACTIVE: type = 'deal_detected'
--      as authenticated is still refused, same as §B. The refusal here is a
--      genuine RLS WITH CHECK violation (type <> 'deal_detected' fails; the
--      assert_relationship_writable term never raises on an active
--      relationship either way — post-§12.4 this is a plain AND, not a CASE,
--      but the same fact holds), so this uses the file's OWN
--      insufficient_privilege idiom (§B), not the P0001 idiom F4 needs below.
SELECT set_config('request.jwt.claim.sub', (SELECT alice::text FROM _t), true);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    SELECT thread_id, 'person', alice, 'deal_detected', 'HEL84 F1 forged detection, still active', '{}'::jsonb FROM _t;
    RAISE EXCEPTION 'F1/regression: a thread member minted deal_detected on an ACTIVE relationship — the pre-existing gate regressed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'F1/regression%' THEN RAISE; END IF;
      RAISE EXCEPTION 'F1/regression: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- F2 — flip. Runs privileged (RESET ROLE — authenticated lacks UPDATE on
--      relationship, 20260823090000:89); a plain UPDATE as authenticated
--      would itself raise before this cell ever reached msg_all. The claims
--      active immediately before this point are Alice's (F1, above — F1 sets
--      Alice's claims to run its own probe; PRE-EXISTING COMMENT BUG FIXED
--      here, HEL-84 §12: this used to say "Carol's (§D, :182-183)", which
--      was already wrong when this file was first built — §D's own RESET
--      ROLE resets only the ROLE, not the transaction-local set_config
--      claims, but F1 (immediately above, not §D) is the last block to have
--      set them). This RESET ROLE is defensive/explicit either way, not
--      corrective of anything this section left.
RESET ROLE;
UPDATE public.relationship SET status = 'suspended' WHERE id = (SELECT rel_id FROM _f);

-- F3 — the flip actually took, asserted before relying on it — a wrong/NULL
--      derivation in F0 would otherwise make F4/F5 below pass vacuously.
DO $$
BEGIN
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _f)) <> 'suspended' THEN
    RAISE EXCEPTION 'F3/flip FAIL: relationship status is % after the UPDATE, expected suspended',
      (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _f));
  END IF;
END $$;

-- F4 (AC1 + AC2, one cell) — Alice, an ordinary thread member, tries an
--     ordinary chat message on the now-SUSPENDED relationship. Refused.
--     Claims re-established explicitly to Alice's (NOT Carol's, which are
--     what's active immediately before this block) before the role switch.
--     Catches raise_exception (P0001) — assert_relationship_writable's raise
--     propagates as itself, NOT this file's neighboring insufficient_
--     privilege idiom (:134-139), which is for a table/RLS-privilege denial.
SELECT set_config('request.jwt.claim.sub', (SELECT alice::text FROM _t), true);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'person', alice, 'message', 'HEL84 F4 refused on a suspended relationship' FROM _t;
    RAISE EXCEPTION 'F4/AC1-AC2: an ordinary message inserted onto a SUSPENDED relationship — the write gate did not fire';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'F4/AC1-AC2%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
        RAISE EXCEPTION 'F4/AC1-AC2: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- F5 (HEL-84 §12 addendum — REPLACES the old exemption cell) — the four
--     types that USED to be exempt (deal_signed/deal_cancelled/
--     deal_change_proposed/deal_negotiation_requested) are now REFUSED on
--     this SAME suspended relationship, exactly like F4's ordinary message —
--     `msg_all` no longer carries any type-keyed carve-out (§12.4 replaced
--     the CASE with a plain check). This is the regression guard that would
--     have caught the vulnerability `security` found: the original
--     exemption let a client bypass the write-gate on a suspended
--     relationship by setting `type` to one of these four values instead of
--     `'message'`. Catches raise_exception (P0001) — assert_relationship_
--     writable's raise propagates as itself, NOT this file's neighboring
--     insufficient_privilege idiom (§8's own point 4 pattern, same as F4
--     above). The legitimate voice for these four types now lives entirely
--     in `announce_deal_event`, a SECURITY DEFINER RPC (§12.2) that bypasses
--     this policy — its own suspended-relationship success cell is
--     announce_deal_event_test.sql §F, not here.
SELECT set_config('request.jwt.claim.sub', (SELECT alice::text FROM _t), true);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_type text;
BEGIN
  FOREACH v_type IN ARRAY ARRAY['deal_cancelled','deal_signed','deal_change_proposed','deal_negotiation_requested'] LOOP
    BEGIN
      -- ⚠️ VOICE CHANGED sella/NULL -> person/alice (HEL-67 Gap 2,
      --    2026-09-03). This cell must violate ONLY the relationship term, or
      --    it stops proving anything: since 20260903090000 a `sella`-voiced
      --    row is refused by the sender term too, and Postgres may report
      --    either — an insufficient_privilege would escape this block's
      --    raise_exception handler and fail the suite for the wrong reason.
      --    The four TYPES are what this cell is about, and they are unchanged.
      INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
      SELECT thread_id, 'person', alice, v_type, 'HEL84 F5 ' || v_type FROM _t;
      RAISE EXCEPTION 'F5/refusal: type = % inserted as authenticated on a SUSPENDED relationship — the old client-reachable exemption bypass is back', v_type;
    EXCEPTION
      WHEN raise_exception THEN
        IF SQLERRM LIKE 'F5/refusal%' THEN RAISE; END IF;
        IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
          RAISE EXCEPTION 'F5/refusal: type = % refused for the WRONG reason (%)', v_type, SQLERRM;
        END IF;
    END;
  END LOOP;
END $$;
RESET ROLE;

ROLLBACK;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_message WHERE body LIKE 'HEL67 %' OR body LIKE 'HEL84 %')
    THEN RAISE EXCEPTION 'TEARDOWN: HEL-67/HEL-84 fixture rows survived ROLLBACK — this suite mutated the shared seed'; END IF;
END $$;

\echo '  HEL-67 Gap 1 (deal_detected un-forgeable): ALL CELLS PASSED (A control x2/2 rows (A3-A6 retired by HEL-67 Gap 2 — see the block above §A''s count check), B gate x2, C definer x1, D outsider x1, E policy-shape x3, F HEL-84 write-gate: F1 regression, F2-F3 flip, F4 AC1/AC2, F5 refusal x4 (HEL-84 §12: the old exemption-by-type is gone))'
