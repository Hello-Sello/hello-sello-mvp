-- ============================================================================
-- send_deal_c2c_announce_test.sql — T01 (HEL-63): send_deal announces a
-- company-addressed deal in the company chat, not just the inbox
-- (ADR 0006 rev 3 · docs/muskan-build/0023-deal-draft-lands-in-chat/PLAN-T01.md §3)
-- ----------------------------------------------------------------------------
-- Today a company-addressed send_deal writes a claimable pending_inbox_item
-- ticket via deliver_deal and posts NOTHING into chat — the recipient has to
-- go hunting in /connect/inbox. This migration deletes that call and instead
-- posts the same clickable 'deal_card' pill the person-addressed arm already
-- posts, into the relationship's c2c thread (creating it if it is missing or
-- soft-deleted).
--
-- Invariants proved here (ticket ACs in brackets):
--   M1  [AC1] company-addressed send → exactly 1 chat_message, type=
--             'deal_card', in the LIVE c2c thread of the card's
--             relationship_id, sender=Alice, body="<name> has sent a deal",
--             metadata.deal_card_id = the card                        → C1
--   M2  [AC2] the same send → 0 pending_inbox_item rows for that card → C2
--   M3  [AC3] a person-addressed send → 1 pill on the p2p thread ONLY,
--             nothing new in the c2c thread                           → C3
--   M9  [AC5] the receiving company's member can SELECT the pill and the
--             deal_card/deal_line_item rows it points at, as `authenticated`
--             — not merely as the SECURITY DEFINER                    → C6
--   M10 [AC6] a THIRD company's member gets zero rows on all three reads → C7
--   M11 [AC7] `authenticated` still holds EXECUTE on send_deal(uuid)   → C8
--   M8  [AC9] deliver_deal's definition is untouched by this migration → C9
--   M4′ [AC4] a missing/soft-deleted c2c thread is healed (created) by a
--             send, and a second send on a healed thread does not mint a
--             second one                                          → C4 + C5
--   §8.3 [ADR 0006, Muskan's G3 ruling — no ticket AC number] send_deal's
--             return value is the c2c thread id for a company-addressed
--             send too, not merely non-null (the person arm was already
--             covered by deliver_deal_test.sql:248-251, case A2-3b)   → C1
--
-- Fixture: Alice @ GreenLeaf, Bob @ StonePharm, the seeded `demo-2d`
-- relationship — which has a seeded c2c thread (seed/seed.sql:321) and a
-- seeded p2p thread (seed/seed.sql:324). ⚠️ seed.sql:321 is now a fixture
-- DEPENDENCY this ADR created (M4′) — if that insert is ever removed, C4/C5
-- stop proving the "missing thread" half of M4′ and silently degrade to only
-- proving the "already exists" half.
-- Third party for C7 (M10): Clara @ Rheinland Apotheke GmbH — connected to
-- GreenLeaf (seed/seed.sql:349) but a stranger to the GreenLeaf<->StonePharm
-- card under test.
--
-- ⚠️ CASE ORDER IS LOAD-BEARING — do not reorder C4/C5 earlier. They run
-- LAST, after C6/C7. can_access_thread (20260607170000:129-144) has NO
-- deleted_at predicate on its c2c branch, so a pill in a soft-deleted thread
-- still passes RLS. Had C4 soft-deleted the seeded c2c thread before C6 ran,
-- C6 would have "proved" the recipient can read a pill in a conversation the
-- app never shows — and gone green doing it. Belt and braces on top of the
-- ordering: C6/C7 pin their thread with an explicit `deleted_at is null` and
-- select the pill by C1's own captured chat_message.id, not by re-deriving
-- "the c2c thread" (which C4 later makes ambiguous — there are two).
--
-- ⚠️ WHAT THIS SUITE DOES NOT COVER: the `on conflict do nothing` + re-select
-- path in the thread resolve-or-create (the concurrent-insert race fix) is
-- NOT exercised by any case here — every case here goes through the plain
-- SELECT branch and never collides on the unique index. That path needs a
-- two-session interleaved proof this repo has no harness for; it is
-- deliberately left to code review (critic/security), not silently assumed
-- covered by M4′.
--
-- Pattern copied from deliver_deal_test.sql (fixture idiom, identity-switch
-- shape, one BEGIN…ROLLBACK transaction, no trace left).
--
-- ⚠️ RED-FIRST: this EXITS NON-ZERO today — send_deal's company arm still
-- calls deliver_deal only; it posts no chat_message at all for a
-- company-addressed deal. Goes GREEN once
-- 20260825090000_send_deal_c2c_announce.sql lands.
--
-- Run:  bash supabase/tests/run_send_deal_c2c_announce_test.sh
-- ============================================================================

BEGIN;

-- ── Runtime fixture resolution (seeded world, demo-2d): Alice @ GreenLeaf,
-- Bob @ StonePharm, their relationship, its seeded c2c thread, and Clara (a
-- stranger to this relationship) for M10. ──
CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id AS alice,
  b.id AS bob,
  c.id AS clara,
  (SELECT company_id FROM person WHERE id = a.id) AS greenleaf,
  (SELECT company_id FROM person WHERE id = b.id) AS stonepharm
FROM auth.users a, auth.users b, auth.users c
WHERE a.email = 'alice@greenleaf.test'
  AND b.email = 'bob@stonepharm.test'
  AND c.email = 'clara@rheinland.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel
FROM relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

CREATE TEMP TABLE _c2c ON COMMIT DROP AS
SELECT t.id AS thread
FROM chat_thread t, _rel r
WHERE t.relationship_id = r.rel AND t.type = 'c2c' AND t.deleted_at IS NULL;

CREATE TEMP TABLE _cards (id uuid, kind text) ON COMMIT DROP;
CREATE TEMP TABLE _pills (id uuid, kind text) ON COMMIT DROP;
CREATE TEMP TABLE _threads (id uuid, kind text) ON COMMIT DROP;

-- the impersonated blocks below run as `authenticated`, which owns nothing —
-- grant it read (and, where it writes, insert) on the probe's own temp
-- fixtures. Mirrors deliver_deal_test.sql:52-54. (_c2c is only ever read
-- outside impersonation, so it carries no grant.)
GRANT SELECT ON _fix, _rel TO authenticated;
GRANT SELECT, INSERT ON _cards TO authenticated;
GRANT SELECT ON _pills TO authenticated;
-- INSERT only: C1 captures send_deal's return value (ADR 0006 §8.3) while
-- impersonating Alice; C4/C5's own writes to this table run privileged
-- (postgres), after RESET ROLE, so authenticated needs no SELECT on it.
GRANT INSERT ON _threads TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1
     OR (SELECT count(*) FROM _rel) <> 1
     OR (SELECT count(*) FROM _c2c) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/clara/relationship/c2c thread not found — run supabase db reset';
  END IF;
END $$;

-- ============================================================================
-- C1 [M1 / AC1, + §8.3] — a company-addressed send posts exactly one
-- 'deal_card' pill into the LIVE c2c thread of the card's relationship:
-- sender = Alice, body = "<her name> has sent a deal", metadata.deal_card_id
-- = the card. ALSO asserts send_deal's return value: not null, and equal to
-- that same c2c thread's id (ADR 0006 §8.3) — the company arm used to
-- return null; the person arm's return is already covered by
-- deliver_deal_test.sql:248-251 (case A2-3b), which made this the
-- asymmetric gap.
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, NULL);
  INSERT INTO _cards VALUES (v_card, 'c1');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
