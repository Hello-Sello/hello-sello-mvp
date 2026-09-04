-- ============================================================================
-- pending_inbox_item_deal_card_backfill_test.sql
-- ----------------------------------------------------------------------------
-- T05 (0027-retire-connect-inbox): the backfill migration
-- (20260904090000_pending_inbox_item_deal_card_backfill.sql) resolves every
-- still-open `deal_card` ticket left behind by the (now-stopped, T01) old
-- `confirm_detected_deal` branch. It is a DML-only, single-statement
-- migration:
--
--   UPDATE public.pending_inbox_item SET status = 'accepted'
--   WHERE type = 'deal_card' AND status = 'pending' AND deleted_at IS NULL;
--
-- Proves the ticket's 3 EARS criteria:
--   1. Every pending, non-deleted `deal_card` ticket flips to `accepted`.
--   2. No non-`deal_card` pending ticket (connect / connect_message /
--      pricelist_request) is touched — the receiver-scoped pending count for
--      those types doesn't move at all across the UPDATE.
--   3. The deal itself (deal_card / deal_workspace / chat_message) that the
--      resolved ticket used to point at is untouched — this migration only
--      ever writes `pending_inbox_item.status`.
--
-- WHY SEVEN FIXTURE ROWS, NOT ONE (mirrors the plan's own table,
-- PLAN-T05.md, plus the security-review rung-2 S7 fix below): row 1 is the
-- one row every EARS criterion cares about flipping. Row 2 pins
-- `deleted_at IS NULL` — same type/status as row 1 but already soft-deleted,
-- so if that predicate were ever dropped this row would flip too and go
-- undetected without a control. Row 3 is a pre-accepted `deal_card` row,
-- proving the UPDATE is a harmless no-op on an already-resolved ticket
-- (idempotency). Rows 4-6 are one each of the three OTHER live
-- `inbox_request_type` codes, all still `pending` — the actual safety
-- mechanism (I-M5/D5) is the `type = 'deal_card'` predicate, and these
-- three prove it holds for every other type this table can carry, not just
-- one. Row 7 is a `deal_card` row at `status = 'rejected'` (not deleted) —
-- without it the `status = 'pending'` predicate is unprovable: row 3
-- ('accepted') is a no-op either way the predicate is written, so dropping
-- `status = 'pending'` from the UPDATE would silently flip a real declined
-- ticket back to 'accepted' (this happens for real — `declineItem`,
-- src/modules/connect/supabase/inbox.ts:352-356, sets a `deal_card` row to
-- `status: "rejected"` with no type filter) and every existing §A/§B/§C cell
-- would still pass. Row 7 + its own §A cell below closes that gap.
--
-- WHY THE EARS-3 FIXTURE IS BUILT WITH PLAIN INSERTS, NOT create_deal_draft
-- (plan-checker round 1, F1 — see PLAN-T05.md for the full three-count
-- proof): the RPC births `status = 'unsent'`, never `'negotiation'`; it
-- creates no thread at all, and chat_message.thread_id is NOT NULL, so
-- there is nothing to attach a probe message to; and it requires a non-null
-- auth.uid(), which this suite deliberately runs without (see the role note
-- below). Plain INSERTs sidestep all three.
--
-- ⚠️ RUN THE UPDATE AS THE CONNECTING ROLE (postgres/table owner), NOT under
-- `SET LOCAL ROLE authenticated` — deliberately, the opposite of this
-- suite's usual pattern. `inbox_update`
-- (20260724100200_inbox_person_rls.sql:29-37) restricts UPDATE to
-- `receiver_company_id = current_company_id() OR receiver_person_id =
-- auth.uid()`. Under `authenticated` this statement would silently touch
-- only a SUBSET of the fixture rows and could still read PASS on §A for
-- whichever row happens to match the session identity — a silently wrong
-- answer, not a loud failure. `postgres`, as table owner, bypasses RLS
-- entirely (no `FORCE ROW LEVEL SECURITY` exists anywhere under
-- `supabase/`) — matching what the real migration does at `db push` time.
--
-- ⚠️ THE UPDATE STATEMENT TEXT BELOW MUST STAY BYTE-IDENTICAL TO
-- supabase/migrations/20260904090000_pending_inbox_item_deal_card_backfill.sql
-- — a real, inherent coupling for testing a one-shot DML statement (not a
-- design flaw). A future editor of the migration must mirror the change
-- here too, or this suite silently drifts from what actually ships
-- (L-002's shape, one level down).
--
-- EXPECTED TO BE RED right now: the migration file this suite exercises
-- does not exist yet (that's builder's next job) and `db reset` seeds zero
-- `deal_card` pending_inbox_item rows, so nothing outside this suite's own
-- fixture rows would ever prove the UPDATE's three predicates are each
-- load-bearing. This suite fixtures its own seven rows precisely so the
-- assertions below are non-vacuous — dropping any one of the three WHERE
-- predicates in the UPDATE text below would flip a different row than
-- intended and fail a specific §A/§B cell, not merely "run without error".
--
-- Fixture: reuses the seeded GreenLeaf<->StonePharm relationship, its c2c
-- thread, and Alice (GreenLeaf)/Bob (StonePharm) person ids — the same
-- identities confirm_detected_deal_no_ticket_test.sql resolves at
-- :89-118. No new company/person/relationship/thread created.
--
-- Run:  bash supabase/tests/run_pending_inbox_item_deal_card_backfill_test.sh
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033), mirrors
-- confirm_detected_deal_no_ticket_test.sql exactly.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- Fixture — the seeded GreenLeaf<->StonePharm identities, guarded.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT
  ct.id                                            AS thread_id,
  ct.relationship_id                                AS rel_id,
  '11111111-1111-1111-1111-111111111111'::uuid     AS alice,
  '22222222-2222-2222-2222-222222222222'::uuid     AS bob,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid      AS greenleaf,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid      AS stonepharm
