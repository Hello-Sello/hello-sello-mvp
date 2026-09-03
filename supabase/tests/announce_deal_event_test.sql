-- ============================================================================
-- announce_deal_event_test.sql — HEL-84 §12 addendum
-- ----------------------------------------------------------------------------
-- Proves: `announce_deal_event`, the SECURITY DEFINER RPC that replaces the
-- client-writable four-type exemption `msg_all` used to carry (§12.2 of
-- docs/muskan-build/0026-relationship-write-gate/PLAN-HEL-84.md). This is
-- BRAND NEW attack surface — a definer bypasses RLS entirely and must
-- perform its own authorization — so this suite is security-review shaped:
-- every refusal path is proven, not just the happy path.
--
-- ⚠️  RED-FIRST: public.announce_deal_event does not exist on this branch yet
-- — every cell below fails to even resolve the function until <ts>_
-- announce_deal_event.sql (§12.2) lands. That failure to resolve IS the
-- reproduction.
--
-- Run:  bash supabase/tests/run_announce_deal_event_test.sh
--
-- Fixture: GreenLeaf Cultivation <-> StonePharm (Alice/Bob), the seeded
-- relationship + its seeded p2p thread (seed.sql §5d). This suite mints its
-- OWN deal_card + its own 'deal' chat_thread PRIVILEGED (matching deliver_
-- deal_test.sql's own _cards idiom) — no seeded deal_card is reused, so this
-- suite owns its fixture end to end and can't be broken by another suite's
-- card, and status is 'negotiation' (announce_deal_event has no deal_card.
-- status check of its own — §12.3's own ruling; that guard is client-side in
-- proposeDealChange, not this suite's concern). Clara @ Rheinland Apotheke is
-- a genuine THIRD-company caller — a party to a DIFFERENT relationship, never
-- to this one.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033 / HEL-73) —
-- including the two ephemeral rows this suite mints (a second p2p thread for
-- §E, a company-less person for §B) — both roll back with everything else.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id                                                    AS alice,
  (SELECT company_id FROM public.person WHERE id = a.id)  AS greenleaf,
  b.id                                                    AS bob,
  (SELECT company_id FROM public.person WHERE id = b.id)  AS stonepharm,
  (SELECT id FROM auth.users WHERE email = 'clara@rheinland.test') AS clara
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
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: Alice/GreenLeaf<->StonePharm relationship not found — seed drift';
  END IF;
  IF (SELECT clara FROM _fix) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: Clara (clara@rheinland.test) not found — seed drift';
  END IF;
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
END $$;

-- This suite's OWN deal_card + its own 'deal' chat_thread, minted
-- PRIVILEGED (runs before any SET LOCAL ROLE below, so it executes as the
-- connecting superuser — same idiom deliver_deal_test.sql's own _cards/_sent
-- fixtures use for privileged inserts). id = the deal_card id (what the RPC's
-- p_deal_card_id argument takes); deal_thread = the 'deal' chat_thread's own
-- id (one of the two targets §12.2's RPC writes into); workspace = this
-- card's own deal_workspace id (security re-check finding, F1 fix — every
-- real deal_card has one, minted by create_deal_draft; a raw INSERT skips
-- it, which silently made every §D/§E cell below vacuous once the F1 fix
-- landed — announce_deal_event's deal-thread arm now requires a readable
-- workspace to exist at all, so this fixture must mint one too).
-- Defaults to 'company_wide' (the table's own DEFAULT), matching the
-- ordinary case every existing cell exercises; §G below flips it private.
CREATE TEMP TABLE _card (id uuid, deal_thread uuid, workspace uuid) ON COMMIT DROP;
WITH card AS (
  INSERT INTO public.deal_card (relationship_id, status, deal_type, initiating_company_id, currency)
  SELECT rel_id, 'negotiation', 'offer', f.greenleaf, 'EUR'
  FROM _rel, _fix f
  RETURNING id
),
ws AS (
  INSERT INTO public.deal_workspace (deal_card_id)
  SELECT card.id FROM card
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
  IF (SELECT count(*) FROM _card) <> 1 OR (SELECT id FROM _card) IS NULL
     OR (SELECT deal_thread FROM _card) IS NULL OR (SELECT workspace FROM _card) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: failed to mint this suite''s own deal_card + workspace + deal thread';
  END IF;
END $$;

-- Alice<->Bob's SEEDED p2p thread on this relationship, resolved dynamically
-- (never hardcoded — chat_thread.id is gen_random_uuid()). This is "Alice's
-- own pair" for §E's multi-pair regression guard below.
CREATE TEMP TABLE _p2p ON COMMIT DROP AS
SELECT ct.id AS thread_id
FROM public.chat_thread ct, _fix f
WHERE ct.type = 'p2p' AND ct.relationship_id = (SELECT rel_id FROM _rel)
  AND ct.person_a_id IN (f.alice, f.bob) AND ct.person_b_id IN (f.alice, f.bob)
  AND ct.person_a_id <> ct.person_b_id;
GRANT SELECT ON _p2p TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _p2p) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: the seeded Alice<->Bob p2p thread on GreenLeaf<->StonePharm is missing — seed drift';
  END IF;
END $$;

-- ============================================================================
-- §A — a NON-party (Clara, a genuine third-company caller — a party to
--      GreenLeaf<->Rheinland, never to GreenLeaf<->StonePharm) calling
--      announce_deal_event on this suite's deal → refused, message names
--      "not a party". This is the actual authorization check a SECURITY
--      DEFINER function must perform ITSELF (§12.2's own comment): it
--      bypasses RLS entirely and inherits no predicate from msg_all.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', clara, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_signed');
    RAISE EXCEPTION 'A1/non-party: a non-party (Clara) announced an event on a deal she has no relationship to, and it succeeded';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'A1/non-party%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%not a party%' THEN
        RAISE EXCEPTION 'A1/non-party: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §B — a company-less signed-in caller (a real, reachable v0 state —
--      person.company_id is nullable by design, true of every user between
--      signup and company onboarding) → refused, the SAME "not a party"
--      text, not a silent pass. DISTINCT from §A: §12.2's own comment names
--      this as its own disjunct on purpose (`v_company IS NULL` checked
--      separately, not folded into `v_company NOT IN (...)`) — because `NULL
--      NOT IN (a, b)` evaluates to NULL, which an `IF` treats as false, a
--      combined predicate would silently fail OPEN for exactly this caller.
--      Same class of bug §1's assert_relationship_writable had before its
--      own round-3 fix (assert_relationship_writable_test.sql §E).
-- ============================================================================
CREATE TEMP TABLE _companyless ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'hel84-announce-companyless@example.test',
          '{"first_name":"NoCompany","last_name":"Yet","full_name":"NoCompany Yet"}', NOW(), NOW())
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _companyless TO authenticated;

