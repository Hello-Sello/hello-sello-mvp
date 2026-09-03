-- ============================================================================
-- msg_all_sender_gate_test.sql — HEL-67, Gap 2
-- ----------------------------------------------------------------------------
-- Proves: an authenticated thread member can no longer forge WHO a chat
-- message came from — neither by attributing it to another person, nor by
-- dressing it in the platform's `system`/`sella` voice — while every
-- legitimate client-written shape still inserts unchanged.
--
-- Run:  bash supabase/tests/run_msg_all_sender_gate_test.sh
--
-- ⚠️  RED-FIRST: §B fails against the pre-fix policy. `msg_all`'s WITH CHECK
-- carries no sender predicate at all, so every forgery below is ACCEPTED.
-- That acceptance IS the reproduction. Goes green once
-- 20260903090000_msg_all_sender_attribution_gate.sql lands.
--
-- ⚠️  WHY THIS SUITE CAN EXIST NOW AND COULD NOT IN AUGUST. Gap 2 was blocked
-- on HEL-68, not deferred by preference. Three authenticated write paths used
-- to write in someone else's name — the accept-rollout's `system` line, its
-- `sella` intro, and (the trap) an ordinary `person` message attributed to the
-- REQUESTER rather than the caller (`rollout.ts:179`). HEL-68 deleted
-- `rollout.ts`; HEL-84 moved the four Sella-voiced pills into
-- `announce_deal_event`, a SECURITY DEFINER RPC. The census below is what
-- remains, re-proven from source on 2026-09-03 rather than inherited:
--
--     sender   sender_person_id   type       written by
--     person   auth.uid()         message    store.ts:484  (postMessage)
--     person   auth.uid()         deal_card  store.ts:518  (postDealMessage)
--     person   own id             message    e2e/chat-phase7.spec.ts:273
--
-- Those three cells are §A. If a future change re-introduces a client path
-- that writes in another voice, §A is where it must be justified — and §B is
-- what will go red if it is smuggled in instead.
--
-- ⚠️  §C COVERS FROM `authenticated`, NOT THROUGH A DEFINER. The five definer
-- functions that write this table bypass RLS entirely, so a test driven
-- through one of them would pass no matter what this policy said.
--
-- ⚠️  EACH CELL VIOLATES EXACTLY ONE TERM. `msg_all`'s WITH CHECK now carries
-- five ANDed terms, and Postgres does not guarantee evaluation order — a row
-- that breaks two of them may be refused by either, with either error class.
-- Every probe below is therefore built to violate ONE term only, so a pass is
-- attributable. (This is also why §B3 uses a NULL author with a `system`
-- voice: the two always travel together in real data, and pinning one without
-- the other would not match any shape the product actually writes.)
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73).
--
-- Fixture (seeded): the p2p thread between Alice 11111111-… and Bob
-- 22222222-…, resolved dynamically. Carol (Clara Vogt) is a genuine
-- NON-member of that thread.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- Resolved at runtime, never hardcoded: chat_thread.id and Clara's auth.users
-- id are both gen_random_uuid() in seed.sql, so a literal would be a fresh
-- random miss on every db reset.
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT (SELECT ct.id FROM public.chat_thread ct
         WHERE ct.type = 'p2p'
           AND ct.person_a_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
           AND ct.person_b_id IN ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222')
           AND ct.person_a_id <> ct.person_b_id)                        AS thread_id,
       '11111111-1111-1111-1111-111111111111'::uuid                     AS alice,
       '22222222-2222-2222-2222-222222222222'::uuid                     AS bob,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test')  AS carol;
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.chat_thread
                  WHERE id = (SELECT thread_id FROM _t) AND type = 'p2p' AND deleted_at IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: the seeded p2p thread is missing — seed drift'; END IF;
  IF (SELECT carol FROM _t) IS NULL
    THEN RAISE EXCEPTION 'FIXTURE: Clara Vogt is missing from auth.users — seed drift'; END IF;
  IF (SELECT bob FROM _t) = (SELECT alice FROM _t)
    THEN RAISE EXCEPTION 'FIXTURE: alice and bob resolved to the same person — §B1 would prove nothing'; END IF;
  -- The relationship behind this thread must be ACTIVE, or every cell below
  -- would be refused by HEL-84's term instead of the one under test, and the
  -- whole suite would pass vacuously.
  IF EXISTS (SELECT 1 FROM public.chat_thread ct
               JOIN public.relationship r ON r.id = ct.relationship_id
              WHERE ct.id = (SELECT thread_id FROM _t) AND r.status <> 'active')
    THEN RAISE EXCEPTION 'FIXTURE: the relationship behind the seeded thread is not active — §A/§B would not isolate the sender term'; END IF;
