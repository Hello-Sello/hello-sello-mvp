-- ============================================================================
-- request_product_pricing_c2c_test.sql
-- ----------------------------------------------------------------------------
-- T02 (0027-retire-connect-inbox, DEV-170): proves the NEW RPC
-- `public.request_product_pricing_c2c(p_receiver_company_id uuid, p_product_id
-- uuid)`'s OWN behavior — I-M4 (relationship existence vs liveness are two
-- separate gates, round 1's N2), I-M12 (anon/PUBLIC EXECUTE both refused),
-- I-M13 (per-COMPANY, not per-person, dup-guard — round 1's B3), and the
-- CONNECTED half of I-M3 (a connected pricing ask posts to chat and cuts no
-- ticket). See PLAN-T02.md File 3 for the six assertions this suite proves.
--
-- WHAT THIS SUITE DOES NOT PROVE (round 1's N5, named so a future reader
-- doesn't over-read a green run): `requestProductPricing` (the TS server
-- action) is never invoked here — it is a "use server" function, not
-- SQL-callable. The UNCONNECTED half of I-M3 (createPairInboxItem's ticket
-- path, unchanged) and the TS-level branch-on-is_connected_to_company
-- (including its fail-closed-on-query-error case) are
-- `requestProductPricing.gate.test.ts`'s job (PLAN-T02.md File 4), not this
-- file's.
--
-- FIXTURE NOTE — WHY A PRODUCT IS INSERTED INSIDE THE TRANSACTION, NOT REUSED
-- FROM SEED: seed.sql seeds catalogue rows ONLY for GreenLeaf
-- (aaaaaaaa-...), section 6a (seed.sql:385-409). StonePharm
-- (bbbbbbbb-...) owns ZERO seeded products. PLAN-T02.md's own fixture
-- language for this suite ("Alice -> StonePharm's product" for the connected
-- ask, "Alice, then Carla — both GreenLeaf" for the two-different-people
-- dedup case) requires the ASKED-ABOUT product to belong to StonePharm, so
-- that GreenLeaf people (who are NOT the product's own company) may legally
-- ask about it — the RPC's step 3 refuses a same-company ask outright. Two
-- GreenLeaf people exist for the dedup case (Alice, Carla — seed.sql:113-149);
-- StonePharm seeds only ONE person (Bob), so the sender side of that case
-- could never be StonePharm regardless of product ownership. A single
-- price_public=false product is therefore inserted for StonePharm below,
-- INSIDE this transaction (rolled back at the end — the zero-mutation
-- fixture pattern, supabase.md), as the connecting role (service voice,
-- bypasses RLS) — the same convention T01's suite uses for its `_msg` row.
--
-- ORDERING (assertion §F below): the shipped migration captures a single
-- `v_now := clock_timestamp()` before step 8's healing insert, uses `v_now`
-- for step 8's `created_at`, and `v_now + interval '1 millisecond'` for step
-- 11's — the exact technique `accept_connection_request` uses for its own
-- two same-transaction inserts (`20260826100000:222-229`). §F's "healing row
-- dated strictly before the pricing message" assertion is proven by that
-- explicit offset, not by clock_timestamp() chance (review round 1's Fix 2
-- closed the earlier gap where each insert called clock_timestamp() bare).
--
-- Run:  bash supabase/tests/run_request_product_pricing_c2c_test.sh
--
-- Fixture: the seeded GreenLeaf<->StonePharm relationship + c2c thread
-- (seed.sql:308-321 — the SAME pair T01's suite uses, on the same thread
-- type; sequential BEGIN...ROLLBACK suites don't collide, and neither suite
-- leaves the pair suspended past its own transaction, so no cross-suite
-- ordering is assumed). Alice (1111...), Carla (3333..., a SECOND GreenLeaf
-- person, seed.sql:113-149) and Bob (2222...) are all seeded persons; the HS
-- reviewer (9999...) suspends/reactivates. GreenLeaf<->NordCanna (no
-- `relationship` row exists anywhere in seed.sql for that pair — only a
-- `pending_inbox_item` toward GreenLeaf, seed.sql:362-374) is the negative
-- fixture for assertion §B.
--
-- Shape: one BEGIN…ROLLBACK, zero net seed mutation (L-033) — the
-- in-transaction fixture product rolls back with everything else.
--
-- EXPECTED TO BE RED against the unmodified live schema: the function
-- `public.request_product_pricing_c2c` does not exist at all yet (this
-- suite's entire subject is PLAN-T02.md File 1, not yet built). The suite
-- fails at §E, its very FIRST assertion, before any RPC is ever called:
-- `has_function_privilege('anon', 'public.request_product_pricing_c2c(uuid,
-- uuid)', 'EXECUTE')` casts that signature string to `regprocedure`
-- internally, and that cast itself raises `function
-- public.request_product_pricing_c2c(uuid, uuid) does not exist` when the
-- function is genuinely absent — it does not degrade to a graceful `false`.
-- With `ON_ERROR_STOP=1` that single error halts the whole script; every
-- assertion after §E never runs at all on this build. Nothing in this file
-- modifies a migration to make it pass — that is the builder's job next.
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ----------------------------------------------------------------------------
-- Fixture — seeded parties/thread, guarded, + one in-transaction StonePharm
-- product (see header for why it can't come from seed.sql).
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _t ON COMMIT DROP AS
SELECT
  ct.id                                            AS thread_id,
  ct.relationship_id                                AS rel_id,
  '11111111-1111-1111-1111-111111111111'::uuid     AS alice,
  '22222222-2222-2222-2222-222222222222'::uuid     AS bob,
  '33333333-3333-3333-3333-333333333333'::uuid     AS carla,
  '99999999-9999-9999-9999-999999999999'::uuid     AS hsteam,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid      AS greenleaf,
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid      AS stonepharm,
  (SELECT id FROM public.company WHERE name = 'NordCanna Distribution GmbH') AS nordcanna
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
  IF (SELECT status FROM public.relationship WHERE id = (SELECT rel_id FROM _t)) <> 'active' THEN
    RAISE EXCEPTION 'FIXTURE: relationship is not active at suite start — a prior suite left it dirty';
  END IF;
  IF (SELECT nordcanna FROM _t) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: NordCanna Distribution GmbH not found — seed drift';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.relationship r, _t
    WHERE r.company_a_id = least(_t.greenleaf, _t.nordcanna)
      AND r.company_b_id = greatest(_t.greenleaf, _t.nordcanna)
      AND r.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FIXTURE: GreenLeaf<->NordCanna already has a relationship row — assertion B''s negative case needs none at all';
  END IF;
END $$;

-- The asked-about product. StonePharm owns zero seeded products (only
-- GreenLeaf's catalogue is seeded) — inserted here, as the connecting role
-- (service voice, bypasses RLS the same way T01's `_msg` fixture does), and
-- rolled back with everything else. price_public and profile_visible both
-- default to false (20260609210000:34, 20260614140000:19) — left unset
-- deliberately so the RPC's own price-gate check (plan step 6) is exercised
-- against a REAL column default, not a hand-picked value. profile_visible
-- staying false is fine for a CONNECTED caller: `product_visible_to_caller`'s
-- buyer arm admits on `profile_visible OR is_connected_to_company(...)`, and
-- Alice/Carla are genuinely connected to StonePharm via the seeded
-- relationship. `location`, however, MUST be set (review round 1, security
-- F1) — step 6 now calls `product_visible_to_caller`, and its "unfiled is
-- not a shelf" rule (`20260825110000:121-126`) refuses any product with
-- `location IS NULL` outright, seller-side visibility aside.
CREATE TEMP TABLE _prod ON COMMIT DROP AS
WITH ins AS (
  INSERT INTO public.product (company_id, name, location)
  SELECT stonepharm, 'StonePharm Fixture Product', 'StonePharm Warehouse' FROM _t
  RETURNING id
)
SELECT id FROM ins;
GRANT SELECT ON _prod TO authenticated;

DO $$
BEGIN
  IF (SELECT price_public FROM public.product WHERE id = (SELECT id FROM _prod)) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'FIXTURE: the StonePharm fixture product is not price_public=false — has the column default changed?';
  END IF;
  IF (SELECT location FROM public.product WHERE id = (SELECT id FROM _prod)) IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: the StonePharm fixture product has no location — product_visible_to_caller''s unfiled rule will refuse it';
  END IF;
END $$;

-- ============================================================================
-- §E — EARS 5 / I-M12: anon AND PUBLIC both refused EXECUTE ("FROM PUBLIC is
--      load-bearing" per the ticket — a bare FROM anon would leave anon
--      inheriting through PUBLIC, 20260724121000:23-28). No fixture
--      dependency and no side effects — runs first.
-- ============================================================================
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.request_product_pricing_c2c(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'E/I-M12: anon still holds EXECUTE on request_product_pricing_c2c(uuid,uuid)';
  END IF;
  IF has_function_privilege('public', 'public.request_product_pricing_c2c(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'E/I-M12: PUBLIC still holds EXECUTE on request_product_pricing_c2c(uuid,uuid) — FROM PUBLIC is load-bearing (anon inherits through it otherwise)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.request_product_pricing_c2c(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'E/I-M12: authenticated is NOT granted EXECUTE on request_product_pricing_c2c(uuid,uuid) — nobody could call it at all';
  END IF;
END $$;

-- ============================================================================
-- §B — a company pair with NO relationship row at all raises 'relationship
--      not found' (plan step 4). Uses GreenLeaf<->NordCanna, confirmed
--      relationship-less by the fixture guard above.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_product_pricing_c2c((SELECT nordcanna FROM _t), (SELECT id FROM _prod));
    RAISE EXCEPTION 'B/no-relationship: expected a raise, RPC returned normally instead';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'B/no-relationship%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship not found%' THEN
        RAISE EXCEPTION 'B/no-relationship: refused for the WRONG reason (%)', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- ============================================================================
-- §A — EARS 1: a connected ask posts exactly one chat_message (type=
--      'message') into the existing c2c thread, cuts ZERO pending_inbox_item
--      rows, and the posted row is person-voiced with the exact
--      buildPricingRequestNote body + product_id metadata. Counted AS ALICE
--      — a genuine party to this c2c thread's relationship (L-066: a count
--      run as an actor who cannot see the rows proves nothing).
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_thread         uuid := (SELECT thread_id FROM _t);
  v_stonepharm     uuid := (SELECT stonepharm FROM _t);
  v_alice          uuid := (SELECT alice FROM _t);
  v_product        uuid := (SELECT id FROM _prod);
  v_msg_before     int;
  v_pending_before int;
  v_msg_after      int;
  v_pending_after  int;
  v_posted         boolean;
  v_sender         text;
  v_sender_person  uuid;
  v_body           text;
  v_meta           jsonb;
BEGIN
  SELECT count(*) INTO v_msg_before FROM public.chat_message
   WHERE thread_id = v_thread AND type = 'message' AND deleted_at IS NULL;
  SELECT count(*) INTO v_pending_before FROM public.pending_inbox_item
   WHERE receiver_company_id = v_stonepharm AND deleted_at IS NULL;

  SELECT public.request_product_pricing_c2c(v_stonepharm, v_product) INTO v_posted;
  IF v_posted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'A/EARS-1: expected true (a new message was posted) on the first ask, got %', v_posted;
  END IF;

  SELECT count(*) INTO v_msg_after FROM public.chat_message
   WHERE thread_id = v_thread AND type = 'message' AND deleted_at IS NULL;
  IF v_msg_after <> v_msg_before + 1 THEN
    RAISE EXCEPTION 'A/EARS-1: expected exactly one new type=message row in the c2c thread (counted as Alice), before % after %', v_msg_before, v_msg_after;
  END IF;

  SELECT count(*) INTO v_pending_after FROM public.pending_inbox_item
   WHERE receiver_company_id = v_stonepharm AND deleted_at IS NULL;
  IF v_pending_after <> v_pending_before THEN
    RAISE EXCEPTION 'A/EARS-1: StonePharm''s pending_inbox_item count moved from % to % — a ticket was cut instead of a chat post', v_pending_before, v_pending_after;
  END IF;

  SELECT sender, sender_person_id, body, metadata INTO v_sender, v_sender_person, v_body, v_meta
    FROM public.chat_message
   WHERE thread_id = v_thread AND type = 'message' AND deleted_at IS NULL
   ORDER BY created_at DESC, id DESC
   LIMIT 1;
  IF v_sender <> 'person' OR v_sender_person IS DISTINCT FROM v_alice THEN
    RAISE EXCEPTION 'A/person-voiced: expected sender=person, sender_person_id=Alice, got sender=%, sender_person_id=%', v_sender, v_sender_person;
  END IF;
  IF v_body <> 'Pricing request for "StonePharm Fixture Product".' THEN
    RAISE EXCEPTION 'A/body: expected buildPricingRequestNote''s exact sentence (pricingRequest.ts:37-41), got %', v_body;
  END IF;
  IF v_meta->>'product_id' <> v_product::text THEN
    RAISE EXCEPTION 'A/metadata: expected metadata.product_id = the asked product id, got %', v_meta->>'product_id';
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §C — EARS 3 / I-M13 (round 1's B3, the sharper of the two blocking
--      findings): the SAME ask (same product, same connected company), by a
--      DIFFERENT person at the SAME sender company (Carla, not Alice — both
--      GreenLeaf), dedupes to ZERO new messages. A person-scoped (rather than
--      company-scoped) dup-guard could not have caught this — Carla and
--      Alice are different sender_person_id values.
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', carla, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_thread     uuid := (SELECT thread_id FROM _t);
  v_stonepharm uuid := (SELECT stonepharm FROM _t);
  v_product    uuid := (SELECT id FROM _prod);
  v_posted     boolean;
  v_msg_cnt    int;
BEGIN
  SELECT public.request_product_pricing_c2c(v_stonepharm, v_product) INTO v_posted;
  IF v_posted IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'C/EARS-3: expected false (deduped) when a SECOND GreenLeaf person (Carla) re-asks the same product, got %', v_posted;
  END IF;

  SELECT count(*) INTO v_msg_cnt FROM public.chat_message
   WHERE thread_id = v_thread AND type = 'message' AND deleted_at IS NULL;
  IF v_msg_cnt <> 1 THEN
    RAISE EXCEPTION 'C/EARS-3: expected the c2c thread to still carry exactly one type=message row after the dedup''d ask (counted as Carla), found %', v_msg_cnt;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- §D — EARS 4: a suspended relationship refuses via
--      assert_relationship_writable (plan step 5) — DISTINCT wording from
--      §B's 'relationship not found', proving step 5 (liveness), not step 4
--      (existence), is what refused this time (round 1's N2: filtering
--      status='active' at step 4 would make step 5 dead code and the suite
--      could never tell which line refused).
-- ============================================================================
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.suspend_relationship((SELECT rel_id FROM _t), 'D: T02 suite — testing the liveness gate');
RESET ROLE;

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.request_product_pricing_c2c((SELECT stonepharm FROM _t), (SELECT id FROM _prod));
    RAISE EXCEPTION 'D/suspended: expected a raise, RPC returned normally instead onto a suspended relationship';
  EXCEPTION
    WHEN others THEN
      IF SQLERRM LIKE 'D/suspended%' THEN RAISE; END IF;
      IF SQLERRM NOT LIKE '%relationship is suspended%' THEN
        RAISE EXCEPTION 'D/suspended: refused for the WRONG reason (%) — expected "relationship is suspended", not a not-found', SQLERRM;
      END IF;
  END;
END $$;
RESET ROLE;

-- Reactivate — required, not just hygiene: §F below needs an ACTIVE
-- relationship for the healed-thread ask to succeed. Safe to reuse
-- GreenLeaf<->StonePharm's suspend/reactivate within this same suite — T01's
-- suite does the same on the same pair, in its own separate
-- BEGIN...ROLLBACK transaction; the two never overlap.
SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', hsteam, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
SELECT public.reactivate_relationship((SELECT rel_id FROM _t));
RESET ROLE;

-- ============================================================================
-- §F — plan step 8 (I-J6): a relationship whose c2c thread was soft-deleted
--      (simulating a pre-ADR-0007 pair that never had one) gets a FRESH
--      thread healed with a connection_established system message BEFORE the
--      pricing message — mirroring accept_connection_request's own healing
--      behavior (round 1's catch that v_created was captured and never
--      read). See the file header for a known risk on the "before" half of
--      this assertion.
-- ============================================================================
UPDATE public.chat_thread SET deleted_at = clock_timestamp()
 WHERE id = (SELECT thread_id FROM _t);

SELECT set_config('request.jwt.claims', (SELECT json_build_object('sub', alice, 'role', 'authenticated')::text FROM _t), true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_posted boolean;
BEGIN
  SELECT public.request_product_pricing_c2c((SELECT stonepharm FROM _t), (SELECT id FROM _prod)) INTO v_posted;
  IF v_posted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'F/healed: expected true (a new message was posted onto the freshly-healed thread), got %', v_posted;
  END IF;
END $$;

CREATE TEMP TABLE _new_thread ON COMMIT DROP AS
SELECT id FROM public.chat_thread
 WHERE relationship_id = (SELECT rel_id FROM _t) AND type = 'c2c' AND deleted_at IS NULL;
GRANT SELECT ON _new_thread TO authenticated;

DO $$
DECLARE
  v_new_id uuid;
  v_old_id uuid := (SELECT thread_id FROM _t);
BEGIN
  SELECT id INTO v_new_id FROM _new_thread;
  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'F/healed: no live c2c thread exists for the relationship after the ask — healing did not create one';
  END IF;
  IF v_new_id = v_old_id THEN
    RAISE EXCEPTION 'F/healed: the "new" thread has the SAME id as the soft-deleted one — the soft-delete fixture did not take';
  END IF;
END $$;

DO $$
DECLARE
  v_new_thread       uuid := (SELECT id FROM _new_thread);
  v_intro_cnt        int;
  v_msg_cnt          int;
  v_intro_sender     text;
  v_intro_sender_person uuid;
  v_intro_ts         timestamptz;
  v_msg_ts           timestamptz;
BEGIN
  SELECT count(*) INTO v_intro_cnt FROM public.chat_message
   WHERE thread_id = v_new_thread AND type = 'connection_established' AND deleted_at IS NULL;
  IF v_intro_cnt <> 1 THEN
    RAISE EXCEPTION 'F/healed: expected exactly one connection_established row in the new thread, found %', v_intro_cnt;
  END IF;

  SELECT count(*) INTO v_msg_cnt FROM public.chat_message
   WHERE thread_id = v_new_thread AND type = 'message' AND deleted_at IS NULL;
  IF v_msg_cnt <> 1 THEN
    RAISE EXCEPTION 'F/healed: expected exactly one pricing type=message row in the new thread, found %', v_msg_cnt;
  END IF;

  SELECT sender, sender_person_id, created_at INTO v_intro_sender, v_intro_sender_person, v_intro_ts
    FROM public.chat_message
   WHERE thread_id = v_new_thread AND type = 'connection_established' AND deleted_at IS NULL;
  IF v_intro_sender <> 'system' OR v_intro_sender_person IS NOT NULL THEN
    RAISE EXCEPTION 'F/healed: connection_established must be sender=system, sender_person_id=NULL, got sender=%, sender_person_id=%', v_intro_sender, v_intro_sender_person;
  END IF;

  SELECT created_at INTO v_msg_ts FROM public.chat_message
   WHERE thread_id = v_new_thread AND type = 'message' AND deleted_at IS NULL;

  -- Proven by the explicit `v_now` / `v_now + interval '1 millisecond'`
  -- offset (see file header ORDERING note), not by clock_timestamp() chance.
  IF v_intro_ts >= v_msg_ts THEN
    RAISE EXCEPTION 'F/healed: connection_established (%) is not dated BEFORE the pricing message (%)', v_intro_ts, v_msg_ts;
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'request_product_pricing_c2c: ALL CELLS PASSED (E, B, A, C, D, F)'; END $$;

ROLLBACK;