-- captured, not discarded (unlike C2/C3/C4/C5's bare calls — one good
-- assertion of the §8.3 return-value contract is enough for this suite;
-- see the case banner above).
DO $$
DECLARE
  v_returned uuid;
BEGIN
  v_returned := public.send_deal((SELECT id FROM _cards WHERE kind = 'c1'));
  INSERT INTO _threads VALUES (v_returned, 'c1_returned');
END $$;
RESET ROLE;

DO $$
DECLARE
  v_n        int;
  v_msg_id   uuid;
  v_name     text;
  v_returned uuid;
BEGIN
  SELECT nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    INTO v_name
  FROM person WHERE id = (SELECT alice FROM _fix);

  SELECT count(*) INTO v_n
  FROM chat_message m
  WHERE m.thread_id = (SELECT thread FROM _c2c)
    AND m.type = 'deal_card'
    AND m.metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'c1')::text
    AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C1/M1 FAIL: expected exactly 1 deal_card pill in the c2c thread, got %', v_n;
  END IF;

  -- §8.3: send_deal must return the id of the thread it just announced
  -- into, not merely a non-null uuid — the pill's thread is _c2c's,
  -- established by the count above.
  SELECT id INTO v_returned FROM _threads WHERE kind = 'c1_returned';
  IF v_returned IS NULL THEN
    RAISE EXCEPTION 'C1/§8.3 FAIL: send_deal returned NULL for a company-addressed send';
  END IF;
  IF v_returned <> (SELECT thread FROM _c2c) THEN
    RAISE EXCEPTION 'C1/§8.3 FAIL: send_deal returned % — expected the c2c thread it announced into (%)', v_returned, (SELECT thread FROM _c2c);
  END IF;

  SELECT m.id INTO v_msg_id
  FROM chat_message m
  WHERE m.thread_id = (SELECT thread FROM _c2c)
    AND m.type = 'deal_card'
    AND m.metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'c1')::text
    AND m.deleted_at IS NULL
  LIMIT 1;

  IF NOT EXISTS (
    SELECT 1 FROM chat_message
    WHERE id = v_msg_id
      AND sender_person_id = (SELECT alice FROM _fix)
      AND body = coalesce(v_name, 'Someone') || ' has sent a deal'
  ) THEN
    RAISE EXCEPTION 'C1/M1 FAIL: pill sender/body mismatch (name=%, id=%)', v_name, v_msg_id;
  END IF;

  -- captured for C6/C7's belt-and-braces pin, ahead of C4's soft-delete
  INSERT INTO _pills VALUES (v_msg_id, 'c1');
