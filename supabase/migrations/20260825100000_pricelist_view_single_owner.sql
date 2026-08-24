-- ============================================================================
-- HEL-69 — current_pricelist_item delegates the price-visibility rule
-- ----------------------------------------------------------------------------
-- THE DEFECT (measured on production 2026-08-24, before this migration).
-- The view's public arm was a HAND-WRITTEN COPY of the product-visibility rule,
-- and the copy had drifted from the original. Three terms that
-- `product_visible_to_caller()` carries were missing here:
--
--     * the seller company's `deleted_at IS NULL`
--     * the seller company's `verification_status = 'verified'`
--     * the product's `location IS NOT NULL`   (unfiled is not a shelf)
--
-- Two live production rows leaked a per-gram price AND its tier ladder to any
-- CONNECTED buyer: StonePharm's unfiled 'Spirit Bear T28 STR MLS' (EUR 9.50)
-- and CNG Berlin's 'fdsc' (EUR 2.00, seller `verification_status = 'pending'`).
--
-- The trap worth naming: the old arm DID call `is_caller_verified()`, which
-- reads as "verification is covered". It is not — that function checks the
-- CALLER's company. Nothing in the old view ever read the SELLER's `company`
-- row at all. Same shape as the round-4 basket leak on slug 0022: the product
-- was correctly hidden by every door that CONSULTED the rule and handed over by
-- the one that REPRINTED it. (L-038.)
--
-- THE FIX — delete the predicate, do not repair it.
-- `public.product_price_visible_to_caller(uuid)` already exists and already
-- owns exactly this question:
--
--     product_visible_to_caller(p_product_id)                  -- may I see it
--       AND (p.company_id = current_company_id() OR p.price_public)  -- …priced
--
-- It is already the gate on `pricelist_item_public_select` and
-- `plit_public_select`. This view was the ONE price door not calling it. So the
-- entire two-arm WHERE collapses into a single call and the drift becomes
-- impossible rather than corrected once. Repairing the copy would have left a
-- second owner of the rule in place, i.e. left the next drift available.
--
-- Arm equivalence, stated because it is not obvious:
--   * old owner arm was `pl.company_id = current_company_id()` (the PRICELIST's
--     company); the function's owner arm is on the PRODUCT's company. The view
--     joins `p.company_id = pl.company_id`, so they are the same company.
--     `pricelist_view_single_owner_test.sql` §B asserts the consequence rather
--     than trusting this paragraph.
--   * `price_public` stays un-`or`-ed inside the function: "connection reveals
--     the product, never the price" (decision 6) is unchanged. §C asserts it.
--
-- ⚠️ OWNER-RIGHTS IS DELIBERATE — DO NOT SET `security_invoker`.
-- ADR-0004 §4 pre-declared this trade-off and it was re-verified against
-- production on 2026-08-24 rather than read off the ADR: `pricelist` carries
-- exactly ONE policy, `pricelist_all USING (company_id = current_company_id())`,
-- owner-only. This view joins `pricelist`. Under caller-rights every buyer read
-- returns ZERO rows and the buyer price surface goes dark. The ERROR-level
-- `security_definer_view` advisor entry is knowingly accepted
-- (ARCHITECTURE-NOTES.md:231). Supabase's general guidance to flip every view
-- to `security_invoker` assumes base tables whose policies admit the intended
-- readers; ours deliberately do not.
--
-- ⚠️ `WITH (security_barrier = true)` MUST be re-stated on every replace.
-- `CREATE OR REPLACE VIEW` without a WITH clause SILENTLY DROPS the reloption,
-- a body-to-body diff comes back clean, and nothing fails loudly. Without it
-- the planner may push a leaky user-supplied function below this WHERE — below
-- the visibility gate. The suite asserts `pg_class.reloptions` for this reason.
--
-- Projection, grants and row-pick are UNCHANGED from 20260822100000: same seven
-- columns in the same order (a changed column list would make CREATE OR REPLACE
-- VIEW fail outright), same DISTINCT ON row pick, same live-rungs-only `tiers`.
-- ============================================================================

CREATE OR REPLACE VIEW public.current_pricelist_item
WITH (security_barrier = true) AS
SELECT DISTINCT ON (pli.product_id)
  pli.id, pli.pricelist_id, pli.product_id, pli.price_per_gram, pli.currency,
  pli.updated_at,
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', t.id, 'min_grams', t.min_grams, 'price_per_gram', t.price_per_gram)
      ORDER BY t.min_grams), '[]'::jsonb)
     FROM public.pricelist_item_tier t
     WHERE t.pricelist_item_id = pli.id AND t.deleted_at IS NULL) AS tiers
FROM public.pricelist_item pli
JOIN public.pricelist pl ON pl.id = pli.pricelist_id
JOIN public.product p ON p.id = pli.product_id AND p.company_id = pl.company_id
WHERE pli.deleted_at IS NULL
  AND pl.deleted_at IS NULL
  -- ONE owner for "may this caller see this product's price". Both arms —
  -- owner and buyer — live inside the function. Do not re-inline any term here;
  -- if a term is missing, it is missing from the rule, and the rule is the
  -- place to add it (all the other price doors read the same function).
  AND public.product_price_visible_to_caller(pli.product_id)
ORDER BY pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC;

-- A replace does not reset grants; the ritual is re-issued anyway because the
-- one time it was skipped (20260618120100) is how the anon door reopened.
GRANT SELECT ON public.current_pricelist_item TO authenticated;
REVOKE ALL ON public.current_pricelist_item FROM anon;

-- HEL-69 sub-finding. Production shows `authenticated` holding INSERT, UPDATE,
-- DELETE and REFERENCES on this view, although the defining migration
-- (20260822100000:188-189) grants SELECT only — so they arrived from somewhere
-- else and outlived every replace since. Nothing writes through it (a
-- DISTINCT ON view is not auto-updatable, so a write would error), but an
-- unexplained write grant on an owner-rights view is not something to leave
-- standing once seen: owner-rights means any write that DID become possible
-- would execute as the view owner, bypassing RLS on the base tables.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES
  ON public.current_pricelist_item FROM authenticated;
