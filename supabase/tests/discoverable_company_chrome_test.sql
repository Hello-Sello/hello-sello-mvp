-- ============================================================================
-- discoverable_company_chrome_test.sql — T01 shop-chrome proof (HEL-55,
-- 0022-buyer-shop-view)
-- ----------------------------------------------------------------------------
-- Proves the NEW `get_discoverable_company` projections ONLY — links,
-- locations, address, warehouse_location, updated_at (PLAN-T01.md rev 3,
-- "Test surface"). `tags` is NOT a new column (2026-08-20 amendment to
-- TICKETS.md T01 criterion 1) — it already ships as `type_codes`, unchanged
-- and not re-asserted here.
--
-- What is asserted, all against a verified caller (Alice / GreenLeaf) calling
-- for a verified target (StonePharm, sentinel-planted below):
--   (1) I8  — calling get_discoverable_company for ONE company id returns
--             EXACTLY ONE row, not every verified company (the primary
--             filter `c.id = p_company_id`; PLAN-T01.md invariant table I8).
--   (2) the five new columns each match THEIR OWN distinct planted sentinel
--       (address / warehouse_location / updated_at / links / locations) —
--       distinct values so a transposition (e.g. address <-> warehouse_
--       location) cannot pass (L-012).
--   (3) I9/I10 — the SAME planted company has its company_type_assignment
--       rows soft-deleted in-fixture: it must still return exactly one row
--       (LEFT join, not INNER — I9) and `type_codes` must be `{}`, never
--       NULL or `{NULL}` (coalesce + filter — I10).
--   (4) a WHOLE-ROW leak scan: the function's return, cast to jsonb text,
--       must not contain the planted seller-private metadata key
--       ('private_note':'PLANT-LEAK') — ADR §4's leak rule. A per-named-
--       column check cannot catch a column that doesn't exist yet; only a
--       full-row scan can (round 2 N-leak).
--   (5) a metadata key that is ABSENT and one that is explicitly JSON `null`
--       both come back indistinguishably as JSON null through the row (the
--       PostgREST-facing fact N4 describes), asserted via
--       `to_jsonb(row) ->> 'locations'` on two different companies.
--
-- NOT asserted here (already shipped, MUST NOT be duplicated — L-009 / B3):
--   • anon has no EXECUTE on get_discoverable_company(uuid)
--       -> cross_tenant_lockdown_test.sql:92-93
--   • an UNVERIFIED caller gets zero rows through get_discoverable_company
--       -> cross_tenant_lockdown_test.sql:111-113
-- Both run under ON_ERROR_STOP=1 in their own runner; run them alongside this
-- suite (PLAN-T01.md step 2), don't re-derive them here.
--
-- Modelled on seed_visibility_matrix_test.sql: one BEGIN…ROLLBACK
-- transaction, ephemeral fixtures, RAISE EXCEPTION on any failed assertion,
-- no trace left behind.
--
-- Run:  bash supabase/tests/run_discoverable_company_chrome_test.sh
--
-- ⚠️  RED-FIRST: as of this write, `get_discoverable_company` has only its
-- current ELEVEN columns (id, name, tagline, about, country, website,
-- logo_path, cover_path, type_codes, connection_state, pricing_requested).
-- None of address / warehouse_location / updated_at / links / locations
-- exist on it yet. Every assertion that reads `v_row.<new column>` below is
-- expected to fail with "record ... has no field ..." until the migration
-- in PLAN-T01.md lands — that failure is the proof this suite genuinely
-- exercises the new projections. Do NOT "fix" it green here.
--
-- ⚠️  PRECONDITION — run against a FRESH `supabase db reset`. This suite
-- plants its own sentinel data rather than relying on the seed: the seed
-- populates NONE of these five columns (L-012, verified: zero
-- warehouse_location, zero links; the two named demo companies' metadata is
-- only jsonb_build_object('seed','demo-2d')). Do not "fix" this suite to
-- assert "as seeded" — that assertion is unsatisfiable by design.
--
-- Fixed seed UUIDs used:
--   GreenLeaf  = aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa  (Alice's company, caller)
--   Alice      = 11111111-1111-1111-1111-111111111111 (verified caller)
--   StonePharm = bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  (sentinel-planted target)
-- NordCanna Distribution GmbH / Bavaria Medical Cannabis GmbH — looked up by
-- name (no fixed UUID, seed.sql §5b) — the absent-key / explicit-null-key pair.
-- ============================================================================

-- Fail loud under ANY harness, including a flagless `psql -f -` invocation —
-- see seed_visibility_matrix_test.sql:50-55 for why this line is mandatory
-- and not merely a nicety: without it, a failed assertion inside a DO block
-- aborts the transaction, the unconditional ROLLBACK below still succeeds,
-- and the trailing SELECT prints "... PASSED" with exit code 0.
\set ON_ERROR_STOP on

BEGIN;

-- ── Fixture (privileged role, rolled back at the end) ───────────────────────
-- Plant FIVE distinct sentinels on StonePharm — one per new column — plus a
-- seller-private metadata key that must never cross the RPC boundary. Also
-- soft-delete StonePharm's company_type_assignment rows in-fixture so the SAME
-- row proves I9/I10 (a company with zero live type assignments) alongside the
-- five-column chrome proof, rather than needing a second planted company.
UPDATE public.company
   SET address = 'PLANT-ADDR',
       warehouse_location = 'PLANT-WH',
       metadata = metadata || jsonb_build_object(
         'links', jsonb_build_array(
           jsonb_build_object('platform', 'custom', 'value', 'PLANT-LINK-VALUE', 'label', 'Site')
         ),
         'locations', jsonb_build_array(
           jsonb_build_object('label', 'Warehouse 1', 'value', 'PLANT-LOCATION-VALUE')
         ),
         'private_note', 'PLANT-LEAK'
       )
 WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

UPDATE public.company_type_assignment
   SET deleted_at = now()
 WHERE company_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
   AND deleted_at IS NULL;

-- Capture StonePharm's own post-UPDATE updated_at (bumped by its `updated_at`
-- trigger) as the sentinel to compare against — self-consistent, not a
-- hard-coded timestamp that could drift from the trigger's real behaviour.
-- Stashed in a custom GUC so it survives the later SET LOCAL ROLE switch
-- (custom GUCs are session/transaction-scoped, not role-scoped).
DO $$
DECLARE
  v_updated_at timestamptz;