END $$;

-- ============================================================================
-- C2 [M2 / AC2] — that same company-addressed send creates ZERO
-- pending_inbox_item rows for the card: the inbox door stays shut.
-- ============================================================================
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM pending_inbox_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c1') AND deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C2/M2 FAIL: expected 0 pending_inbox_item rows for a company-addressed send, got %', v_n;
  END IF;
END $$;

-- ============================================================================
-- C3 [M3 / AC3] — a person-addressed send posts its pill into the p2p
-- thread ONLY. The c2c thread's message count is UNCHANGED by the send —
-- proved as a DELTA (captured immediately before the send), not against a
-- hardcoded number. seed.sql:322-323 already seeds a 'connection_established'
-- system message into this very thread at fixture creation, on top of C1's
-- pill, so the live count is never "1" — asserting a delta is both immune to
-- whatever the seed contains and closer to what M3 actually claims ("nothing
-- new"), not "some specific total".
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, (SELECT bob FROM _fix));
  INSERT INTO _cards VALUES (v_card, 'c3');
END $$;
RESET ROLE;

-- baseline, captured immediately before the send below
CREATE TEMP TABLE _c2c_baseline ON COMMIT DROP AS
SELECT count(*) AS n FROM chat_message
WHERE thread_id = (SELECT thread FROM _c2c) AND deleted_at IS NULL;

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _cards WHERE kind = 'c3'));
RESET ROLE;

DO $$
DECLARE
  v_n      int;
  v_before int;
BEGIN
  SELECT count(*) INTO v_n
  FROM chat_message m
  JOIN chat_thread t ON t.id = m.thread_id
  WHERE t.type = 'p2p' AND t.deleted_at IS NULL
    AND t.relationship_id = (SELECT rel FROM _rel)
    AND m.type = 'deal_card'
    AND m.metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'c3')::text
    AND m.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C3/M3 FAIL: expected exactly 1 deal_card pill on the p2p thread, got %', v_n;
  END IF;

  SELECT n INTO v_before FROM _c2c_baseline;
  SELECT count(*) INTO v_n
  FROM chat_message
  WHERE thread_id = (SELECT thread FROM _c2c) AND deleted_at IS NULL;
  IF v_n <> v_before THEN
    RAISE EXCEPTION 'C3/M3 FAIL: a person-addressed send must not touch the c2c thread — count was % before the send, % after', v_before, v_n;
  END IF;
END $$;