END $$;

-- ============================================================================
-- §A — CONTROLS. The three shapes a real browser session writes today must
--      still insert. If any cell here fails, the predicate is too tight and
--      would break the product.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- A1 — an ordinary human message, self-attributed (store.ts:484)
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'person', alice, 'message', 'HEL67G2 A1 ordinary message' FROM _t;

-- A2 — the clickable deal pill, self-attributed (store.ts:518). This is the
--      shape slug 0023 put load on, and the one §B1 forges.
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
SELECT thread_id, 'person', alice, 'deal_card', 'HEL67G2 A2 deal pill', '{}'::jsonb FROM _t;

-- A3 — the same shape written by the OTHER party (e2e/chat-phase7.spec.ts:273
--      writes as its own user). Proves the predicate keys on the CALLER, not
--      on a hardcoded person: Bob writing as Bob must work exactly as Alice
--      writing as Alice does.
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
SELECT thread_id, 'person', bob, 'message', 'HEL67G2 A3 bob writing as bob' FROM _t;

RESET ROLE;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67G2 A%') <> 3
    THEN RAISE EXCEPTION 'A/control: expected 3 legitimate rows to insert, got %',
      (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67G2 A%'); END IF;
END $$;

-- ============================================================================
-- §B — THE GATE. Alice is a full member of this thread and may write anything
--      in it under her own name. She must not be able to write under anyone
--      else's. RED against the pre-fix policy: all three inserts succeed.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- B1 — THE ONE THAT MATTERS. Alice mints the deal-arrival pill in BOB's
  --      name. Since slug 0023 this is the signal the product renders as
  --      "Bob has sent a deal", pointing at a card Alice chose.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    SELECT thread_id, 'person', bob, 'deal_card', 'HEL67G2 B1 Bob has sent a deal', '{}'::jsonb FROM _t;
    RAISE EXCEPTION 'B1/forgery: a thread member attributed a deal pill to ANOTHER PERSON — msg_all has no sender predicate';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected: RLS refused it
    WHEN others THEN
      IF SQLERRM LIKE 'B1/forgery%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B1/forgery: refused, but for the WRONG reason (%) — a cell that passes by accident proves nothing', SQLERRM;
  END;

  -- B2 — the same forgery on an ordinary message. Separate cell because B1
  --      would also be caught by a `type`-keyed predicate, and this one
  --      would not: it proves the gate is on the AUTHOR, not on the type.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'person', bob, 'message', 'HEL67G2 B2 words put in Bob''s mouth' FROM _t;
    RAISE EXCEPTION 'B2/forgery: a thread member wrote an ordinary message in ANOTHER PERSON''s name';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B2/forgery%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B2/forgery: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B3 — the BORROWED VOICE half. Not another person: the platform itself.
  --      A `system` line is chrome the UI renders differently and that a user
  --      has no reason to distrust. `sella` is covered by B4.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'system', NULL, 'connection_established', 'HEL67G2 B3 forged system line' FROM _t;
    RAISE EXCEPTION 'B3/voice: a thread member wrote in the SYSTEM voice — the platform''s own chrome is forgeable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B3/voice%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B3/voice: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B4 — the same in SELLA's voice, on a type that is NOT deal_detected, so
  --      Gap 1's term cannot be what refuses it. Before this migration these
  --      four types were the exact shape `announceDealEvent` used to write
  --      from the browser; HEL-84 moved them into a definer, and this cell
  --      pins that the client door stayed shut behind it.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'sella', NULL, 'deal_signed', 'HEL67G2 B4 forged sella pill' FROM _t;
    RAISE EXCEPTION 'B4/voice: a thread member wrote a lifecycle pill in SELLA''s voice — announce_deal_event''s move server-side is bypassable';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B4/voice%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B4/voice: refused for the WRONG reason (%)', SQLERRM;
  END;

  -- B5 — a NULL author in the person voice. Belt-and-braces on the id term:
  --      `sender_person_id = auth.uid()` is NULL-false in SQL, and this cell
  --      pins that rather than assuming it.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'person', NULL, 'message', 'HEL67G2 B5 anonymous person message' FROM _t;
    RAISE EXCEPTION 'B5/null-author: a person-voiced message inserted with NO author — the id term is NULL-permissive';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'B5/null-author%' THEN RAISE; END IF;
      RAISE EXCEPTION 'B5/null-author: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — THE LEGITIMATE VOICES ARE UNHARMED. Every system/sella line in the
--      product is written by a SECURITY DEFINER function or by service_role,
--      both of which bypass this policy. Proven with a purpose-built definer
--      rather than by calling `announce_deal_event`, whose side effects would
--      make a pass ambiguous.
-- ============================================================================
CREATE FUNCTION pg_temp.hel67g2_definer_insert(p_thread uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $fn$
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
  VALUES (p_thread, 'system', NULL, 'connection_established', 'HEL67G2 C1 definer-written system line'),
         (p_thread, 'sella',  NULL, 'intro',                  'HEL67G2 C2 definer-written sella intro');
$fn$;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM pg_temp.hel67g2_definer_insert((SELECT thread_id FROM _t));
  IF (SELECT count(*) FROM public.chat_message WHERE body LIKE 'HEL67G2 C%') <> 2
    THEN RAISE EXCEPTION 'C/definer: the SECURITY DEFINER voice path was BROKEN by this policy — connection-accept and Sella can no longer speak'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — THE EXISTING GATES STILL HOLD. Narrowing WITH CHECK must not have
--      loosened anything on the way past.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', (SELECT carol::text FROM _t), true);
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', carol, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- D1 — a non-member, writing correctly under her OWN name, is still refused
  --      by can_access_thread. Violates exactly one term (membership), so a
  --      pass here is attributable to the thread gate and not to the new one.
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body)
    SELECT thread_id, 'person', carol, 'message', 'HEL67G2 D1 outsider' FROM _t;
    RAISE EXCEPTION 'D1/outsider: a NON-member wrote into someone else''s thread — can_access_thread was lost from WITH CHECK';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'D1/outsider%' THEN RAISE; END IF;
      RAISE EXCEPTION 'D1/outsider: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  -- D2 — Gap 1's term survives: a correctly-authored, person-voiced
  --      deal_detected is still refused. Violates exactly one term (type).
  BEGIN
    INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
    SELECT thread_id, 'person', alice, 'deal_detected', 'HEL67G2 D2 forged detection', '{}'::jsonb FROM _t;
    RAISE EXCEPTION 'D2/gap1: the deal_detected term was LOST while adding the sender terms — HEL-67 Gap 1 regressed';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN others THEN
      IF SQLERRM LIKE 'D2/gap1%' THEN RAISE; END IF;
      RAISE EXCEPTION 'D2/gap1: refused for the WRONG reason (%)', SQLERRM;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §E — THE READ DOOR DID NOT MOVE. `msg_all` is FOR ALL and is the only
--      policy on this table: a careless restate would change who can SELECT
--      every message in the product (L-037). Assert the USING half is
--      untouched and WITH CHECK gained exactly the terms intended.
-- ============================================================================
DO $$
DECLARE v_using text; v_check text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
    INTO v_using, v_check
    FROM pg_policy WHERE polrelid = 'public.chat_message'::regclass AND polname = 'msg_all';

  IF v_using ~ 'sender'
    THEN RAISE EXCEPTION 'E1/read-door: a sender predicate leaked into the USING half — this now governs who can READ messages, and would hide every system and sella line from everyone: %', v_using; END IF;

  IF v_using !~ 'can_access_thread'
    THEN RAISE EXCEPTION 'E1/read-door: USING no longer calls can_access_thread — the read gate was replaced: %', v_using; END IF;

  IF v_check !~ 'sender_person_id'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK does not carry the sender_person_id term: %', v_check; END IF;

  IF v_check !~ 'can_access_thread'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK LOST can_access_thread while gaining the sender terms — the thread gate was traded away: %', v_check; END IF;

  IF v_check !~ 'deal_detected'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK LOST the Gap 1 deal_detected term: %', v_check; END IF;

  IF v_check !~ 'assert_relationship_writable'
    THEN RAISE EXCEPTION 'E2/write-door: WITH CHECK LOST HEL-84''s relationship-write gate: %', v_check; END IF;

  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.chat_message'::regclass) <> 1
    THEN RAISE EXCEPTION 'E3: chat_message no longer carries exactly one policy — a second policy could re-open what this one closes'; END IF;
END $$;

ROLLBACK;

\echo 'PASS — msg_all_sender_gate_test.sql (HEL-67 Gap 2): sender is no longer forgeable'
