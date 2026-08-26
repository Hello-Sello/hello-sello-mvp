-- ============================================================================
-- accept_connection_request_status_guard_test.sql
-- ----------------------------------------------------------------------------
-- Proves HEL-82's `security`-reviewer-found fix: once a relationship is
-- suspended or ended, accepting a fresh connection/pricing request onto that
-- SAME pair is refused, not silently adopted. Before this fix,
-- accept_connection_request's "ENSURE, not insert" branch found the existing
-- non-active row and returned success with status untouched — a permanent
-- Connect-loop (discovery says "not connected" because it requires
-- status='active'; accepting "worked"; nothing ever un-hides the Connect
-- button) with a live side effect (a fresh chat thread) each time through it.
--
-- §§C-E: accept_connection_request now mints c2c/p2p chat_thread rows + their
-- seed messages ITSELF, atomically, via two new PLAIN (deliberately NOT
-- SECURITY DEFINER — they're only ever called from inside this RPC's own
-- definer body) internal helpers (public._resolve_or_create_c2c_thread /
-- public._resolve_or_create_p2p_thread) — not the browser's now-deleted
-- rollout.ts. §C denies direct calls to those helpers; §D proves fresh-accept
-- thread creation, the type-specific seed text, message ordering, and the
-- whitespace-note handling on a fresh pair; §E proves the adopt path mints no
-- second thread and seeds no second line, on the SAME Rheinland<->GreenLeaf
-- pair §A/§B already re-activated.
--
-- NOTE (test-writer judgment call, not silent): §B's own CTAS at the OLD
-- :126-127 is rewritten below (`SELECT relationship_id AS rel_id FROM
-- public.accept_connection_request(...)`) so this file keeps compiling once
-- the RPC's return type changes from a bare uuid to a 3-column OUT-param
-- record — `... AS rel_id` alone would hit Postgres's "column has
-- pseudo-type record" error on that CTAS and abort the whole script
-- (ON_ERROR_STOP=1) before §§C-E ever ran. Confirmed this shape breaks by
-- checking how the OTHER existing OUT-param RPC (confirm_detected_deal) is
-- called elsewhere in supabase/tests/ — always `SELECT col INTO var FROM
-- func(...)`, never `SELECT func(...) AS col`.
-- The three analogous rewrites this same signature change needs in
-- connection_consent_lockdown_test.sql (:512,574,581) ARE applied, in that
-- file — a separate pass, since that file has its own runner and the two
-- suites' rewrites are independent of each other.
--
-- Run:  bash supabase/tests/run_accept_connection_request_status_guard_test.sh
--
-- Fixture: Rheinland Apotheke <-> GreenLeaf Cultivation (Clara @ Rheinland,
-- Alice @ GreenLeaf — both already-established fixtures). Same pair
-- relationship_admin_suspend_end_test.sql uses; sequential BEGIN…ROLLBACK
-- suites don't collide. §§C-E add their own ephemeral company/person/inbox-
-- item fixtures, UUID prefix 7… — grepped first, confirmed unused under
-- supabase/ or e2e/ (connection_consent_lockdown_test.sql already claims 6…,
-- per its own citation of the a…/b…/c…/d…/e…/f…/1…/2…/3…/9… namespace).
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT r.id                                            AS rel_id,
       (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara,
       (SELECT company_id FROM public.person
         WHERE id = (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test')) AS rheinland,
       '11111111-1111-1111-1111-111111111111'::uuid    AS alice,
       (SELECT company_id FROM public.person WHERE id = '11111111-1111-1111-1111-111111111111') AS greenleaf,
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
END $$;

-- HS team suspends the pair first.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _t), 'suite setup: licence lapsed');
RESET ROLE;

-- ============================================================================
-- §A — a fresh request onto the now-suspended pair is refused on accept.
-- ============================================================================

-- Clara (Rheinland) sends GreenLeaf a pricing ask — the RLS-legitimate path
-- (inbox_insert requires sender_company_id = current_company_id() AND
-- sender_person_id = auth.uid()), same as an ordinary caller would.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _item ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, note)
  SELECT 'pricelist_request', clara, rheinland, greenleaf, 'A2/suite: pricing ask on a suspended pair'
  FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _item TO authenticated;