DO $$
BEGIN
  IF (SELECT company_id FROM public.person WHERE id = (SELECT id FROM _companyless)) IS NOT NULL THEN
    RAISE EXCEPTION 'FIXTURE: the freshly-minted company-less person unexpectedly already has a company_id — handle_new_user() no longer leaves it NULL';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _companyless), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_signed');
    RAISE EXCEPTION 'B1/companyless: a company-less signed-in caller announced an event and it succeeded — a fail-open regression';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'B1/companyless%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%not a party%' THEN
        RAISE EXCEPTION 'B1/companyless: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — an invalid p_type value → refused. Proves the type allow-list lives
--      INSIDE the RPC (§12.2's own comment: "the actual fix") and is real,
--      not decorative — a caller cannot launder arbitrary chat content
--      through this door by passing a type outside the four-member union.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.announce_deal_event((SELECT id FROM _card), 'not_a_real_type');
    RAISE EXCEPTION 'C1/bad-type: an unsupported p_type value was accepted';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'C1/bad-type%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%unsupported type%' THEN
        RAISE EXCEPTION 'C1/bad-type: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — a genuine party (Alice) calling with each of the 4 valid types → BOTH
--      threads that exist for this card (the 'deal' thread + Alice's own
--      p2p thread) receive one sender='sella' row apiece, body composed
--      SERVER-SIDE (never client-supplied — the actual fix: the deleted
--      client-side announceDealEvent took a client-composed body string;
--      the RPC composes it itself from `person.first_name`/`last_name` or
--      the fixed lifecycle text, per §12.2).
-- ============================================================================
-- BASELINE FIRST (2026-09-03). §D2 below used to assert a HARDCODED 4 against
-- the SEEDED Alice<->Bob p2p thread, which this suite does not own. Any
-- committed write of a lifecycle pill into that thread broke it — and
-- `e2e/deal-change.spec.ts` does exactly that, deliberately ("propose-pill",
-- "negotiate-pill-keeps-change"), through Playwright's own connection, which
-- COMMITS. So the suite was green or red depending on whether that spec had run
-- since the last `db reset`. Caught when it went red at 6.
--
-- This is `.claude/rules/supabase.md`'s own rule — "assert a delta, not a
-- hardcoded count, so seed changes cannot break the test" — and the L-033 /
-- HEL-73 family. §D1 keeps its absolute 4 legitimately: its thread is minted by
-- THIS transaction and starts empty, so the absolute count IS the delta.
CREATE TEMP TABLE _d_base ON COMMIT DROP AS
SELECT count(*) AS n_p2p FROM public.chat_message
WHERE thread_id = (SELECT thread_id FROM _p2p) AND sender = 'sella'
  AND type IN ('deal_signed','deal_cancelled','deal_change_proposed','deal_negotiation_requested');

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_type text;
BEGIN
  FOREACH v_type IN ARRAY ARRAY['deal_signed','deal_cancelled','deal_change_proposed','deal_negotiation_requested'] LOOP
    PERFORM public.announce_deal_event((SELECT id FROM _card), v_type);
  END LOOP;
END $$;
RESET ROLE;

DO $$
DECLARE v_n_deal int; v_n_p2p int; v_body text;
BEGIN
  SELECT count(*) INTO v_n_deal FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND sender = 'sella'
    AND type IN ('deal_signed','deal_cancelled','deal_change_proposed','deal_negotiation_requested');
  IF v_n_deal <> 4 THEN
    RAISE EXCEPTION 'D1/deal-thread FAIL: expected 4 sella rows in the deal thread, got %', v_n_deal;
  END IF;

  SELECT count(*) INTO v_n_p2p FROM public.chat_message
  WHERE thread_id = (SELECT thread_id FROM _p2p) AND sender = 'sella'
    AND type IN ('deal_signed','deal_cancelled','deal_change_proposed','deal_negotiation_requested');
  IF v_n_p2p - (SELECT n_p2p FROM _d_base) <> 4 THEN
    RAISE EXCEPTION 'D2/p2p-thread FAIL: expected §D to add 4 sella rows to Alice''s own p2p thread, added % (baseline %, now %)',
      v_n_p2p - (SELECT n_p2p FROM _d_base), (SELECT n_p2p FROM _d_base), v_n_p2p;
  END IF;

  SELECT body INTO v_body FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND type = 'deal_signed' AND sender = 'sella';
  IF v_body <> 'Deal signed - the deal is confirmed.' THEN
    RAISE EXCEPTION 'D3/body FAIL: deal_signed body was not the server-composed fixed text, got %', v_body;
  END IF;

  SELECT body INTO v_body FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND type = 'deal_cancelled' AND sender = 'sella';
  IF v_body <> 'Deal declined - the deal is closed.' THEN
    RAISE EXCEPTION 'D4/body FAIL: deal_cancelled body was not the server-composed fixed text, got %', v_body;
  END IF;

  -- Alice Green (seed.sql:51) — the name half is composed server-side from
  -- person.first_name/last_name, not passed in by the caller.
  SELECT body INTO v_body FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND type = 'deal_change_proposed' AND sender = 'sella';
  IF v_body <> 'Alice Green proposed a change' THEN
    RAISE EXCEPTION 'D5/body FAIL: deal_change_proposed body was not the server-composed name+text, got %', v_body;
  END IF;

  SELECT body INTO v_body FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND type = 'deal_negotiation_requested' AND sender = 'sella';
  IF v_body <> 'Alice Green wants to negotiate' THEN
    RAISE EXCEPTION 'D6/body FAIL: deal_negotiation_requested body was not the server-composed name+text, got %', v_body;
  END IF;
END $$;

-- ============================================================================
-- §E — REGRESSION GUARD for plan-checker's own B2 finding (§12.2's own
--      comment): a relationship with TWO p2p threads (two distinct person
--      pairs) must land the announcement in the CALLING person's own pair,
--      never the other one. A SECURITY DEFINER function sees EVERY p2p
--      thread on the relationship (not just the ones RLS would show a real
--      `authenticated` caller) — the original draft matched ANY p2p thread
--      unordered, which would silently post into a private 1:1 between two
--      OTHER people while the actor's own channel got nothing. Silent in
--      every OTHER suite in this repo because the seeded fixtures only ever
--      have one p2p thread per relationship — this cell mints a second one
--      on purpose (Bob<->Clara — neither end is Alice) to force the case.
-- ============================================================================
CREATE TEMP TABLE _otherpair ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.chat_thread (relationship_id, type, person_a_id, person_b_id)
  SELECT (SELECT rel_id FROM _rel), 'p2p', least(bob, clara), greatest(bob, clara) FROM _fix
  RETURNING id
)
SELECT id AS thread_id FROM ins;
GRANT SELECT ON _otherpair TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _otherpair) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: failed to mint the second (Bob<->Clara) p2p thread for §E';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_signed');
END $$;
RESET ROLE;

