-- ============================================================================
-- basket_admission_test.sql — T07 (HEL-61, PLAN-T07.md rev 3)
-- ----------------------------------------------------------------------------
-- Proves: the new `basket_line_admission` restrictive policy on
-- public.product_basket_line (WITH CHECK only, FOR ALL, TO authenticated) and
-- the `anon`/`public` grant revoke. Reuses `product_public_select` /
-- `product_all` (T06) for the visibility arm via an RLS-filtered EXISTS
-- subquery — no visibility predicate is restated here (PLAN-T07 §1).
--
-- L-009 checked: `ls supabase/tests/ | grep -i basket` → no existing basket
-- suite. Genuinely new file.
--
-- Mirrors connection_visibility_override_test.sql's idiom exactly: one
-- BEGIN…ROLLBACK transaction, ephemeral fixtures, impersonation via
-- set_config('request.jwt.claim(s)', …) + SET LOCAL ROLE authenticated/anon,
-- RESET ROLE between perspectives. Any failed assertion RAISEs and aborts;
-- success prints 'ALL BASKET_ADMISSION TESTS PASSED'.
--
-- Run:  bash supabase/tests/run_basket_admission_test.sh
--
-- ⚠️  RED-FIRST: this file is EXPECTED to FAIL until
-- supabase/migrations/<ts>_basket_admission.sql ships. Today's ONLY policy on
-- product_basket_line is the shipped `basket_line_owner_all` — ownership only,
-- no product-visibility or price predicate at all. So:
--   * cells expecting REFUSED (3, 4, 5, 7, part of 10) currently ADMIT —
--     the suite aborts at the first one it reaches (cell 3), which is the
--     proof it genuinely exercises the missing policy. Do NOT "fix" it green
--     here.
--   * cells expecting ADMITTED (1, 2, 6, 8, 11, 12, 13) already pass today —
--     the current owner-only policy admits everything its owner writes,
--     which is exactly the hole this migration closes. Their purpose is to
--     prove the NEW policy doesn't become a blanket-deny once it lands, and
--     to guard the functional invariant (11) and the N2 gap (12) — same
--     precedent as connection_visibility_override_test.sql's own header,
--     which documents the identical asymmetry.
--   * cell 9 is a SHAPE guard, not a missing-feature guard: it protects the
--     "WITH CHECK, no USING" DECISION, and only goes red if someone later
--     regresses it by adding a mirroring USING clause (`add-using`). It is
--     expected to PASS both before and after this migration ships — its RED
--     state lives entirely in the `[MUT: add-using]` column, not in today's
--     tree. Documented so a reviewer does not mistake "cell 9 passes today"
--     for "cell 9 asserts nothing" (PLAN-T07 §5, B4).
--   * cell 10's grant-message assertion (`SQLERRM ~ 'permission denied'`) is
--     ALSO red today, for a DIFFERENT reason than "gate absent": anon is
--     still blocked (owner_person_id = auth.uid() collapses to NULL for a
--     JWT-less caller), but by an RLS refusal ("new row violates row-level
--     security policy…"), not the post-REVOKE grant refusal ("permission
--     denied for table…") — both raise SQLSTATE 42501, which is exactly why
--     PLAN-T07 §5 forbids asserting on the SQLSTATE alone.
--
-- Personas (seeded; resolved by supplier_product_code / company / email NAME,
-- never a raw product/company/person uuid, EXCEPT the four fixed seed ids
-- below — same precedent as connection_visibility_override_test.sql:34-38):
--   GreenLeaf  = aaaaaaaa-…  Alice = 11111111-…  (owner/seller, verified)
--   StonePharm = bbbbbbbb-…  Bob   = 22222222-…  (CONNECTED to GreenLeaf —
--                                                 seed §5d, active relationship)
--   Eva / Bavaria Medical Cannabis GmbH — verified, a real member, NO
--     relationship row to GreenLeaf at all (only a pending inbox item) — the
--     "unconnected verified buyer" persona.
--   anon — no JWT claims set (grant-arm cell 10).
--
-- Seeded fixtures used AS-IS (supabase/seed/seed.sql:391-394,433-436,462-465 —
-- L-012 checked, values cited, not assumed):
--   AUR-1A — GreenLeaf, profile_visible=true,  price_public=false, price 8.00.
--   AUR-1B — GreenLeaf, profile_visible=true,  price_public=true,  price 6.00.
--   AUR-1C — GreenLeaf, profile_visible=false, price_public=true,  price 4.00.
--   AUR-1D — GreenLeaf, profile_visible=false, price_public=false, price 5.00.
--
-- Ephemeral fixtures planted here (each new, per L-005 — a new row has no
-- dependents by construction, and each is scoped to exactly one cell so no
-- cell depends on another cell's mutation of shared state):
--   T07-SHAPE-GUARD      — GreenLeaf, visible+priced (admissible at insert
--                           time); cell 9's product, demoted to hidden +
--                           price-hidden AFTER Bob's line already exists.
--   T07-STAYS-ADMISSIBLE — GreenLeaf, visible+priced; cell 11's product,
--                           never mutated — a plain updater's positive case.
--   T07-NOPRICE-PUB      — GreenLeaf, visible + price_public=true, but NO
--                           pricelist_item row at all; cell 12 (N2 — the
--                           predicate reads `price_public`, not "has a
--                           price"; a benign but real gap, pinned not fixed).
--   T07-NOPRICE          — GreenLeaf, hidden + price_public=false, NO
--                           pricelist_item row; cell 13, Alice's own product
--                           with no price set (ticket's explicit "or has no
--                           price set" clause, ADR:856's DB test).
--
-- MUTATION-PROVABILITY (PLAN-T07 §5) — which cell(s) each named mutation
-- must break, tagged inline on the cell that proves it (N4: named per
-- conjunct, not one blanket mutation):
--   [MUT: drop-policy]     the whole restrictive policy         → 3, 4, 5, 7
--   [MUT: drop-price-arm]  `or p.price_public`                  → 1, 2, 8, 12,
--                                                                  and cell 11's setup insert
--   [MUT: drop-owner-arm]  `p.company_id = current_company_id()`→ 6
--   [MUT: add-using]       a USING clause mirroring the check    → 9 (the
--                                                                  shape guard)
-- A suite that stays green with the mechanism removed is asserting nothing —
-- these tags are the reviewer's map for verifying that claim by hand
-- (temporarily apply each mutation to the shipped migration, rerun, confirm
-- the named cell(s) and ONLY those go red).
-- ============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixtures (privileged role; rolled back) ─────────────────────────────────

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 Shape Guard Product', 'T07-SHAPE-GUARD', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 Stays Admissible Product', 'T07-STAYS-ADMISSIBLE', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 No Pricelist Row (public)', 'T07-NOPRICE-PUB', true, true, 'T07-FIXTURE-LOC');

INSERT INTO public.product (company_id, name, supplier_product_code, profile_visible, price_public, location)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'T07 No Pricelist Row (owner)', 'T07-NOPRICE', false, false, 'T07-FIXTURE-LOC');

CREATE TEMP TABLE _fix ON COMMIT DROP AS
SELECT
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1A' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1a_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1B' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1b_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1C' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1c_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'AUR-1D' AND company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) AS aur1d_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-SHAPE-GUARD') AS shapeguard_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-STAYS-ADMISSIBLE') AS staysadmissible_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-NOPRICE-PUB') AS nopricepub_id,
  (SELECT id FROM public.product WHERE supplier_product_code = 'T07-NOPRICE') AS noprice_id,
  (SELECT id FROM auth.users WHERE email = 'eva@bavaria.test') AS eva_id,
  (SELECT id FROM public.company WHERE name = 'Bavaria Medical Cannabis GmbH') AS bavaria_id;
GRANT SELECT ON _fix TO authenticated;
GRANT SELECT ON _fix TO anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM _fix
     WHERE aur1a_id IS NULL OR aur1b_id IS NULL OR aur1c_id IS NULL OR aur1d_id IS NULL
        OR shapeguard_id IS NULL OR staysadmissible_id IS NULL OR nopricepub_id IS NULL
        OR noprice_id IS NULL OR eva_id IS NULL OR bavaria_id IS NULL)
    THEN RAISE EXCEPTION 'FIXTURE: one or more T07 fixtures failed to resolve — seed drift?'; END IF;