BEGIN
  SELECT updated_at INTO v_updated_at
    FROM public.company WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  PERFORM set_config('test.expected_updated_at', v_updated_at::text, true);
END $$;

-- Fixture for assertion (5): an ABSENT key vs an explicit JSON-null key.
-- NordCanna is left untouched — seed.sql:283 gives it only
-- jsonb_build_object('seed','demo-2d'), so 'locations' is genuinely ABSENT.
-- Bavaria gets 'locations' set to explicit JSON null. Both stay verified.
-- Looked up by name and stashed in GUCs (as postgres — Alice's later RLS-
-- scoped read of `company` may not see either row directly).
DO $$
DECLARE
  v_absent_id uuid;
  v_null_id   uuid;
BEGIN
  SELECT id INTO v_absent_id FROM public.company WHERE name = 'NordCanna Distribution GmbH';
  SELECT id INTO v_null_id   FROM public.company WHERE name = 'Bavaria Medical Cannabis GmbH';
  IF v_absent_id IS NULL OR v_null_id IS NULL THEN
    RAISE EXCEPTION 'FIXTURE: expected demo-2d companies NordCanna Distribution GmbH / Bavaria Medical Cannabis GmbH not found — seed.sql §5b may have changed';
  END IF;

  UPDATE public.company SET metadata = metadata || '{"locations": null}'::jsonb
   WHERE id = v_null_id;

  PERFORM set_config('test.absent_id', v_absent_id::text, true);
  PERFORM set_config('test.null_id', v_null_id::text, true);
END $$;

-- ── Impersonate Alice — verified caller, GreenLeaf ──────────────────────────
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