DO $$
DECLARE v_own int; v_other int;
BEGIN
  -- 2 = 1 from §D's own pass over the 4 types + 1 from this cell — the SAME
  -- pair (Alice<->Bob), never the Bob<->Clara pair minted just above.
  SELECT count(*) INTO v_own FROM public.chat_message
  WHERE thread_id = (SELECT thread_id FROM _p2p) AND sender = 'sella' AND type = 'deal_signed';
  IF v_own <> 2 THEN
    RAISE EXCEPTION 'E1/own-pair FAIL: expected 2 deal_signed rows in Alice''s own p2p thread (1 from §D + 1 from this cell), got %', v_own;
  END IF;

  SELECT count(*) INTO v_other FROM public.chat_message WHERE thread_id = (SELECT thread_id FROM _otherpair);
  IF v_other <> 0 THEN
    RAISE EXCEPTION 'E2/other-pair FAIL: the announcement landed in the Bob<->Clara pair Alice is not part of — got % rows (the exact plan-checker B2 regression)', v_other;
  END IF;
END $$;

-- ============================================================================
-- §G — REGRESSION GUARD for the post-build security re-check's own blocking
--      finding (F1): the party check re-imported msg_all's RELATIONSHIP
--      clause but dropped can_access_thread's `deal` arm, which is
--      WORKSPACE-scoped, not relationship-scoped. A relationship member who
--      is a company colleague but NOT a deal_workspace member must be
--      refused from writing into a PRIVATE deal thread — live-proven
--      exploitable before the fix (a second GreenLeaf person posted into a
--      private workspace she could not even read). Dana is minted as a
--      GreenLeaf colleague (same company as Alice, genuine relationship
--      member) who is never added as a deal_member — the exact population
--      the fix closes. This suite's own workspace defaults to
--      'company_wide' (every other cell above relies on that), so this
--      cell flips it 'private' first, then restores it — must NOT be the
--      suite's last cell, unlike §F (which deliberately leaves its own
--      flip in place through ROLLBACK).
-- ============================================================================
CREATE TEMP TABLE _dana ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO auth.users (instance_id, id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          'hel84-announce-dana@example.test',
          '{"first_name":"Dana","last_name":"Colleague","full_name":"Dana Colleague"}', NOW(), NOW())
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _dana TO authenticated;

