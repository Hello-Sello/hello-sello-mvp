-- ============================================================================
-- get_discoverable_shop gains the specification set (0022-buyer-shop-view, T05)
-- ----------------------------------------------------------------------------
-- AC 7's full specification set, plus `product.location` (which is what produces
-- the location tabs) and `media` (the card-back Documents & Media section),
-- served through the ONE read door — no second path (ARCHITECTURE-NOTES.md:423).
--
-- TWELVE new OUT columns: cbg_percent, cbn_percent, terpene_percent, cultivator,
-- lineage_parent_a, lineage_parent_b, irradiation_code, packaging_material,
-- resealable, location, pack_sizes, media.
--
-- ⚠️ THE LEAK RULE (ADR-0005 §4): `pack_sizes` projects `p.metadata ->
-- 'pack_sizes'` — ONE named key — NEVER `p.metadata`, which carries the
-- seller's private per-company notes. `supplier_product_code` stays ABSENT from
-- the OUT list entirely (G3 confidentiality); buyers never see the seller's
-- internal code.
--
-- ⚠️ DROP + CREATE is forced: adding OUT columns changes the return type and
-- Postgres rejects `create or replace` across that. The base body below is the
-- CURRENT definition copied verbatim from
-- 20260816190000_tier_ladder_contract.sql:82-154 (dumped from the running DB
-- with pg_get_functiondef and diffed 2026-08-22: byte-identical; no later
-- migration redefines it). Every existing column keeps its position; the twelve
-- new ones are APPENDED. Nothing in the joins, the WHERE or the header is
-- retyped from memory — that is the class of change that silently dropped
-- list_discoverable_companies's verified gate.
--
-- THE ONE VISIBILITY CHANGE — the owner arm. `p.profile_visible = true` becomes
-- `(p.profile_visible = true or p.company_id = public.current_company_id())`, so
-- a member of the seller's own company reads their whole catalogue through this
-- door. It attaches to `profile_visible` ONLY. The visibility WINDOW stays
-- outside it: pricelist_item_tier_test.sql:344-356 expires a product and asserts
-- it drops out of this RPC for Alice — a GreenLeaf member, i.e. exactly the cell
-- the owner arm opens — and that is the tree's ONLY guard on the window.
-- NULL logic: current_company_id() is NULL for a companyless person, giving
-- `NULL or true = true` and `NULL or false = NULL` → row filtered. No half-row.
--
-- THE SECOND VISIBILITY CHANGE — unfiled products are not served to buyers.
-- A product with no `location` is withheld unless the caller is a member of the
-- owning company. Decided at T05's G4 (DECISIONS 2026-08-22): a product always
-- has a location, so "unfiled" is a legacy state, not a shelf — the buyer's shop
-- has no vocabulary for it, and rendering it produced a divider counting 4 above
-- five cards. The owner exception is not symmetry for its own sake: unfiled rows
-- are filed by dragging them out of the `Unassigned` pile in AssignProductsDialog,
-- so withholding them from the owner too would strand them permanently.
-- NULL logic differs from the arm above: `p.location is not null` is never NULL,
-- so a filed product short-circuits to true for every caller, including a
-- companyless one. Unfiled + companyless gives `false or NULL` = NULL → filtered.
--
-- TERPENE — reproduces src/modules/catalog/shop.ts:249 exactly, so the buyer's
-- Terp% can never disagree with the seller's: the manual `p.terpene_percent`
-- column wins, and the fallback is the sum of the REPRESENTATIVE batch's terpene
-- rows. Representative = pick FIRST (latest ready_for_sale_date nulls last, then
-- newest created_at, over LIVE lots only — shop.ts:214 excludes soft-deleted
-- lots from the pick), THEN sum that one batch's rows. A join-then-limit body is
-- wrong in exactly one shape: when the representative batch carries no terpene
-- rows but an older lot does, the answer is NULL, not the older lot's sum.
--
-- ⚠️ ALIAS HYGIENE: `terpene_percent`, `location` and `packaging_material` are
-- now OUT parameter names, hence visible identifiers inside a `language sql`
-- body. Every reference below is table-qualified and no lateral exposes a
-- colliding output name — the existing body survives for the same reason.
-- ============================================================================

drop function if exists public.get_discoverable_shop(uuid);