-- ── (1) I8 — exactly one row for one company id ─────────────────────────────
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM public.get_discoverable_company('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'I8: get_discoverable_company(<one id>) returned % row(s), expected exactly 1 — the primary filter `c.id = p_company_id` may be missing, which would return every verified company instead',
      v_count;
  END IF;
END $$;

-- ── (2) + (3) the five new columns against their own sentinels, and I9/I10 ──
DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
    FROM public.get_discoverable_company('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

  IF v_row.address IS DISTINCT FROM 'PLANT-ADDR' THEN
    RAISE EXCEPTION 'CHROME: address = %, expected sentinel PLANT-ADDR', v_row.address;
  END IF;

  IF v_row.warehouse_location IS DISTINCT FROM 'PLANT-WH' THEN
    RAISE EXCEPTION 'CHROME: warehouse_location = %, expected sentinel PLANT-WH', v_row.warehouse_location;
  END IF;

  IF v_row.updated_at IS DISTINCT FROM current_setting('test.expected_updated_at')::timestamptz THEN
    RAISE EXCEPTION 'CHROME: updated_at = %, expected the planted row''s own updated_at %',
      v_row.updated_at, current_setting('test.expected_updated_at');
  END IF;

  IF (v_row.links -> 0 ->> 'value') IS DISTINCT FROM 'PLANT-LINK-VALUE' THEN
    RAISE EXCEPTION 'CHROME: links did not carry the planted sentinel, got %', v_row.links;
  END IF;

  IF (v_row.locations -> 0 ->> 'value') IS DISTINCT FROM 'PLANT-LOCATION-VALUE' THEN
    RAISE EXCEPTION 'CHROME: locations did not carry the planted sentinel, got %', v_row.locations;
  END IF;

  -- I9/I10 — StonePharm's company_type_assignment rows were soft-deleted
  -- above. The row must still exist (LEFT join, I9) and type_codes must be
  -- exactly '{}' — not SQL NULL (missing coalesce) and not '{NULL}' (missing
  -- the `filter (where ... is not null)` clause).
  IF v_row.type_codes IS NULL THEN
    RAISE EXCEPTION 'I10: type_codes is NULL for a company with no live type assignments — the coalesce(...) is missing (this row existing at all already proves I9''s LEFT join)';
  END IF;
  IF v_row.type_codes <> ARRAY[]::text[] THEN
    RAISE EXCEPTION 'I10: type_codes = %, expected {} for a company with no live type assignments — likely missing the `filter (where cta.company_type_code is not null)` clause, yielding {NULL}',
      v_row.type_codes;
  END IF;

  -- (4) whole-row leak scan — must be a full-row text scan, not a per-column
  -- check (round 2 N-leak): a per-column check is shape-blind to a column
  -- that hasn't been added yet, which is the only thing this rule is for.
  IF (SELECT to_jsonb(t)::text
        FROM public.get_discoverable_company('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') t
     ) LIKE '%PLANT-LEAK%' THEN
    RAISE EXCEPTION 'LEAK: get_discoverable_company''s whole-row JSON contains PLANT-LEAK — company.metadata is leaking beyond the named links/locations keys (ADR §4)';
  END IF;
END $$;

-- ── (5) absent key vs explicit JSON null — both arrive as JSON null ─────────
DO $$
DECLARE
  v_absent_id uuid := current_setting('test.absent_id')::uuid;
  v_null_id   uuid := current_setting('test.null_id')::uuid;
  v_absent_text text;
  v_null_text   text;
BEGIN
  -- ⚠️ Guard row PRESENCE first. Without this the two IS NULL checks below pass
  -- vacuously on zero rows: if a later ticket adds a predicate to this read path,
  -- or a seed change stops these companies being `verified`, the RPC returns no
  -- row, both v_*_text stay NULL, and this block reports green while proving
  -- nothing. Assertions (1) and (2) are immune by construction; this one was not.
  IF (SELECT count(*) FROM public.get_discoverable_company(v_absent_id)) <> 1
     OR (SELECT count(*) FROM public.get_discoverable_company(v_null_id)) <> 1 THEN
    RAISE EXCEPTION 'METADATA: fixture precondition lost — expected exactly 1 row for each of the absent-key and null-key companies (got % and %)',
      (SELECT count(*) FROM public.get_discoverable_company(v_absent_id)),
      (SELECT count(*) FROM public.get_discoverable_company(v_null_id));
  END IF;

  SELECT to_jsonb(t) ->> 'locations' INTO v_absent_text
    FROM public.get_discoverable_company(v_absent_id) t;
  IF v_absent_text IS NOT NULL THEN
    RAISE EXCEPTION 'METADATA: locations for a company whose metadata has NO "locations" key rendered %, expected JSON null',
      v_absent_text;
  END IF;

  SELECT to_jsonb(t) ->> 'locations' INTO v_null_text
    FROM public.get_discoverable_company(v_null_id) t;
  IF v_null_text IS NOT NULL THEN
    RAISE EXCEPTION 'METADATA: locations for a company whose metadata has "locations":null rendered %, expected JSON null (must be byte-identical to the absent-key case)',
      v_null_text;
  END IF;
END $$;

RESET ROLE;

ROLLBACK;
SELECT 'ALL DISCOVERABLE COMPANY CHROME TESTS PASSED' AS result;