UPDATE public.person SET company_id = (SELECT greenleaf FROM _fix) WHERE id = (SELECT id FROM _dana);
UPDATE public.deal_workspace SET visibility = 'private' WHERE id = (SELECT workspace FROM _card);

DO $$
BEGIN
  IF (SELECT company_id FROM public.person WHERE id = (SELECT id FROM _dana)) IS DISTINCT FROM (SELECT greenleaf FROM _fix) THEN
    RAISE EXCEPTION 'FIXTURE: Dana is not at GreenLeaf — the membership predicate would refuse for the wrong reason';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deal_member m WHERE m.deal_workspace_id = (SELECT workspace FROM _card) AND m.person_id = (SELECT id FROM _dana) AND m.removed_at IS NULL) THEN
    RAISE EXCEPTION 'FIXTURE: Dana is unexpectedly already a deal_member — the negative case can''t be tested';
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _dana), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.chat_message WHERE thread_id = (SELECT deal_thread FROM _card);
  PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_signed');
  SELECT count(*) INTO v_after FROM public.chat_message WHERE thread_id = (SELECT deal_thread FROM _card);
  IF v_after > v_before THEN
    RAISE EXCEPTION 'G1/private-workspace FAIL: Dana (a relationship member, not a deal_member) wrote into a PRIVATE deal thread — before=%, after=% (the exact post-build security-re-check regression)', v_before, v_after;
  END IF;