FROM public.chat_thread ct
JOIN public.relationship r ON r.id = ct.relationship_id
WHERE ct.type = 'c2c'
  AND r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
GRANT SELECT ON _t TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _t) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: the seeded GreenLeaf<->StonePharm c2c thread not found — seed drift';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- EARS-3 fixture — a deal_card/deal_workspace/chat_message that a resolved
-- deal_card ticket points at. Plain INSERTs (see header for why), values
-- chosen directly rather than produced by create_deal_draft.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _deal ON COMMIT DROP AS
WITH card AS (
  INSERT INTO public.deal_card (
    relationship_id, version, status, deal_type, initiating_company_id,
    currency, created_by, updated_by, metadata)
  SELECT rel_id, 1, 'negotiation', 'offer', greenleaf,
    'EUR', alice, alice,
    '{"seed":"t05-backfill-test"}'::jsonb
  FROM _t
  RETURNING id
),
ws AS (
  INSERT INTO public.deal_workspace (deal_card_id, visibility, created_by)
  SELECT card.id, 'company_wide', (SELECT alice FROM _t)
  FROM card
  RETURNING id, deal_card_id
),
msg AS (
  INSERT INTO public.chat_message (thread_id, sender, sender_person_id, type, body, metadata)
  SELECT (SELECT thread_id FROM _t), 'person', (SELECT alice FROM _t), 'message',
    'T05 backfill EARS-3 probe message', '{"seed":"t05-backfill-test"}'::jsonb
  RETURNING id
)
SELECT card.id AS card_id, ws.id AS ws_id, msg.id AS msg_id
FROM card, ws, msg;
GRANT SELECT ON _deal TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _deal) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: EARS-3 deal_card/deal_workspace/chat_message trio failed to insert';
  END IF;
END $$;

-- Snapshot the EARS-3 fixture's full content BEFORE the UPDATE, for §C.
CREATE TEMP TABLE _c_before ON COMMIT DROP AS
SELECT
  dc.id AS card_id, dc.status AS card_status, dc.deal_type AS card_deal_type,
  dc.currency AS card_currency, dc.relationship_id AS card_relationship_id,
  dc.initiating_company_id AS card_initiating_company_id, dc.updated_at AS card_updated_at,
  dw.id AS ws_id, dw.visibility AS ws_visibility, dw.deal_card_id AS ws_deal_card_id,
  dw.updated_at AS ws_updated_at,
  cm.id AS msg_id, cm.body AS msg_body, cm.sender AS msg_sender,
  cm.sender_person_id AS msg_sender_person_id, cm.type AS msg_type
FROM _deal d
JOIN public.deal_card dc ON dc.id = d.card_id
JOIN public.deal_workspace dw ON dw.id = d.ws_id
JOIN public.chat_message cm ON cm.id = d.msg_id;
GRANT SELECT ON _c_before TO authenticated;

