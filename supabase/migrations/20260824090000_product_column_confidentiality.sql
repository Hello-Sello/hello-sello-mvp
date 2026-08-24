-- ============================================================================
-- T13 — a buyer must not read confidential columns off public.product
-- ----------------------------------------------------------------------------
-- THE DEFECT (live on production before this migration): `product_public_select`
-- admitted any row with `profile_visible = true` to any verified caller. RLS
-- filters ROWS, not COLUMNS, so an admitted row came back whole — including
-- `rrp_per_gram` (a per-gram price, on a product whose seller set
-- `price_public = false`), `supplier_product_code` (G3 confidentiality: buyers
-- never see the seller's internal code) and raw `metadata` (the shop RPC
-- projects only `metadata->'pack_sizes'`). Measured as Bob, a verified
-- connected buyer: 4 GreenLeaf rows, rrp_per_gram populated on all four, two
-- of which are price_public = false.
--
-- WHY NOT A COLUMN GRANT. `REVOKE (rrp_per_gram) ON product FROM authenticated`
-- is the obvious fix and is wrong: grants are role-wide and not policy-aware,
-- so it strips the SELLER's read of her own column too. This migration family
-- has documented the same trap for `company` and `pending_inbox_item`.
--
-- THE FIX. Remove the buyer's base-table read entirely and give her a
-- projection. The buyer's door becomes `public.product_public`, which cannot
-- return a column it does not have.
--
-- ⚠️ S4 — POLICY DEPENDENCIES CHECKED BEFORE REVOKING, because four policies
-- borrow the buyer's product read through an RLS-filtered subquery and would
-- have gone silently blank:
--     pricelist_item.pricelist_item_public_select   EXISTS … FROM product
--     pricelist_item_tier.plit_public_select        JOIN product  ← the scan
--                                                    that matched 'FROM product'
--                                                    MISSED this one
--     product_image.product_image_public_select     EXISTS … FROM product
--     product_media.product_media_public_select     EXISTS … FROM product
--   NOT affected, verified: product_basket_line.basket_line_admission (already
--   routes through the SECURITY DEFINER helper) and batch_terpene.bterp_all
--   (owner-scoped, covered by product_all). `current_pricelist_item` is an
--   owner-rights view and never consulted the caller's product RLS.
--   All four are re-pointed below at the SECURITY DEFINER helpers, so they stop
--   depending on a caller-side product read at all.
--
-- NO CLIENT CHANGE IS NEEDED, and that was verified rather than assumed. Every
-- client read of `product` resolves to the caller's OWN company and is carried
-- by `product_all`:
--     catalog/shop.ts      getMyShop() — companyId from the caller's person row
--     catalog/manage.ts    all `.eq("id", …)` seller management, owner policy
--     deals/reads.ts       `.eq("company_id", viewerCompanyId)`
--     allocate/batches.ts  `.in("id", …)` with NO company filter — but
--                          getAllocationWorklist narrows to cards where the
--                          CALLER IS THE SELLER ("a seller-ops surface, never
--                          buyer"), so the ids are always the caller's own,
--                          soft-deleted originals included. `product_all` has no
--                          deleted_at term and keeps serving those.
--
-- A `product_public` VIEW WAS BUILT HERE AND THEN REMOVED. With no client path
-- reading another company's product rows, and all four borrowing policies moved
-- onto the SECURITY DEFINER helpers, the view had no caller — a third
-- buyer-facing door that would have to be kept in agreement with
-- `get_discoverable_shop` and `product_visible_to_caller` forever (L-038), plus
-- a second `security_definer_view` advisor ERROR, in exchange for nothing that
-- is called today. Removing the mechanism beat adding one. Build it when a
-- caller exists.
--
-- ⚠️ DELIBERATE WIDENING, stated so it is not mistaken for a leak later: the
--   price door gains the connection arm. A connected buyer now reads the
--   pricelist_item of a product that is `profile_visible = false` but
--   `price_public = true` (AUR-1C in the seed). `get_discoverable_shop` ALREADY
--   shows her that product and that price — the base-table policy was the
--   narrower of the two doors, and a single owner of a rule is a claim about
--   agreement with the other doors (L-038). Price confidentiality is unchanged:
--   `price_public = false` still yields nothing, asserted in the suite's cell 6.
--
-- ADVISOR: no change expected to `get_advisors(security)`. This migration adds
-- one SECURITY DEFINER function (product_price_visible_to_caller), so the
-- `authenticated_security_definer_function_executable` WARN count moves 85 → 86;
-- it adds no view and no new ERROR.
--
-- S5 — every object re-created below was diffed against its LIVE body
-- (pg_policies.qual / pg_get_functiondef) immediately before this file was
-- written, never re-typed from the migration that first declared it.
--
-- Proof: supabase/tests/product_column_confidentiality_test.sql (6 cells; 1-3
-- RED before this migration, 4-6 regression guards that pass before and after).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. "May this caller see this product's PRICE" gets its own name.
--
-- The predicate already existed, inlined inside product_admissible_to_basket.
-- Naming it separately is what lets the pricelist policies state the rule by
-- reference instead of restating it — and a policy that said
-- `product_admissible_to_basket(...)` would be naming a basket mechanism to
-- answer a pricing question.
-- ----------------------------------------------------------------------------
create or replace function public.product_price_visible_to_caller(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.product_visible_to_caller(p_product_id)
     and exists (
       select 1
         from public.product p
        where p.id = p_product_id
          and (p.company_id = public.current_company_id() or p.price_public)
     );
$$;

comment on function public.product_price_visible_to_caller(uuid) is
  'T13: single owner of "may this caller see this product''s price". Visibility '
  '(product_visible_to_caller) AND the owner-or-price_public arm. Named in RLS '
  'policy expressions, which evaluate as the CALLING role — hence the grant to '
  'authenticated below.';

revoke all on function public.product_price_visible_to_caller(uuid) from public, anon;
grant execute on function public.product_price_visible_to_caller(uuid) to authenticated;

-- product_admissible_to_basket now delegates. Body otherwise unchanged, so the
-- basket's shipped behaviour is bit-for-bit what T07 proved.
create or replace function public.product_admissible_to_basket(p_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.product_price_visible_to_caller(p_product_id);
$$;

-- ----------------------------------------------------------------------------
-- 2. Close the base table to buyers. product_all (owner) is untouched.
-- ----------------------------------------------------------------------------
drop policy if exists product_public_select on public.product;

-- ----------------------------------------------------------------------------
-- 3. Re-point the four borrowers at the definer helpers.
--
-- Each previously restated a PARTIAL copy of the visibility rule (deleted_at,
-- profile_visible, the window) and none carried the connection override, the
-- verified gate, the seller-company check or the unfiled-location rule. They
-- now state it by reference, which is both the fix and the deduplication.
-- ----------------------------------------------------------------------------
drop policy if exists product_image_public_select on public.product_image;
create policy product_image_public_select on public.product_image
  for select to authenticated
  using (public.product_visible_to_caller(product_image.product_id));

drop policy if exists product_media_public_select on public.product_media;
create policy product_media_public_select on public.product_media
  for select to authenticated
  using (public.product_visible_to_caller(product_media.product_id));

drop policy if exists pricelist_item_public_select on public.pricelist_item;
create policy pricelist_item_public_select on public.pricelist_item
  for select to authenticated
  using (
    deleted_at is null
    and public.product_price_visible_to_caller(pricelist_item.product_id)
  );

-- plit keeps its explicit is_caller_verified(): the helper carries it only on
-- the BUYER arm, and dropping it here would widen the policy for an owner who
-- is already covered by plit_all. Strictly narrower-or-equal, deliberately.
drop policy if exists plit_public_select on public.pricelist_item_tier;
create policy plit_public_select on public.pricelist_item_tier
  for select to authenticated
  using (
    deleted_at is null
    and public.is_caller_verified()
    and exists (
      select 1
        from public.pricelist_item pli
       where pli.id = pricelist_item_tier.pricelist_item_id
         and pli.deleted_at is null
         and public.product_price_visible_to_caller(pli.product_id)
    )
  );