create function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                 uuid,
  name               text,
  cultivar           text,
  thc_percent        numeric,
  cbd_percent        numeric,
  pack_size_grams    numeric,
  unit_code          text,
  local_code_pzn     text,
  dominance_code     text,
  country_of_origin  text,
  region             text,
  images             jsonb,   -- ordered [] of {id, path, position}; never null
  price_public       boolean, -- the seller's price dial, so the UI can tell
                              -- "price on request" from "price not set yet"
  price_per_gram     numeric, -- null unless price_public
  tiers              jsonb,   -- ordered [] of {id, min_grams, price_per_gram};
                              -- null unless price_public
  -- ---- T05: the specification set (AC 7) + location + media ----
  cbg_percent        numeric,
  cbn_percent        numeric,
  terpene_percent    numeric, -- manual column, else the representative lot's sum
  cultivator         text,
  lineage_parent_a   text,
  lineage_parent_b   text,
  irradiation_code   text,
  packaging_material text,
  resealable         boolean,
  location           text,    -- the seller's shelf name; produces the location tabs
  pack_sizes         jsonb,   -- ONLY metadata->'pack_sizes'; null when unset
  media              jsonb    -- ordered [] of {id, kind, path, url, label}; never null
)
language sql
stable
security definer
set search_path to ''
as $$
  select
    p.id,
    p.name::text,
    p.cultivar::text,
    p.thc_percent,
    p.cbd_percent,
    p.pack_size_grams,
    p.unit_code::text,
    p.local_code_pzn::text,
    p.dominance_code::text,
    p.country_of_origin::text,
    p.region::text,
    coalesce(imgs.images, '[]'::jsonb),
    p.price_public,
    case when p.price_public then v.price_per_gram end,
    case when p.price_public then v.tiers          end,
    p.cbg_percent,
    p.cbn_percent,
    -- manual first, representative-lot sum second (shop.ts:249)
    coalesce(p.terpene_percent, terp.terpene_sum),
    p.cultivator::text,
    p.lineage_parent_a::text,
    p.lineage_parent_b::text,
    p.irradiation_code::text,
    p.packaging_material::text,
    p.resealable,
    p.location::text,
    -- ONE named key, never the whole metadata blob (the leak rule)
    p.metadata -> 'pack_sizes',
    coalesce(med.media_items, '[]'::jsonb)
  from public.product p
  join public.company c
    on c.id = p.company_id
   and c.id = p_company_id
   and c.deleted_at is null
   and c.verification_status = 'verified'
  -- ordered image gallery; LEFT so a product with no images still returns ([])
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('id', pi.id, 'path', pi.image_path, 'position', pi.position)
             order by pi.position
           ) as images
    from public.product_image pi
    where pi.product_id = p.id
  ) imgs on true
  -- ordered "Documents & media" list, mirroring imgs; LEFT + coalesce so a
  -- product with no media still returns and its card back renders empty.
  left join lateral (
    select jsonb_agg(
             jsonb_build_object(
               'id',    pm.id,
               'kind',  pm.kind,
               'path',  pm.path,
               'url',   pm.url,
               'label', pm.label
             )
             order by pm.position
           ) as media_items
    from public.product_media pm
    where pm.product_id = p.id
  ) med on true
  -- The representative lot, PICKED FIRST over live lots only…
  left join lateral (
    select pb.id as batch_id
    from public.product_batch pb
    where pb.product_id = p.id
      and pb.deleted_at is null
    order by pb.ready_for_sale_date desc nulls last, pb.created_at desc
    limit 1
  ) rep on true
  -- …THEN summed. No rows on that lot → sum over zero rows → NULL, which is
  -- what deriveTerpPercent returns for a lot with no terpene rows.
  left join lateral (
    select round(sum(coalesce(bt.percent, 0)), 2) as terpene_sum
    from public.batch_terpene bt
    where bt.product_batch_id = rep.batch_id
  ) terp on true
  -- the one current price row (+ ladder) — the view already picks
  -- published_at desc nulls last, created_at desc
  left join public.current_pricelist_item v
    on v.product_id = p.id
  where p.deleted_at is null
    -- THE OWNER ARM. Attaches to profile_visible ONLY — see the header.
    and (p.profile_visible = true or p.company_id = public.current_company_id())
    -- UNFILED IS NOT A SHELF. Withheld from buyers; the owner keeps it so the
    -- `Unassigned` pile stays fileable — see the header.
    and (p.location is not null or p.company_id = public.current_company_id())
    and (p.visibility_start is null or p.visibility_start <= current_date)
    and (p.visibility_end   is null or p.visibility_end   >= current_date)
    and public.is_caller_verified()
  order by p.name;
$$;

-- Full 3-statement grant ritual (sec01 pattern, 20260617090000 — a 2-statement
-- copy is how 20260618120100 reopened the anon door):
revoke all     on function public.get_discoverable_shop(uuid) from public;
grant  execute on function public.get_discoverable_shop(uuid) to authenticated;
revoke execute on function public.get_discoverable_shop(uuid) from anon;