END $$;
RESET ROLE;

-- Restore company_wide before §D's own row counts get re-checked or §F runs
-- — this cell is not this suite's last, unlike §F which deliberately keeps
-- its own state change through ROLLBACK.
UPDATE public.deal_workspace SET visibility = 'company_wide' WHERE id = (SELECT workspace FROM _card);

-- Control: a genuine relationship member DOES still get through once the
-- workspace goes back to company_wide — proves §G refused on WORKSPACE
-- membership specifically, not by accident (e.g. a stale role/claim from
-- the block above leaking through).
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', id, 'role', 'authenticated')::text FROM _dana), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.chat_message WHERE thread_id = (SELECT deal_thread FROM _card);
  PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_signed');
  SELECT count(*) INTO v_after FROM public.chat_message WHERE thread_id = (SELECT deal_thread FROM _card);
  IF v_after <> v_before + 1 THEN
    RAISE EXCEPTION 'G2/company-wide-control FAIL: Dana was refused even on a company_wide workspace — the fix over-restricts, before=%, after=%', v_before, v_after;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §F (ADR Invariant 16 — the whole reason this addendum exists) — on a
--     SUSPENDED relationship, a genuine party calling with a valid type
--     STILL SUCCEEDS. Without this cell, a future reader could "fix" this
--     RPC by adding an assert_relationship_writable call and silently
--     re-break the ruling this whole addendum protects (§12.2's own
--     membership-not-liveness comment: "moving the insert server-side must
--     NOT silently re-impose the gate this addendum exists to keep
--     exempt"). Last cell before ROLLBACK — the flip persists for the rest
--     of this transaction, and every case above already ran.
-- ============================================================================
RESET ROLE;
UPDATE public.relationship SET status = 'suspended' WHERE id = (SELECT rel_id FROM _rel);
DO $$
BEGIN
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel)) <> 'suspended' THEN
    RAISE EXCEPTION 'F0/flip FAIL: relationship status is % after the UPDATE, expected suspended',
      (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _rel));
  END IF;
END $$;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _fix), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM public.announce_deal_event((SELECT id FROM _card), 'deal_cancelled');
END $$;
RESET ROLE;

DO $$
DECLARE v_n int;
BEGIN
  -- 2 = 1 from §D's own pass over the 4 types (while still active) + 1 from
  -- this call (now suspended) — the delta IS the proof this call landed a
  -- NEW row rather than the count vacuously matching an earlier cell's.
  SELECT count(*) INTO v_n FROM public.chat_message
  WHERE thread_id = (SELECT deal_thread FROM _card) AND sender = 'sella' AND type = 'deal_cancelled';
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'F1/exemption FAIL: announce_deal_event did not post on a SUSPENDED relationship — ADR Invariant 16''s exemption regressed, got % deal_cancelled rows (expected 2: 1 from §D + 1 from this cell)', v_n;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'announce_deal_event: ALL CELLS PASSED (A non-party, B companyless, C bad-type, D happy-path x4/both-threads, E multi-pair regression guard, F suspended-relationship exemption, G private-workspace regression guard + company-wide control)'; END $$;

ROLLBACK;
