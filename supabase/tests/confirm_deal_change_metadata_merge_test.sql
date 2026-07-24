-- ============================================================================
-- confirm_deal_change_metadata_merge_test.sql — IN-01: commit MERGES metadata
-- ----------------------------------------------------------------------------
-- Phase-12 hardening (Wave 3a). On a both-accepted commit, confirm_deal_change
-- REBUILT deal_card.metadata to just {"free_delivery":…}, blowing away every
-- other key — most importantly counterparty_person_id, the from-birth fact
-- send_deal reads to route a person-target deal. A single accepted change
-- silently orphaned the recipient.
--
-- The fix merges instead of replaces: metadata = (metadata - 'free_delivery')
-- || {free_delivery}. This proves counterparty_person_id survives a commit that
-- also sets free_delivery.
--
-- One BEGIN…ROLLBACK, runtime-resolved seed ids, impersonation via
-- request.jwt.claims + SET LOCAL ROLE, RAISE on any failed assertion.
--
-- ⚠️ RED-FIRST: fails before the IN-01 fix (commit rebuilds metadata to just
-- {free_delivery} → counterparty_person_id lost). GREEN once the merge ships in
-- 20260724120100_confirm_deal_change_negotiation_membership.sql.
--
-- Run:  bash supabase/tests/run_confirm_deal_change_metadata_merge_test.sh
-- ============================================================================

BEGIN;

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  a.id AS alice,
  b.id AS bob,
  (SELECT company_id FROM person WHERE id = a.id) AS greenleaf,
  (SELECT company_id FROM person WHERE id = b.id) AS stonepharm
FROM auth.users a, auth.users b
WHERE a.email = 'alice@greenleaf.test' AND b.email = 'bob@stonepharm.test';

CREATE TEMP TABLE _rel ON COMMIT DROP AS
SELECT r.id AS rel
FROM relationship r, _fix f
WHERE (r.company_a_id = f.greenleaf AND r.company_b_id = f.stonepharm)
   OR (r.company_a_id = f.stonepharm AND r.company_b_id = f.greenleaf);

CREATE TEMP TABLE _c (kind text, id uuid) ON COMMIT DROP;
GRANT SELECT ON _fix, _rel, _c TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
END $$;

-- a live 'negotiation' card whose metadata carries BOTH counterparty_person_id
-- (the routing fact) AND free_delivery (privileged fixture).
WITH ins AS (
  INSERT INTO deal_card (
    relationship_id, version, status, deal_type, initiating_company_id,
    value_net, currency, created_by, updated_by, metadata)
  SELECT r.rel, 1, 'negotiation', 'offer', f.greenleaf, 50, 'EUR', f.alice, f.alice,
         jsonb_build_object('counterparty_person_id', f.bob, 'free_delivery', true)
  FROM _rel r, _fix f
  RETURNING id
)
INSERT INTO _c SELECT 'card', id FROM ins;

-- a held change proposed by GreenLeaf, pre-voted accept; the draft flips
-- free_delivery so the commit branch writes the metadata key under test.
INSERT INTO deal_pending_change (
  deal_card_id, base_version, proposed_by_company, proposed_by_person,
  proposer_reason, draft, votes)
SELECT (SELECT id FROM _c WHERE kind = 'card'), 1, f.greenleaf, f.alice,
       'Proposer reason',
       jsonb_build_object('value_net', 60, 'currency', 'EUR',
                          'free_delivery', true, 'line_items', '[]'::jsonb),
       jsonb_build_object(f.greenleaf::text, 'accept')
FROM _fix f;

-- Bob (StonePharm) accepts → the D-02 both-accept gate commits.
SELECT set_config('request.jwt.claim.sub', (SELECT bob FROM _fix)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT bob FROM _fix), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_new int;
BEGIN
  v_new := public.confirm_deal_change((SELECT id FROM _c WHERE kind = 'card'), 'accept', 'Accepter reason');
  IF v_new IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: confirm_deal_change did not commit (expected a both-accept commit)';
  END IF;
END $$;
RESET ROLE;

-- the commit must have MERGED, not replaced: both keys survive.
DO $$
DECLARE v_meta jsonb;
BEGIN
  SELECT metadata INTO v_meta FROM public.deal_card WHERE id = (SELECT id FROM _c WHERE kind = 'card');
  IF NOT (v_meta ? 'counterparty_person_id') THEN
    RAISE EXCEPTION 'IN-01 FAIL: commit dropped counterparty_person_id from metadata (got %)', v_meta;
  END IF;
  IF (v_meta->>'free_delivery')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'IN-01 FAIL: commit did not preserve free_delivery=true (got %)', v_meta;
  END IF;
END $$;

ROLLBACK;
SELECT 'ALL CONFIRM_DEAL_CHANGE_METADATA_MERGE TESTS PASSED' AS result;