END $$;

-- ============================================================================
-- Cell 1 [door: direct table][control] — Bob adds AUR-1B (visible + priced).
-- Proves the policy is not blanket-deny. [MUT: drop-price-arm] would refuse
-- this (Bob is not the owner, so only `price_public` keeps it admitted).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1b_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1b_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 1: Bob''s admitted line for AUR-1B (visible+priced) did not persist — control case broken'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 2 [AC10 bullet 1][MUT: drop-price-arm] — Bob adds AUR-1C (hidden to
-- the public, but T06's connection override makes it visible to him, and it
-- IS price_public). Proves the connection override reaches the basket, not
-- just the read side.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 2/AC10-1: Bob (connected) must be ADMITTED adding GreenLeaf''s hidden-but-connected AUR-1C'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 3 [AC10 bullet 2][MUT: drop-policy] — Bob adds AUR-1D: connected, so
-- VISIBLE to him (T06 override reaches hidden products regardless of price),
-- but price_public=false. Only the price arm can refuse this — visibility
-- alone would admit it. RED-FIRST: today's owner-only policy admits this.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1d_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 3/AC10-2: Bob must be REFUSED adding AUR-1D (visible-to-him via connection, but price_public=false) — the price arm, independent of visibility';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1d_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 3: no basket line for AUR-1D may exist after the refusal — AC10-1 (no line shall appear)'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 4 [AC10 bullet 2][MUT: drop-policy] — Bob adds AUR-1A: publicly
-- visible (profile_visible=true), but price_public=false. Isolates the price
-- arm from the visibility arm entirely (AUR-1A needs no connection override
-- at all to be seen).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1a_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 4/AC10-2: Bob must be REFUSED adding AUR-1A (publicly visible, price_public=false) — price arm, independent of visibility';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1a_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 4: no basket line for AUR-1A may exist after the refusal'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 5 [AC10 bullet 1][MUT: drop-policy] — Eva (verified, UNCONNECTED to
-- GreenLeaf — only a pending inbox item, seed §5f) adds AUR-1C (hidden,
-- price_public=true). Refused via the EXISTS cascade: product_public_select
-- hides AUR-1C from her entirely, so the subquery finds 0 rows regardless of
-- price_public.
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.pending_inbox_item p
     WHERE p.status = 'pending'
       AND p.receiver_company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
       AND p.sender_company_id = (SELECT bavaria_id FROM _fix))
    THEN RAISE EXCEPTION 'Cell 5 precondition: Eva/Bavaria must have a PENDING inbox item to GreenLeaf and NO relationship row — seed drift?'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', (SELECT eva_id::text FROM _fix), true);
