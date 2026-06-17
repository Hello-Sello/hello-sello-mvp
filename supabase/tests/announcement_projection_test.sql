-- ============================================================================
-- announcement_projection_test.sql — the Phase 2 ANNC-01 / ANNC-02 projection invariant
-- ----------------------------------------------------------------------------
-- INVARIANT UNDER TEST (Phase 2, ANNC-01 / ANNC-02):
--   When a held change RESOLVES through confirm_deal_change, the announcement is
--   a PROJECTION of the durable log line into BOTH the card's chat threads:
--     • on COMMIT  (both sides accept): exactly ONE sender='sella'
--       'deal_card_updated' message exists in the deal thread AND ONE in the p2p
--       thread, alongside the 'Deal updated to vN' deal_card_log row, and the card
--       moved to base+1.
--     • on DECLINE: exactly ONE sender='sella' 'deal_change_declined' message in
--       the deal thread AND ONE in the p2p thread, the body carries the reason,
--       and the card did NOT move (no new deal_card_log at base+1).
--   The FIRST accept (still waiting) and a withdraw announce NOTHING (not exercised
--   here; covered by the e2e withdraw-silent guard).
--
-- SHAPE: mirrors supabase/tests/change_reason_log_test.sql + the impersonation
--   from cross_tenant_lockdown_test.sql — a single BEGIN ... ROLLBACK transaction
--   with ephemeral fixtures and NO committed trace. confirm_deal_change reads
--   auth.uid(), so we impersonate the CALLER via set_config('request.jwt.claims').
--
-- Run:  psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -f supabase/tests/announcement_projection_test.sql
--   ON_ERROR_STOP=1 is REQUIRED: without it psql skips past an error to the final
--   SELECT and prints a FALSE 'PASSED'. With it, any error aborts non-zero.
--
-- Seed actors (stable seed UUIDs):
--   GreenLeaf  company aaaa…  / Alice person 1111…  (the PROPOSER)
--   StonePharm company bbbb…  / Bob   person 2222…  (the responder / CALLER)
-- Fixtures reuse the seeded GreenLeaf↔StonePharm RELATIONSHIP; a fresh deal_card +
--   its two threads are created under it, then rolled back.
-- ============================================================================

BEGIN;

-- ── Fixtures (rolled back at the end) ────────────────────────────────────────
-- A fresh deal_card at version 1 under the seeded relationship.
INSERT INTO public.deal_card (id, relationship_id, version, deal_type, initiating_company_id, created_by)
SELECT 'dddddddd-dddd-dddd-dddd-dddddddddddd', r.id, 1, 'offer',
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       '11111111-1111-1111-1111-111111111111'
FROM public.relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- The card's DEAL thread (chat_thread_deal_has_card: a 'deal' thread needs the card).
INSERT INTO public.chat_thread (id, relationship_id, type, deal_card_id)
SELECT 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', r.id, 'deal',
       'dddddddd-dddd-dddd-dddd-dddddddddddd'
FROM public.relationship r
WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- The relationship's P2P thread already exists in the seed (one canonical p2p
-- thread per relationship, enforced by uq_chat_thread_p2p). We do NOT create one
-- here -- the RPC resolves the p2p thread by relationship_id + type='p2p', so it
-- finds the seeded one; the announcement rows it inserts are rolled back with the
-- rest. The assertions below resolve that seeded p2p thread id at runtime by the
-- relationship (never hardcoded). The p2p thread is SHARED across every deal on
-- this relationship and can already hold committed announcements from other deals
-- (e.g. a prior committed e2e run), so the p2p counts below scope to THIS test's
-- ephemeral card via metadata->>'deal_card_id'. A sender+type filter alone does
-- NOT isolate them -- a leftover decline row is also sender='sella' +
-- type='deal_change_declined' in the same thread and would inflate the count.

-- ── CASE 1: COMMIT (both accept) → 2 sella 'deal_card_updated' rows + version bump ──
-- A held change proposed by GreenLeaf/Alice, GreenLeaf already accepted (auto-accept),
-- waiting on StonePharm. Bob (the caller) accepting flips both keys → commit.
INSERT INTO public.deal_pending_change
  (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
   proposer_reason, draft, votes)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 1, 'manual',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Increase quantity to 120',
   '{"value_net": 600, "currency": "EUR", "line_items": []}'::jsonb,
   jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accept'));

-- Impersonate Bob (StonePharm) as the authenticated caller.
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- The SECOND yes → commit. Returns the new version (2).
SELECT public.confirm_deal_change(
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'accept', 'Agreed, 120 works');

DO $$
DECLARE
  v_new       int;
  v_p2p       uuid;
  v_deal_msgs int;
  v_p2p_msgs  int;