RESET ROLE;

-- Alice (GreenLeaf) tries to accept it. Refused — the relationship is suspended.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.accept_connection_request((SELECT id FROM _item));
    RAISE EXCEPTION 'A/suspended: accept_connection_request adopted a suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'A/suspended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship % is suspended%' THEN
        RAISE EXCEPTION 'A/suspended: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- The refusal left no side effect: still exactly one relationship row for
-- this pair, still suspended, no new chat thread minted.
DO $$
DECLARE v_rel_count int; v_status text;
BEGIN
  SELECT count(*) INTO v_rel_count FROM public.relationship
   WHERE (company_a_id, company_b_id) = ((SELECT LEAST(rheinland, greenleaf) FROM _t), (SELECT GREATEST(rheinland, greenleaf) FROM _t))
     AND deleted_at IS NULL;
  IF v_rel_count <> 1 THEN
    RAISE EXCEPTION 'A/no-mint: expected exactly 1 relationship row for the pair, got %', v_rel_count;
  END IF;
  SELECT status INTO v_status FROM public.relationship WHERE id = (SELECT rel_id FROM _t);
  IF v_status <> 'suspended' THEN
    RAISE EXCEPTION 'A/untouched: relationship status is % after the refused accept, expected still suspended', v_status;
  END IF;
END $$;

-- ============================================================================
-- §B — HS team reactivates; the SAME request now accepts normally, adopting
--      the SAME relationship row (not minting a second one).
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _t));
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
-- The RPC now returns a 3-column OUT-param record
-- (relationship_id, c2c_thread_id, p2p_thread_id), not a bare uuid —
-- `SELECT relationship_id AS rel_id FROM func(...)`, matching
-- confirm_detected_deal's own call idiom elsewhere in this directory.
CREATE TEMP TABLE _accepted ON COMMIT DROP AS
SELECT relationship_id AS rel_id FROM public.accept_connection_request((SELECT id FROM _item));
RESET ROLE;

DO $$
BEGIN
  IF (SELECT rel_id FROM _accepted) <> (SELECT rel_id FROM _t) THEN
    RAISE EXCEPTION 'B/reactivated: accept minted a DIFFERENT relationship row instead of adopting the existing one';
  END IF;
END $$;

-- ============================================================================
-- §C — deny-tests for the two new internal helpers. Neither
-- `_resolve_or_create_c2c_thread` nor `_resolve_or_create_p2p_thread` is
-- SECURITY DEFINER — each runs inside
-- accept_connection_request's own definer body, so a caller reaching either
-- directly must be refused at the GRANT layer, same 42501 idiom as block 11
-- in connection_consent_lockdown_test.sql (call and expect
-- insufficient_privilege — NOT a proacl grep, L-010: a function is born
-- without a grant, so a missing-grant grep would pass whether or not the
-- REVOKE ritual actually ran). Both helpers REVOKE ALL FROM public, anon,
-- authenticated (§1) — unlike accept_connection_request itself, which keeps
-- `authenticated` GRANTed EXECUTE (live migration :136-137, re-emitted
-- unchanged) — so BOTH roles are denied here, not just anon. The relationship
-- id / person ids passed are arbitrary: the GRANT check happens before the
-- function body (or its argument values) are ever evaluated.
-- ============================================================================