SELECT set_config('request.jwt.claims', '{"sub":"' || (SELECT eva_id::text FROM _fix) || '","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_refused boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ((SELECT eva_id FROM _fix), (SELECT aur1c_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 5/AC10-1: Eva (unconnected, verified) must be REFUSED adding GreenLeaf''s hidden AUR-1C — visibility arm via the EXISTS cascade';
  END IF;
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = (SELECT eva_id FROM _fix)
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 0
    THEN RAISE EXCEPTION 'Cell 5: no basket line for AUR-1C may exist after Eva''s refusal'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 6 [AC10 bullet 3][MUT: drop-owner-arm] — Alice (owner) adds her OWN
-- AUR-1D (hidden, price-hidden). Owner arm bypasses the price rule entirely.
-- ⚠️ The seed ships GreenLeaf `verified` — mutated to `pending` IN-TRANSACTION
-- here (idiom: connection_visibility_override_test.sql:340-354) to prove
-- `product_all`/the owner arm is not verification-gated, matching that
-- suite's own A8 cell. Restored immediately after.
-- ============================================================================
UPDATE public.company SET verification_status = 'pending'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid, (SELECT aur1d_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '11111111-1111-1111-1111-111111111111'::uuid
         AND product_id = (SELECT aur1d_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 6/AC10-3: Alice must be ADMITTED adding her own hidden+price-hidden AUR-1D, even while GreenLeaf itself is unverified — the owner arm'; END IF;
END $$;
RESET ROLE;

UPDATE public.company SET verification_status = 'verified'
 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

-- ============================================================================
-- Cell 7 [AC10 bullet 6][MUT: drop-policy] — the FOR ALL / update-path half:
-- Bob's already-admitted AUR-1B line (from cell 1) PATCHed onto AUR-1D
-- (price-hidden). An INSERT-only policy would pass this test wrongly.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_line_id uuid;
  v_refused boolean := false;
BEGIN
  SELECT id INTO v_line_id FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT aur1b_id FROM _fix);
  IF v_line_id IS NULL THEN
    RAISE EXCEPTION 'Cell 7 precondition: Bob''s legal AUR-1B line (from cell 1) was not found';
  END IF;

  BEGIN
    UPDATE public.product_basket_line
       SET product_id = (SELECT aur1d_id FROM _fix), updated_at = now()
     WHERE id = v_line_id;
  EXCEPTION WHEN insufficient_privilege THEN
    v_refused := true;
  END;
  IF NOT v_refused THEN
    RAISE EXCEPTION 'Cell 7/AC10-6: Bob must be REFUSED patching an admitted line''s product_id onto AUR-1D (price-hidden) — the FOR ALL / conflict-update-path half of the policy. An INSERT-only policy passes this wrongly';
  END IF;
  IF (SELECT product_id FROM public.product_basket_line WHERE id = v_line_id) IS DISTINCT FROM (SELECT aur1b_id FROM _fix)
    THEN RAISE EXCEPTION 'Cell 7: the refused UPDATE must leave product_id unchanged at AUR-1B'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 8 [AC10 bullet 4][MUT: drop-price-arm] — the UPSERT path itself,
-- exercised twice on AUR-1C: the second INSERT hits the ON CONFLICT DO UPDATE
-- branch, which is the exact statement addToBasket issues (writes.ts:26-37).
-- Admitted (connected + price_public).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count, pack_size_grams, updated_at)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 1, 1000, now())
  ON CONFLICT (owner_person_id, product_id) DO UPDATE
    SET pack_count = excluded.pack_count, pack_size_grams = excluded.pack_size_grams, updated_at = excluded.updated_at;

  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count, pack_size_grams, updated_at)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1c_id FROM _fix), 2, 1000, now())
  ON CONFLICT (owner_person_id, product_id) DO UPDATE
    SET pack_count = excluded.pack_count, pack_size_grams = excluded.pack_size_grams, updated_at = excluded.updated_at;

  IF (SELECT pack_count FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT aur1c_id FROM _fix)) <> 2
    THEN RAISE EXCEPTION 'Cell 8/AC10-4: Bob''s upsert (ON CONFLICT DO UPDATE) on AUR-1C must persist pack_count=2 — the exact statement addToBasket issues must succeed for an admissible product'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 9 [AC10 consequence][MUT: add-using] — 🔴 B4: the shape guard.
