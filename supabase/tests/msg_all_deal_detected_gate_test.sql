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
--     sella    NULL               deal_signed + 3 siblings    actions.ts:682
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

-- A3 — the four lifecycle pills announceDealEvent writes in Sella's voice with
--      NO person author (actions.ts:682). All four, not a representative one:
--      a type predicate that caught any of them would break a shipped action.
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'sella', NULL, t, 'HEL67 A3 ' || t
  FROM _t, unnest(ARRAY['deal_cancelled','deal_signed','deal_change_proposed','deal_negotiation_requested']) AS t;

-- A4 — the system line the accept rollout seeds (store.ts:646 / rollout.ts:110)
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'system', NULL, 'connection_established', 'HEL67 A4 system line' FROM _t;

-- A5 — Sella's intro line (rollout.ts:174)
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'sella', NULL, 'intro', 'HEL67 A5 sella intro' FROM _t;

-- A6 — ⚠️ THE TRAP. Alice inserts a `person` message authored by BOB.
--      This is not a forgery: it is `rollout.ts:179`, the accepter seeding the
--      requester's own note. Any future `sender_person_id = auth.uid()`
--      predicate turns this cell RED, which is the whole point of it existing.
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'person', bob, 'message', 'HEL67 A6 the requester''s note, written by the accepter' FROM _t;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67 A%') <> 9
    THEN RAISE EXCEPTION 'A/control: expected 9 legitimate rows to insert, got %',
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

ROLLBACK;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.chat_message WHERE body LIKE 'HEL67 %')
    THEN RAISE EXCEPTION 'TEARDOWN: HEL-67 fixture rows survived ROLLBACK — this suite mutated the shared seed'; END IF;
END $$;

\echo '  HEL-67 Gap 1 (deal_detected un-forgeable): ALL CELLS PASSED (A control x6/9 rows, B gate x2, C definer x1, D outsider x1, E policy-shape x3)'