-- ============================================================================
-- C6 [M9 / AC5] — as Bob (StonePharm, the RECEIVING company), C1's pill and
-- the deal_card/deal_line_item rows it points at are SELECT-able as
-- `authenticated`, not merely as the SECURITY DEFINER. Runs BEFORE C4/C5 —
-- see the file header's case-order warning. The thread is pinned with an
-- explicit `deleted_at is null` and the pill is selected by C1's captured
-- id, belt-and-braces on top of the ordering.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM chat_message m
  JOIN chat_thread t ON t.id = m.thread_id
  WHERE m.id = (SELECT id FROM _pills WHERE kind = 'c1')
    AND t.deleted_at IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C6/M9 FAIL: the receiver could not read C1''s pill in the live c2c thread, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM deal_card
  WHERE id = (SELECT id FROM _cards WHERE kind = 'c1');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C6/M9 FAIL: the receiver could not read the deal_card, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM deal_line_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c1');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'C6/M9 FAIL: the receiver could not read the deal_line_item(s), got %', v_n;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- C7 [M10 / AC6] — the SAME three reads, as Clara (Rheinland Apotheke GmbH):
-- connected to GreenLeaf, but a stranger to the GreenLeaf<->StonePharm card.
-- Zero rows on all three. Same belt-and-braces pin as C6.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', (SELECT clara FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT clara FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_n int;
BEGIN
  SELECT count(*) INTO v_n
  FROM chat_message m
  JOIN chat_thread t ON t.id = m.thread_id
  WHERE m.id = (SELECT id FROM _pills WHERE kind = 'c1')
    AND t.deleted_at IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C7/M10 FAIL: a stranger company read C1''s pill, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM deal_card
  WHERE id = (SELECT id FROM _cards WHERE kind = 'c1');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C7/M10 FAIL: a stranger company read the deal_card, got %', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM deal_line_item
  WHERE deal_card_id = (SELECT id FROM _cards WHERE kind = 'c1');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'C7/M10 FAIL: a stranger company read the deal_line_item(s), got %', v_n;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- C8 [M11 / AC7] — `authenticated` still holds EXECUTE on send_deal(uuid)
-- after this migration (create or replace preserves it; the grant is
-- re-emitted unconditionally — belt and braces against a future drop+create,
-- whose failure mode is total: Send dies for every user).
-- ============================================================================
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.send_deal(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C8/M11 FAIL: authenticated lost EXECUTE on send_deal(uuid)';
  END IF;
END $$;

-- ============================================================================
-- C9 [M8 / AC9] — deliver_deal's definition is untouched by this migration:
-- its pending_inbox_item insert and its `if not exists` dedupe guard are
-- both still present. Whitespace-normalised + lowercased so re-indentation
-- never breaks this (same idiom as confirm_deal_change_lock_order_test.sql).
-- ============================================================================
DO $$
DECLARE
  v_def text;
BEGIN
  v_def := lower(regexp_replace(
    pg_get_functiondef('public.deliver_deal(uuid)'::regprocedure),
    '\s+', ' ', 'g'));

  IF position('insert into public.pending_inbox_item' IN v_def) = 0 THEN
    RAISE EXCEPTION 'C9/M8 FAIL: deliver_deal no longer inserts into pending_inbox_item';
  END IF;

  IF position('if not exists (select 1 from public.pending_inbox_item' IN v_def) = 0 THEN
    RAISE EXCEPTION 'C9/M8 FAIL: deliver_deal lost its idempotency guard';
  END IF;
END $$;

-- ============================================================================
-- C4 [M4′(a) / AC4] — the c2c thread is soft-deleted; a company-addressed
-- send heals it: a NEW live c2c thread is created and carries the pill.
--
-- Runs LAST, after C6/C7 — see the file header's case-order warning
-- (plan-checker finding 2). can_access_thread has no deleted_at predicate on
-- its c2c branch, so soft-deleting the thread before C6 ran would have let
-- C6 "prove" the recipient can read a pill in a thread the app never shows.
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, NULL);
  INSERT INTO _cards VALUES (v_card, 'c4');
END $$;
RESET ROLE;

-- soft-delete the LIVE c2c thread — privileged (postgres); not the surface
-- under test, so no RLS-respecting path is asserted here.
UPDATE chat_thread SET deleted_at = now() WHERE id = (SELECT thread FROM _c2c);

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _cards WHERE kind = 'c4'));
RESET ROLE;

DO $$
DECLARE
  v_threads int;
  v_thread  uuid;
  v_pills   int;