-- Bob adds T07-SHAPE-GUARD while it is admissible; the SELLER then hides it
-- (price_public=false, profile_visible=false) AFTER the line exists. Because
-- the shipped policy carries WITH CHECK only (no USING), Bob's own line must
-- stay readable and deletable regardless — "SELECT and DELETE both succeed"
-- is NOT enough to detect a wrongly-added USING clause: under that mutation
-- the DELETE affects 0 rows silently and Bob's own post-delete count reads 0
-- too, so every naive assertion stays green while the row survives. Only the
-- PRE-delete buyer-visible count (must be 1) plus a PRIVILEGED POST-delete
-- count (must be 0) split the two worlds.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT shapeguard_id FROM _fix), 1);
END $$;
RESET ROLE;

UPDATE public.product SET price_public = false, profile_visible = false
 WHERE id = (SELECT shapeguard_id FROM _fix);

SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_before int;
  v_deleted int;
BEGIN
  SELECT count(*) INTO v_before FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT shapeguard_id FROM _fix);
  IF v_before <> 1 THEN
    RAISE EXCEPTION 'Cell 9/B4 [MUT: add-using]: Bob''s BUYER-VISIBLE count BEFORE the delete must be 1 (readable) — got %. The accepted consequence is "readable and deletable", never "vanished" — a USING clause mirroring the check would fail this exact line', v_before;
  END IF;

  DELETE FROM public.product_basket_line
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT shapeguard_id FROM _fix);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'Cell 9/B4: Bob''s DELETE of his own now-invisible-product line must affect exactly 1 row — got %. A silent 0-row delete ("succeeds" but removes nothing) is the add-using regression', v_deleted;
  END IF;
END $$;
RESET ROLE;

DO $$
DECLARE v_after int;
BEGIN
  SELECT count(*) INTO v_after FROM public.product_basket_line
   WHERE product_id = (SELECT shapeguard_id FROM _fix);
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'Cell 9/B4: the PRIVILEGED post-delete count must be 0 — got %. The row survived a DELETE that reported success. This is precisely the case a buyer-only recount cannot detect', v_after;
  END IF;
END $$;

-- ============================================================================
-- Cell 10 [AC10 bullet 7 — anon] — anon INSERT must be refused, and the
-- refusal message (NOT the SQLSTATE, which is 42501 for both an RLS refusal
-- and a grant refusal) must read "permission denied" — the post-REVOKE
-- grant-level refusal, not merely the pre-existing RLS refusal.
-- ============================================================================
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_denied boolean := false;
  v_msg text;