-- anon — no jwt claims set, a signed-out visitor has none.
SET LOCAL ROLE anon;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public._resolve_or_create_c2c_thread('00000000-0000-0000-0000-000000000001'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'C/anon-c2c FAIL: anon could call _resolve_or_create_c2c_thread directly';
  END IF;
END $$;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public._resolve_or_create_p2p_thread(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'C/anon-p2p FAIL: anon could call _resolve_or_create_p2p_thread directly';
  END IF;
END $$;
RESET ROLE;

-- authenticated — a real signed-in person (Clara). Still denied: the helpers
-- are internal-only, no direct caller (authenticated included) has EXECUTE.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public._resolve_or_create_c2c_thread('00000000-0000-0000-0000-000000000001'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'C/auth-c2c FAIL: authenticated could call _resolve_or_create_c2c_thread directly';
  END IF;
END $$;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public._resolve_or_create_p2p_thread(
      '00000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000002'::uuid,
      '00000000-0000-0000-0000-000000000003'::uuid);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'C/auth-p2p FAIL: authenticated could call _resolve_or_create_p2p_thread directly';
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — fresh-accept thread creation, message ordering, and the
-- whitespace-note fix, all on a FRESH, never-before-connected pair so every
-- accept below is a genuine mint, not an adopt (the adopt path is §E's job, on
-- the ALREADY-connected Rheinland<->GreenLeaf pair).
--
-- One company pair (HEL68 Sender Co / HEL68 Receiver Co), one receiving
-- person (Receiver Rex — every case below is accepted by the same person, at
-- the receiving company, matching a realistic "one teammate triages inbound
-- requests" shape) and SIX distinct sending people — one per case, because
-- `_resolve_or_create_p2p_thread` keys a p2p thread on (relationship_id,
-- person_a_id, person_b_id): reusing one sender across two cases would make
-- the second accept ADOPT the first's p2p thread and skip its seed-message
-- insert entirely (that skip is exactly what §E tests on purpose — here it
-- would silently invalidate AC2/N4's per-case message-count assertions).
-- ============================================================================

INSERT INTO public.company (id, name, country, verification_status) VALUES
  ('70000001-0000-0000-0000-000000000000', 'HEL68 Sender Co',   'DE', 'verified'),
  ('70000002-0000-0000-0000-000000000000', 'HEL68 Receiver Co', 'DE', 'verified');

INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at) VALUES
  ('00000000-0000-0000-0000-000000000000', '71000001-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case1@example.test',
   '{"first_name":"CaseOne","last_name":"Sender","full_name":"CaseOne Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '71000002-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case2@example.test',
   '{"first_name":"CaseTwo","last_name":"Sender","full_name":"CaseTwo Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '71000003-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case3@example.test',
   '{"first_name":"CaseThree","last_name":"Sender","full_name":"CaseThree Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '71000004-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case4@example.test',
   '{"first_name":"CaseFour","last_name":"Sender","full_name":"CaseFour Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '71000005-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case5@example.test',
   '{"first_name":"CaseFive","last_name":"Sender","full_name":"CaseFive Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '71000006-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-case6@example.test',
   '{"first_name":"CaseSix","last_name":"Sender","full_name":"CaseSix Sender"}', NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000000', '72000001-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hel68-receiver@example.test',
   '{"first_name":"Receiver","last_name":"Rex","full_name":"Receiver Rex"}', NOW(), NOW());

UPDATE public.person SET company_id = '70000001-0000-0000-0000-000000000000'
 WHERE id IN ('71000001-0000-0000-0000-000000000000', '71000002-0000-0000-0000-000000000000',
              '71000003-0000-0000-0000-000000000000', '71000004-0000-0000-0000-000000000000',
              '71000005-0000-0000-0000-000000000000', '71000006-0000-0000-0000-000000000000');
UPDATE public.person SET company_id = '70000002-0000-0000-0000-000000000000'
 WHERE id = '72000001-0000-0000-0000-000000000000';

-- Case1: bare 'connect', no note — AC1's fixture (proves c2c-thread creation
-- is independent of person-addressing: no p2p thread should ever appear).
-- Case2: connect_message, a real note — AC2's connect_message wording +
-- Invariant 8 (both an intro and a note line land, orderable).
-- Case3: pricelist_request — AC2's pricelist_request wording (never gets a
-- note row, regardless of whether note is set — the plan's `case v_item.type`
-- branch has no note-insert arm for this type at all).
-- Case4/5/6: connect_message with note = NULL / whitespace-only / padded —
-- the N4 btrim fix's three cases.
INSERT INTO public.pending_inbox_item (id, type, sender_person_id, sender_company_id, receiver_company_id, note) VALUES
  ('7a000001-0000-0000-0000-000000000000', 'connect',
   '71000001-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', NULL),
  ('7a000002-0000-0000-0000-000000000000', 'connect_message',
   '71000002-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', 'Case2 note: a real note to connect on.'),
  ('7a000003-0000-0000-0000-000000000000', 'pricelist_request',
   '71000003-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', NULL),
  ('7a000004-0000-0000-0000-000000000000', 'connect_message',
   '71000004-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', NULL),
  ('7a000005-0000-0000-0000-000000000000', 'connect_message',
   '71000005-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', E'\n\t '),
  ('7a000006-0000-0000-0000-000000000000', 'connect_message',
   '71000006-0000-0000-0000-000000000000', '70000001-0000-0000-0000-000000000000',
   '70000002-0000-0000-0000-000000000000', '  hi  ');

-- ── D1 (AC1): a fresh, never-before-connected accept creates a c2c
-- chat_thread row for the relationship, checkable immediately after the RPC
-- returns — no deal needs to be sent, no note, no p2p addressing at all. ──
SELECT set_config('request.jwt.claims', json_build_object('sub', '72000001-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_ac1 ON COMMIT DROP AS
SELECT relationship_id, c2c_thread_id, p2p_thread_id
  FROM public.accept_connection_request('7a000001-0000-0000-0000-000000000000');
RESET ROLE;

DO $$
DECLARE
  v_rel   uuid;
  v_c2c   uuid;
  v_count int;
BEGIN
  SELECT relationship_id, c2c_thread_id INTO v_rel, v_c2c FROM _hel68_ac1;
  IF v_rel IS NULL THEN
    RAISE EXCEPTION 'D1/AC1 FAIL: accept_connection_request returned relationship_id = NULL on a fresh accept';
  END IF;
  IF v_c2c IS NULL THEN
    RAISE EXCEPTION 'D1/AC1 FAIL: accept_connection_request returned c2c_thread_id = NULL on a fresh accept';
  END IF;
  IF (SELECT p2p_thread_id FROM _hel68_ac1) IS NOT NULL THEN
    RAISE EXCEPTION 'D1/AC1 FAIL: a bare ''connect'' accept (no person-addressing) minted a p2p thread — this case is only valid if c2c-thread creation is independent of p2p';
  END IF;

  SELECT count(*) INTO v_count FROM public.chat_thread
   WHERE id = v_c2c AND relationship_id = v_rel AND type = 'c2c' AND deleted_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D1/AC1 FAIL: c2c_thread_id returned by the RPC does not resolve to exactly one live chat_thread row (found %)', v_count;
  END IF;
END $$;

-- ── D2 (AC2, connect_message + Invariant 8): a person-addressed accept also
-- creates a p2p chat_thread, seeded with the CORRECT type-specific intro
-- text (verbatim from the migration's SQL, not paraphrased), and — since
-- this case's note is non-blank — the intro's created_at sorts strictly
-- before the requester's own note line's created_at. Sub-millisecond margin,
-- not the deleted browser code's 100ms stagger (round 3's N6): two
-- clock_timestamp() calls in the same statement's execution, so `<` is the
-- correct assertion, not `<=`. ──
SELECT set_config('request.jwt.claims', json_build_object('sub', '72000001-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_ac2cm ON COMMIT DROP AS
SELECT relationship_id, c2c_thread_id, p2p_thread_id
  FROM public.accept_connection_request('7a000002-0000-0000-0000-000000000000');
RESET ROLE;

DO $$
DECLARE
  v_p2p       uuid;
  v_body      text;
  v_count     int;
  v_intro_ts  timestamptz;
  v_note_ts   timestamptz;
BEGIN
  SELECT p2p_thread_id INTO v_p2p FROM _hel68_ac2cm;
  IF v_p2p IS NULL THEN
    RAISE EXCEPTION 'D2/AC2 FAIL: p2p_thread_id is NULL for a connect_message accept';
  END IF;

  SELECT count(*) INTO v_count FROM public.chat_thread
   WHERE id = v_p2p AND type = 'p2p' AND deleted_at IS NULL;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D2/AC2 FAIL: p2p_thread_id does not resolve to exactly one live chat_thread row (found %)', v_count;
  END IF;

  SELECT body, created_at INTO v_body, v_intro_ts FROM public.chat_message
   WHERE thread_id = v_p2p AND sender = 'sella' AND type = 'intro';
  IF v_body IS DISTINCT FROM 'CaseTwo Sender from HEL68 Sender Co wants to connect with Receiver Rex from HEL68 Receiver Co. Their note is below - take it from here.' THEN
    RAISE EXCEPTION 'D2/AC2 FAIL: connect_message intro text mismatch, got: %', v_body;
  END IF;

  SELECT created_at INTO v_note_ts FROM public.chat_message
   WHERE thread_id = v_p2p AND sender = 'person' AND type = 'message';
  IF v_note_ts IS NULL THEN
    RAISE EXCEPTION 'D2/Invariant8 FAIL: expected a requester note line in this connect_message p2p thread, found none';
  END IF;
  IF NOT (v_intro_ts < v_note_ts) THEN
    RAISE EXCEPTION 'D2/Invariant8 FAIL: intro created_at (%) does not sort strictly before the requester''s note created_at (%)', v_intro_ts, v_note_ts;
  END IF;
END $$;

-- ── D3 (AC2, pricelist_request): the OTHER type-specific intro text, and
-- confirmation that pricelist_request never gets a note row (the plan's
-- `case v_item.type` branch has no arm for it) — exactly 1 message. ──
SELECT set_config('request.jwt.claims', json_build_object('sub', '72000001-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_ac2pl ON COMMIT DROP AS
SELECT relationship_id, c2c_thread_id, p2p_thread_id
  FROM public.accept_connection_request('7a000003-0000-0000-0000-000000000000');
RESET ROLE;

DO $$
DECLARE
  v_p2p   uuid;
  v_body  text;
  v_count int;
BEGIN
  SELECT p2p_thread_id INTO v_p2p FROM _hel68_ac2pl;
  IF v_p2p IS NULL THEN
    RAISE EXCEPTION 'D3/AC2 FAIL: p2p_thread_id is NULL for a pricelist_request accept';
  END IF;

  SELECT count(*) INTO v_count FROM public.chat_message WHERE thread_id = v_p2p;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D3/AC2 FAIL: expected exactly 1 message (intro only — pricelist_request never gets a note row) in the fresh p2p thread, found %', v_count;
  END IF;

  SELECT body INTO v_body FROM public.chat_message
   WHERE thread_id = v_p2p AND sender = 'sella' AND type = 'intro';
  IF v_body IS DISTINCT FROM 'CaseThree Sender from HEL68 Sender Co is asking Receiver Rex (HEL68 Receiver Co) for a price list. Over to you both.' THEN
    RAISE EXCEPTION 'D3/AC2 FAIL: pricelist_request intro text mismatch, got: %', v_body;
  END IF;
END $$;

-- ── D4 (N4 whitespace-note fix): three accepts of a connect_message item —
-- note = NULL, note = whitespace-only (E'\n\t '), note = '  hi  ' — must end
-- with 1, 1 and 2 messages respectively (intro always; the note line only
-- when btrim(note, E' \t\n\r\f\x0B') is non-empty), and the third case's
-- note-line body must be EXACTLY 'hi' (trimmed, not '  hi  '). Postgres's
-- own trim() strips spaces only; this exercises the wider ASCII whitespace
-- set the fix actually uses. ──
SELECT set_config('request.jwt.claims', json_build_object('sub', '72000001-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_n4_null ON COMMIT DROP AS
SELECT p2p_thread_id FROM public.accept_connection_request('7a000004-0000-0000-0000-000000000000');
CREATE TEMP TABLE _hel68_n4_ws ON COMMIT DROP AS
SELECT p2p_thread_id FROM public.accept_connection_request('7a000005-0000-0000-0000-000000000000');
CREATE TEMP TABLE _hel68_n4_hi ON COMMIT DROP AS
SELECT p2p_thread_id FROM public.accept_connection_request('7a000006-0000-0000-0000-000000000000');
RESET ROLE;

DO $$
DECLARE
  v_count int;
  v_body  text;
BEGIN
  SELECT count(*) INTO v_count FROM public.chat_message WHERE thread_id = (SELECT p2p_thread_id FROM _hel68_n4_null);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D4/N4 FAIL: note=NULL — expected 1 message (intro only), found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.chat_message WHERE thread_id = (SELECT p2p_thread_id FROM _hel68_n4_ws);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'D4/N4 FAIL: note=whitespace-only — expected 1 message (intro only, btrim reduces it to empty), found %', v_count;
  END IF;

  SELECT count(*) INTO v_count FROM public.chat_message WHERE thread_id = (SELECT p2p_thread_id FROM _hel68_n4_hi);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'D4/N4 FAIL: note=''  hi  '' — expected 2 messages (intro + trimmed note), found %', v_count;
  END IF;

  SELECT body INTO v_body FROM public.chat_message
   WHERE thread_id = (SELECT p2p_thread_id FROM _hel68_n4_hi) AND sender = 'person' AND type = 'message';
  IF v_body IS DISTINCT FROM 'hi' THEN
    RAISE EXCEPTION 'D4/N4 FAIL: note=''  hi  '' — note-line body must be exactly ''hi'' (btrim''d), got: %', v_body;
  END IF;
END $$;

-- ============================================================================
-- §E — a SECOND, independent request accepted onto the
-- SAME already-connected pair (Rheinland <-> GreenLeaf, Clara -> Alice —
-- §A/§B's own pair, re-activated by §B) is the adopt path: no second c2c
-- thread, no second p2p thread, no second seed line. Deltas, not hardcoded
-- counts (supabase.md) — whatever §A/§B's own accept already seeded (under
-- the new SQL, §B's accept is itself a p2p-thread-minting event, since its
-- fixture item is type='pricelist_request') is irrelevant to this proof;
-- only the delta across THIS accept matters. Item is 'connect_message' with a
-- non-blank note specifically so a broken adopt-guard would leak the
-- strongest possible signal (both an intro AND a note line), not just one.
-- ============================================================================

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_ac3_item ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.pending_inbox_item (type, sender_person_id, sender_company_id, receiver_company_id, note)
  SELECT 'connect_message', clara, rheinland, greenleaf, 'AC3 dup: should not seed anything new'
  FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _hel68_ac3_item TO authenticated;
RESET ROLE;

CREATE TEMP TABLE _hel68_ac3_before ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.chat_thread
    WHERE relationship_id = (SELECT rel_id FROM _t) AND deleted_at IS NULL) AS threads,
  (SELECT count(*) FROM public.chat_message m
     JOIN public.chat_thread t ON t.id = m.thread_id
    WHERE t.relationship_id = (SELECT rel_id FROM _t) AND t.deleted_at IS NULL
      AND m.deleted_at IS NULL) AS messages;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE _hel68_ac3_accepted ON COMMIT DROP AS
SELECT relationship_id, c2c_thread_id, p2p_thread_id
  FROM public.accept_connection_request((SELECT id FROM _hel68_ac3_item));
RESET ROLE;

CREATE TEMP TABLE _hel68_ac3_after ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.chat_thread
    WHERE relationship_id = (SELECT rel_id FROM _t) AND deleted_at IS NULL) AS threads,
  (SELECT count(*) FROM public.chat_message m
     JOIN public.chat_thread t ON t.id = m.thread_id
    WHERE t.relationship_id = (SELECT rel_id FROM _t) AND t.deleted_at IS NULL
      AND m.deleted_at IS NULL) AS messages;

DO $$
BEGIN
  IF (SELECT relationship_id FROM _hel68_ac3_accepted) <> (SELECT rel_id FROM _t) THEN
    RAISE EXCEPTION 'E/AC3 FAIL: the duplicate accept resolved to a DIFFERENT relationship (% vs %)',
      (SELECT relationship_id FROM _hel68_ac3_accepted), (SELECT rel_id FROM _t);
  END IF;

  IF (SELECT threads FROM _hel68_ac3_after) <> (SELECT threads FROM _hel68_ac3_before) THEN
    RAISE EXCEPTION 'E/AC3 FAIL: chat_thread count for the pair changed on a duplicate accept (before %, after %)',
      (SELECT threads FROM _hel68_ac3_before), (SELECT threads FROM _hel68_ac3_after);
  END IF;
  IF (SELECT messages FROM _hel68_ac3_after) <> (SELECT messages FROM _hel68_ac3_before) THEN
    RAISE EXCEPTION 'E/AC3 FAIL: chat_message (seed-line) count for the pair changed on a duplicate accept (before %, after %)',
      (SELECT messages FROM _hel68_ac3_before), (SELECT messages FROM _hel68_ac3_after);
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'accept_connection_request status guard: ALL CELLS PASSED (A, B, C, D, E)'; END $$;

ROLLBACK;