BEGIN
  -- resolve the seeded p2p thread for this relationship at runtime
  SELECT t.id INTO v_p2p
  FROM public.chat_thread t
  JOIN public.relationship r ON r.id = t.relationship_id
  WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND t.type = 'p2p' AND t.deleted_at IS NULL
  LIMIT 1;

  -- the card moved to base+1 (version 2)
  SELECT version INTO v_new FROM public.deal_card
  WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_new <> 2 THEN
    RAISE EXCEPTION 'FAIL(commit): expected card version 2 after both-accept, found %', v_new;
  END IF;

  -- exactly ONE sella 'deal_card_updated' announcement in the DEAL thread
  SELECT count(*) INTO v_deal_msgs FROM public.chat_message
  WHERE thread_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'
    AND sender = 'sella' AND type = 'deal_card_updated';
  IF v_deal_msgs <> 1 THEN
    RAISE EXCEPTION 'FAIL(commit): expected 1 sella deal_card_updated in the deal thread, found %', v_deal_msgs;
  END IF;

  -- exactly ONE in the seeded P2P thread (scoped to THIS card: the p2p thread is
  -- shared, so leftover announcements from other deals must not inflate the count)
  SELECT count(*) INTO v_p2p_msgs FROM public.chat_message
  WHERE thread_id = v_p2p
    AND sender = 'sella' AND type = 'deal_card_updated'
    AND metadata->>'deal_card_id' = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_p2p_msgs <> 1 THEN
    RAISE EXCEPTION 'FAIL(commit): expected 1 sella deal_card_updated in the p2p thread, found %', v_p2p_msgs;
  END IF;
END $$;

-- ── CASE 2: DECLINE → 2 sella 'deal_change_declined' rows + NO version bump ──
-- A fresh held change on the same card; Bob declines → reason announced, card frozen.
INSERT INTO public.deal_pending_change
  (deal_card_id, base_version, source, proposed_by_company, proposed_by_person,
   proposer_reason, draft, votes)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 2, 'manual',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
   'Try v3 at 140',
   '{"value_net": 700, "currency": "EUR", "line_items": []}'::jsonb,
   jsonb_build_object('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'accept'));

-- Bob (already impersonated) declines with a distinctive reason.
SELECT public.confirm_deal_change(
  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'decline', 'Margin too thin this quarter');

DO $$
DECLARE
  v_ver       int;
  v_p2p       uuid;
  v_deal_msgs int;
  v_p2p_msgs  int;
  v_reasoned  int;
BEGIN
  -- resolve the seeded p2p thread for this relationship at runtime
  SELECT t.id INTO v_p2p
  FROM public.chat_thread t
  JOIN public.relationship r ON r.id = t.relationship_id
  WHERE r.company_a_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    AND r.company_b_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    AND t.type = 'p2p' AND t.deleted_at IS NULL
  LIMIT 1;

  -- the card did NOT move on the decline (still version 2 from CASE 1)
  SELECT version INTO v_ver FROM public.deal_card
  WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_ver <> 2 THEN
    RAISE EXCEPTION 'FAIL(decline): the card must NOT move on a decline; expected version 2, found %', v_ver;
  END IF;

  -- no new commit log row at v3 was written
  IF (SELECT count(*) FROM public.deal_card_log
      WHERE deal_card_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' AND version = 3) <> 0 THEN
    RAISE EXCEPTION 'FAIL(decline): a decline must not write a v3 commit log row';
  END IF;

  -- exactly ONE sella 'deal_change_declined' announcement in EACH thread
  SELECT count(*) INTO v_deal_msgs FROM public.chat_message
  WHERE thread_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'
    AND sender = 'sella' AND type = 'deal_change_declined';
  IF v_deal_msgs <> 1 THEN
    RAISE EXCEPTION 'FAIL(decline): expected 1 sella deal_change_declined in the deal thread, found %', v_deal_msgs;
  END IF;

  -- scoped to THIS card (the shared p2p thread may hold leftover declines from other deals)
  SELECT count(*) INTO v_p2p_msgs FROM public.chat_message
  WHERE thread_id = v_p2p
    AND sender = 'sella' AND type = 'deal_change_declined'
    AND metadata->>'deal_card_id' = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  IF v_p2p_msgs <> 1 THEN
    RAISE EXCEPTION 'FAIL(decline): expected 1 sella deal_change_declined in the p2p thread, found %', v_p2p_msgs;
  END IF;

  -- the decline body carries the reason inline (ANNC-02)
  SELECT count(*) INTO v_reasoned FROM public.chat_message
  WHERE type = 'deal_change_declined'
    AND metadata->>'deal_card_id' = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
    AND body LIKE '%Margin too thin this quarter%';
  IF v_reasoned <> 2 THEN
    RAISE EXCEPTION 'FAIL(decline): both declined announcements must carry the reason inline, found % of 2', v_reasoned;
  END IF;
END $$;

ROLLBACK;
SELECT 'ANNOUNCEMENT PROJECTION TEST PASSED' AS result;