BEGIN
  BEGIN
    INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
    VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT aur1b_id FROM _fix), 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
    v_msg := SQLERRM;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'Cell 10/AC10-7: anon INSERT on product_basket_line must be refused';
  END IF;
  IF v_msg !~* 'permission denied' THEN
    RAISE EXCEPTION 'Cell 10/AC10-7: anon''s refusal must read ''permission denied'' (the post-REVOKE grant refusal) — SQLSTATE 42501 alone cannot distinguish this from a pre-existing RLS refusal ("new row violates row-level security policy…"), which anon gets even before the migration ships. Got message: %', v_msg;
  END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 11 [functional invariant, L-011's class][MUT: drop-price-arm breaks
-- the setup insert] — an ALREADY-ADMISSIBLE line stays editable. Own product,
-- own fixture (T07-STAYS-ADMISSIBLE), never touched by any other cell — every
-- other numbered cell here is an attack or a refusal; this is the one
-- positive case for the shipped drawer's plain pack-count updater
-- (writes.ts:41-48).
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT staysadmissible_id FROM _fix), 1);

  UPDATE public.product_basket_line SET pack_count = 3, updated_at = now()
   WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
     AND product_id = (SELECT staysadmissible_id FROM _fix);

  IF (SELECT pack_count FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT staysadmissible_id FROM _fix)) <> 3
    THEN RAISE EXCEPTION 'Cell 11: Bob must be able to update pack_count on his still-admissible line — existing lines stay editable (ADR:856)'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 12 [N2 — pinned gap, not fixed][MUT: drop-price-arm] — Bob adds a
-- product with price_public=true but NO pricelist_item row at all. The
-- predicate reads `p.price_public`, not "has a resolvable price" — looser
-- than the shipped card's own rule (ProductCard.tsx:407:
-- `priceShown = … && p.price_per_gram != null`). Admitted; benign
-- (toDraftLines.ts:8-11 documents the price-less send) but asserted so the
-- gap is pinned rather than rediscovered later.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
SELECT set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('22222222-2222-2222-2222-222222222222'::uuid, (SELECT nopricepub_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '22222222-2222-2222-2222-222222222222'::uuid
         AND product_id = (SELECT nopricepub_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 12/N2: Bob must be ADMITTED adding a price_public=true product with NO pricelist_item row — the predicate reads price_public, not "has a price"; pinning this gap, not fixing it here'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- Cell 13 [AC10 bullet 3 — "or has no price set"][ADR:856] — Alice (owner)
-- adds her own product with NO pricelist_item row at all. The ticket's price
-- clause explicitly includes this case; cell 6 only covers price-HIDDEN.
-- ============================================================================
SELECT set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.product_basket_line (owner_person_id, product_id, pack_count)
  VALUES ('11111111-1111-1111-1111-111111111111'::uuid, (SELECT noprice_id FROM _fix), 1);
  IF (SELECT count(*) FROM public.product_basket_line
       WHERE owner_person_id = '11111111-1111-1111-1111-111111111111'::uuid
         AND product_id = (SELECT noprice_id FROM _fix)) <> 1
    THEN RAISE EXCEPTION 'Cell 13/AC10-3: Alice must be ADMITTED adding her own product with NO price set at all — the ticket''s explicit clause, ADR:856''s DB test'; END IF;
END $$;
RESET ROLE;

-- ============================================================================
-- G1 [AC10 bullet 7, structural] — anon and PUBLIC hold NO privileges on
-- product_basket_line at all, checked directly rather than only inferred
-- from cell 10's behavioural refusal (which cannot on its own distinguish
-- "no grant" from "grant present but RLS still blocks it").
-- ============================================================================
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.product_basket_line', 'SELECT')
    THEN RAISE EXCEPTION 'G1/AC10-7: anon still holds SELECT on product_basket_line'; END IF;
  IF has_table_privilege('anon', 'public.product_basket_line', 'INSERT')
    THEN RAISE EXCEPTION 'G1/AC10-7: anon still holds INSERT on product_basket_line'; END IF;
  IF has_table_privilege('anon', 'public.product_basket_line', 'UPDATE')
    THEN RAISE EXCEPTION 'G1/AC10-7: anon still holds UPDATE on product_basket_line'; END IF;
  IF has_table_privilege('anon', 'public.product_basket_line', 'DELETE')
    THEN RAISE EXCEPTION 'G1/AC10-7: anon still holds DELETE on product_basket_line'; END IF;
  IF has_table_privilege('anon', 'public.product_basket_line', 'TRUNCATE')
    THEN RAISE EXCEPTION 'G1/AC10-7: anon still holds TRUNCATE on product_basket_line'; END IF;
  IF has_table_privilege('public', 'public.product_basket_line', 'SELECT')
    THEN RAISE EXCEPTION 'G1/AC10-7: PUBLIC still holds SELECT on product_basket_line'; END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'ALL BASKET_ADMISSION TESTS PASSED';
END $$;

ROLLBACK;
SELECT 'ALL BASKET_ADMISSION TESTS PASSED' AS result;