-- ----------------------------------------------------------------------------
-- Fixture — seven pending_inbox_item rows, tagged for clean selection.
-- Alice/GreenLeaf as sender, Bob/StonePharm as receiver on all seven.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _rows ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.pending_inbox_item
    (type, sender_person_id, sender_company_id, receiver_company_id, status, deleted_at, deal_card_id, metadata)
  SELECT v.type, t.alice, t.greenleaf, t.stonepharm, v.status, v.deleted_at,
    CASE WHEN v.n = 1 THEN (SELECT card_id FROM _deal) ELSE NULL END,
    jsonb_build_object('seed', 't05-backfill-test', 'n', v.n)
  FROM _t t
  CROSS JOIN (VALUES
    (1, 'deal_card'::varchar,         'pending'::varchar,  NULL::timestamptz),
    (2, 'deal_card'::varchar,         'pending'::varchar,  now()),
    (3, 'deal_card'::varchar,         'accepted'::varchar, NULL::timestamptz),
    (4, 'connect'::varchar,           'pending'::varchar,  NULL::timestamptz),
    (5, 'connect_message'::varchar,   'pending'::varchar,  NULL::timestamptz),
    (6, 'pricelist_request'::varchar, 'pending'::varchar,  NULL::timestamptz),
    (7, 'deal_card'::varchar,         'rejected'::varchar, NULL::timestamptz)
  ) AS v(n, type, status, deleted_at)
  RETURNING id, (metadata->>'n')::int AS n
)
SELECT id, n FROM ins;
GRANT SELECT ON _rows TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _rows) <> 7 THEN
    RAISE EXCEPTION 'FIXTURE: expected 7 pending_inbox_item fixture rows, found %', (SELECT count(*) FROM _rows);
  END IF;
END $$;

-- §B snapshot — the non-deal_card pending count, BEFORE the UPDATE. Delta-
-- based (project rule: assert a delta, not a hardcoded count) so
-- pre-existing seeded pending non-deal_card rows (e.g. T03's demo fixtures)
-- can't false-positive this suite either way.
CREATE TEMP TABLE _b_before ON COMMIT DROP AS
SELECT count(*) AS cnt FROM public.pending_inbox_item
WHERE status = 'pending' AND deleted_at IS NULL AND type <> 'deal_card';
GRANT SELECT ON _b_before TO authenticated;

-- ============================================================================
-- The migration under test — byte-identical to File 1's UPDATE text. Run as
-- the connecting role (postgres), deliberately NOT under
-- `SET LOCAL ROLE authenticated` — see header.
-- ============================================================================

update public.pending_inbox_item
set status = 'accepted'
where type = 'deal_card'
  and status = 'pending'
  and deleted_at is null;

-- ============================================================================
-- §A (EARS 1, I-M5a-shaped): row 1 flips to accepted; row 2 stays pending
--      (proves deleted_at); rows 4-6 stay pending (proves type); row 7 stays
--      rejected (proves status = 'pending').
-- ============================================================================

DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 1);
  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'A/EARS-1: row 1 (pending, non-deleted, deal_card) expected accepted, found %', v_status;
  END IF;
END $$;

DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 2);
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'A/deleted_at predicate: row 2 (soft-deleted deal_card) expected to stay pending, found %', v_status;
  END IF;
END $$;

DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 4);
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'A/type predicate: row 4 (connect) expected to stay pending, found %', v_status;
  END IF;
END $$;

DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 5);
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'A/type predicate: row 5 (connect_message) expected to stay pending, found %', v_status;
  END IF;
END $$;

DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 6);
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'A/type predicate: row 6 (pricelist_request) expected to stay pending, found %', v_status;
  END IF;
END $$;

-- Row 3 (already accepted, deal_card) — idempotency: harmless re-run,
-- stays accepted.
DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 3);
  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'A/idempotency: row 3 (already accepted deal_card) expected to stay accepted, found %', v_status;
  END IF;
END $$;

-- Row 7 (rejected, deal_card, not deleted) — proves the `status = 'pending'`
-- predicate is load-bearing. A real declined ticket (declineItem,
-- src/modules/connect/supabase/inbox.ts:352-356, sets a deal_card row to
-- 'rejected' with no type filter) must never flip back to accepted here.
DO $$
DECLARE v_status varchar;
BEGIN
  SELECT status INTO v_status FROM public.pending_inbox_item
  WHERE id = (SELECT id FROM _rows WHERE n = 7);
  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'A/status predicate: row 7 (rejected deal_card) expected to stay rejected, found %', v_status;
  END IF;
END $$;

-- ============================================================================
-- §B (EARS 2, I-M5b-shaped): the non-deal_card pending count doesn't move
--      across the UPDATE — asserted as a delta, not a hardcoded count.
-- ============================================================================

DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT cnt INTO v_before FROM _b_before;
  SELECT count(*) INTO v_after FROM public.pending_inbox_item
  WHERE status = 'pending' AND deleted_at IS NULL AND type <> 'deal_card';
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'B/EARS-2: non-deal_card pending count moved from % to % — the UPDATE touched a row it should not have', v_before, v_after;
  END IF;
END $$;

-- ============================================================================
-- §C (EARS 3): the deal_card/deal_workspace/chat_message fixture that row 1
--      points at is byte-identical before/after — the UPDATE only ever
--      writes pending_inbox_item.status.
-- ============================================================================

DO $$
DECLARE
  v_before RECORD;
  v_after RECORD;
BEGIN
  SELECT * INTO v_before FROM _c_before;

  SELECT
    dc.id AS card_id, dc.status AS card_status, dc.deal_type AS card_deal_type,
    dc.currency AS card_currency, dc.relationship_id AS card_relationship_id,
    dc.initiating_company_id AS card_initiating_company_id, dc.updated_at AS card_updated_at,
    dw.id AS ws_id, dw.visibility AS ws_visibility, dw.deal_card_id AS ws_deal_card_id,
    dw.updated_at AS ws_updated_at,
    cm.id AS msg_id, cm.body AS msg_body, cm.sender AS msg_sender,
    cm.sender_person_id AS msg_sender_person_id, cm.type AS msg_type
  INTO v_after
  FROM _deal d
  JOIN public.deal_card dc ON dc.id = d.card_id
  JOIN public.deal_workspace dw ON dw.id = d.ws_id
  JOIN public.chat_message cm ON cm.id = d.msg_id;

  IF v_after.card_status IS DISTINCT FROM v_before.card_status THEN
    RAISE EXCEPTION 'C/EARS-3: deal_card.status changed — expected %, got %', v_before.card_status, v_after.card_status;
  END IF;
  IF v_after.card_updated_at IS DISTINCT FROM v_before.card_updated_at THEN
    RAISE EXCEPTION 'C/EARS-3: deal_card.updated_at changed — the UPDATE reached a row it should not have';
  END IF;
  IF v_after.card_deal_type IS DISTINCT FROM v_before.card_deal_type
    OR v_after.card_currency IS DISTINCT FROM v_before.card_currency
    OR v_after.card_relationship_id IS DISTINCT FROM v_before.card_relationship_id
    OR v_after.card_initiating_company_id IS DISTINCT FROM v_before.card_initiating_company_id THEN
    RAISE EXCEPTION 'C/EARS-3: deal_card column value changed unexpectedly';
  END IF;

  IF v_after.ws_visibility IS DISTINCT FROM v_before.ws_visibility
    OR v_after.ws_deal_card_id IS DISTINCT FROM v_before.ws_deal_card_id
    OR v_after.ws_updated_at IS DISTINCT FROM v_before.ws_updated_at THEN
    RAISE EXCEPTION 'C/EARS-3: deal_workspace column value changed unexpectedly';
  END IF;

  IF v_after.msg_body IS DISTINCT FROM v_before.msg_body
    OR v_after.msg_sender IS DISTINCT FROM v_before.msg_sender
    OR v_after.msg_sender_person_id IS DISTINCT FROM v_before.msg_sender_person_id
    OR v_after.msg_type IS DISTINCT FROM v_before.msg_type THEN
    RAISE EXCEPTION 'C/EARS-3: chat_message column value changed unexpectedly';
  END IF;
END $$;

-- Row counts unchanged too — the UPDATE created/deleted nothing.
DO $$
DECLARE v_card_count int; v_ws_count int; v_msg_count int;
BEGIN
  SELECT count(*) INTO v_card_count FROM public.deal_card WHERE id = (SELECT card_id FROM _deal);
  SELECT count(*) INTO v_ws_count FROM public.deal_workspace WHERE id = (SELECT ws_id FROM _deal);
  SELECT count(*) INTO v_msg_count FROM public.chat_message WHERE id = (SELECT msg_id FROM _deal);
  IF v_card_count <> 1 OR v_ws_count <> 1 OR v_msg_count <> 1 THEN
    RAISE EXCEPTION 'C/EARS-3: row counts for the fixture trio changed — deal_card=%, deal_workspace=%, chat_message=%', v_card_count, v_ws_count, v_msg_count;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'pending_inbox_item deal_card backfill: ALL CELLS PASSED (A, B, C)'; END $$;

ROLLBACK;