BEGIN
  SELECT count(*) INTO v_threads
  FROM chat_thread t
  WHERE t.relationship_id = (SELECT rel FROM _rel) AND t.type = 'c2c' AND t.deleted_at IS NULL;

  IF v_threads <> 1 THEN
    RAISE EXCEPTION 'C4/M4prime(a) FAIL: expected exactly 1 LIVE c2c thread after healing, got %', v_threads;
  END IF;

  -- the count above already establishes exactly 1 row, so a plain SELECT INTO
  -- is safe here — no aggregate needed. (max/min over uuid don't exist before
  -- PostgreSQL 18; this stack is 17.6.)
  SELECT t.id INTO v_thread
  FROM chat_thread t
  WHERE t.relationship_id = (SELECT rel FROM _rel) AND t.type = 'c2c' AND t.deleted_at IS NULL;

  IF v_thread = (SELECT thread FROM _c2c) THEN
    RAISE EXCEPTION 'C4/M4prime(a) FAIL: the healed thread must be a NEW row, not the soft-deleted one';
  END IF;

  SELECT count(*) INTO v_pills
  FROM chat_message m
  WHERE m.thread_id = v_thread
    AND m.type = 'deal_card'
    AND m.metadata->>'deal_card_id' = (SELECT id FROM _cards WHERE kind = 'c4')::text
    AND m.deleted_at IS NULL;
  IF v_pills <> 1 THEN
    RAISE EXCEPTION 'C4/M4prime(a) FAIL: expected the new thread to carry C4''s pill, got %', v_pills;
  END IF;

  INSERT INTO _threads VALUES (v_thread, 'c2c_healed');
END $$;

-- ============================================================================
-- C5 [M4′(b) / AC4] — a SECOND company-addressed send on the same
-- relationship must NOT mint a second thread: still exactly 1 live c2c
-- thread (the SAME one C4 healed), now carrying 2 pills (C4's + C5's). The
-- dead thread (C1's) still holds its own pill — 3 pills on the relationship
-- in total, but the count that matters is 2, scoped to the live thread
-- (plan-checker finding 5).
-- ============================================================================

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_card uuid;
BEGIN
  v_card := public.create_deal_draft(
    (SELECT rel FROM _rel), 'offer', 50, 'EUR', NULL, NULL, false,
    '[{"productName":"Probe Flower","quantity":"10","unit":"g","unitPrice":"5"}]'::jsonb,
    NULL, NULL, NULL);
  INSERT INTO _cards VALUES (v_card, 'c5');
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', (SELECT alice FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT alice FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT public.send_deal((SELECT id FROM _cards WHERE kind = 'c5'));
RESET ROLE;

DO $$
DECLARE
  v_threads int;
  v_thread  uuid;
  v_pills   int;
BEGIN
  SELECT count(*) INTO v_threads
  FROM chat_thread t
  WHERE t.relationship_id = (SELECT rel FROM _rel) AND t.type = 'c2c' AND t.deleted_at IS NULL;

  IF v_threads <> 1 THEN
    RAISE EXCEPTION 'C5/M4prime(b) FAIL: expected exactly 1 LIVE c2c thread after a second send, got %', v_threads;
  END IF;

  -- see C4's comment above: the count already establishes exactly 1 row, no
  -- aggregate needed (max/min over uuid don't exist before PostgreSQL 18).
  SELECT t.id INTO v_thread
  FROM chat_thread t
  WHERE t.relationship_id = (SELECT rel FROM _rel) AND t.type = 'c2c' AND t.deleted_at IS NULL;

  IF v_thread <> (SELECT id FROM _threads WHERE kind = 'c2c_healed') THEN
    RAISE EXCEPTION 'C5/M4prime(b) FAIL: a second send must reuse the healed thread — minted a different one instead';
  END IF;

  SELECT count(*) INTO v_pills
  FROM chat_message m
  WHERE m.thread_id = v_thread
    AND m.type = 'deal_card'
    AND m.deleted_at IS NULL;
  IF v_pills <> 2 THEN
    RAISE EXCEPTION 'C5/M4prime(b) FAIL: expected exactly 2 pills in the live c2c thread (C4 + C5), got %', v_pills;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL SEND_DEAL_C2C_ANNOUNCE TESTS PASSED' AS result;
