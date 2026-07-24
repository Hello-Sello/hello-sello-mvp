-- ============================================================================
-- finalize_deal_test.sql — WR-04: membership is gated BEFORE the done-idempotency
-- ----------------------------------------------------------------------------
-- Phase-12 hardening (Wave 3a). finalize_deal short-circuited on an already
-- 'done' card BEFORE any authorization, so a NON-PARTY (a company outside the
-- deal's relationship) calling finalize on a done card got a silent void — the
-- code read as "success" to the caller, and the seller-only rejection never
-- ran. This proves the gate moved above the idempotent early-return:
--
--   a NON-MEMBER calling finalize_deal on a 'done' card must RAISE
--   ('…Only the seller…'), never return void.
--
-- Mirrors deliver_deal_test.sql: one BEGIN…ROLLBACK, runtime-resolved seed ids,
-- impersonation via request.jwt.claims + SET LOCAL ROLE, RAISE on any failed
-- assertion, no trace left. The non-member is resolved at runtime from the seed
-- (any auth user whose company is neither side of the pair — no hardcoded id).
--
-- ⚠️ RED-FIRST: fails before the WR-04 fix (the done early-return fires ahead of
-- membership → silent void). GREEN once finalize_deal gates membership first in
-- 20260724120600_deal_transition_rpcs.sql.
--
-- Run:  bash supabase/tests/run_finalize_deal_test.sh
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

-- a NON-MEMBER: a seeded auth user whose company is NOT a side of the pair.
CREATE TEMP TABLE _nm ON COMMIT DROP AS
SELECT u.id AS person, p.company_id AS company
FROM auth.users u
JOIN person p ON p.id = u.id, _fix f
WHERE p.company_id <> f.greenleaf AND p.company_id <> f.stonepharm
LIMIT 1;

CREATE TEMP TABLE _c (kind text, id uuid) ON COMMIT DROP;

GRANT SELECT ON _fix, _rel, _nm, _c TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM _fix) <> 1 OR (SELECT count(*) FROM _rel) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: seeded alice/bob/relationship not found — run supabase db reset';
  END IF;
  IF (SELECT count(*) FROM _nm) <> 1 THEN
    RAISE EXCEPTION 'FIXTURE: no seeded non-member auth user found — run supabase db reset';
  END IF;
END $$;

-- a status='done' card on the seeded relationship (privileged fixture).
WITH ins AS (
  INSERT INTO deal_card (relationship_id, status, deal_type, initiating_company_id, created_by)
  SELECT r.rel, 'done', 'offer', f.greenleaf, f.alice
  FROM _rel r, _fix f
  RETURNING id
)
INSERT INTO _c SELECT 'done', id FROM ins;

-- ── the probe: a NON-PARTY finalize on a done card must be REJECTED ──────────
SELECT set_config('request.jwt.claim.sub', (SELECT person FROM _nm)::text, true);
SELECT set_config('request.jwt.claims',
       json_build_object('sub', (SELECT person FROM _nm), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.finalize_deal((SELECT id FROM _c WHERE kind = 'done'));
    RAISE EXCEPTION 'WR-04 FAIL: finalize_deal returned void for a NON-PARTY on a done card (membership gate missing)';
  EXCEPTION WHEN raise_exception THEN
    -- swallow ONLY the expected seller-only rejection; the FAIL sentinel (no
    -- 'Only the seller') re-raises and surfaces the leak.
    IF SQLERRM NOT LIKE '%Only the seller%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;

ROLLBACK;
SELECT 'ALL FINALIZE_DEAL TESTS PASSED' AS result;
