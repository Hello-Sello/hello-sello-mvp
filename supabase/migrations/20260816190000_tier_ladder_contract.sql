-- ============================================================================
-- Tier ladder Migration C (contract) — ADR-0004 rev 8 §3 · PRD 0021 · T08.
-- ----------------------------------------------------------------------------
-- Held at docs/muskan-build/0021-tier-ladder/contract-migration.sql.hold until
-- all three move conditions passed (2026-08-16):
--   (a) tiers-reading app (T03–T07) verified LIVE on production (Vercel deploy
--       READY `714d738` + Muskan's G5 live walk);
--   (b) every body below RE-DIFFED against the LIVE cloud definitions
--       (pg_get_viewdef / pg_get_functiondef) at move time — ZERO drift found:
--       live == hold-file text except exactly the two documented deltas
--       (get_discoverable_shop loses the legacy OUT columns + pli2 join;
--       import_products stops naming the dropped columns in its insert);
--       only the three handles below reference the columns, no blocking views;
--   (c) fresh timestamp filename (this file; authored 2026-08-14).
--
-- What C does, in order: DROP VIEW → drop the two legacy bundle columns →
-- re-CREATE the view + re-grants (the view never projected the columns; the
-- drop/create dance keeps C dependency-proof) → both RPCs re-declared
-- tiers-only with full grant rituals → drop the one-shot backfill fn.
-- Seed §6c strip + types regen ride the same PR.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the view first (belt-and-braces: it doesn't project the bundle
--    columns, but the dance makes the column drop dependency-proof, ADR §3).
-- ----------------------------------------------------------------------------
DROP VIEW public.current_pricelist_item;

-- ----------------------------------------------------------------------------
-- 2. The contract: the two legacy bundle-bracket columns go. Their data was
--    moved by E's backfill (well-formed → one rung; malformed →
--    metadata.legacy_bundle, recoverable).
-- ----------------------------------------------------------------------------
ALTER TABLE public.pricelist_item DROP COLUMN bundle_threshold_grams;
ALTER TABLE public.pricelist_item DROP COLUMN bundle_price_per_gram;

-- ----------------------------------------------------------------------------
-- 3. Re-create current_pricelist_item + re-grants. Re-diffed against the LIVE
--    pg_get_viewdef 2026-08-16 (identical). Owner-rights (NOT
--    security_invoker) is deliberate (ADR §4); the security_definer_view
--    advisor finding is accepted, pre-declared in the ADR. Deliberately NO
--    status_code filter.
-- ----------------------------------------------------------------------------
CREATE VIEW public.current_pricelist_item
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
  AND (
    pl.company_id = public.current_company_id()          -- owner arm
    OR (                                                  -- public arm
      p.deleted_at IS NULL AND p.profile_visible
      AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)
      AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
      AND p.price_public
      AND public.is_caller_verified()
    )
  )
ORDER BY pli.product_id, pl.published_at DESC NULLS LAST, pli.created_at DESC;

GRANT SELECT ON public.current_pricelist_item TO authenticated;
REVOKE ALL ON public.current_pricelist_item FROM anon;

-- ----------------------------------------------------------------------------
-- 4. get_discoverable_shop — tiers-only. DROP + CREATE (the OUT column list
--    changes: the two legacy bundle columns are GONE, and with them the pli2
--    join E needed to read them). Base body re-diffed against the LIVE
--    pg_get_functiondef 2026-08-16 (identical apart from those deltas).
-- ----------------------------------------------------------------------------
drop function if exists public.get_discoverable_shop(uuid);

create function public.get_discoverable_shop(p_company_id uuid)
returns table (
  id                uuid,
  name              text,
  cultivar          text,
  thc_percent       numeric,
  cbd_percent       numeric,
  pack_size_grams   numeric,
  unit_code         text,
  local_code_pzn    text,
  dominance_code    text,
  country_of_origin text,
  region            text,
  images            jsonb,   -- ordered [] of {id, path, position}; never null
  price_public      boolean, -- the seller's price dial, so the UI can tell
                             -- "price on request" from "price not set yet"
  price_per_gram    numeric, -- null unless price_public
  tiers             jsonb    -- ordered [] of {id, min_grams, price_per_gram};
                             -- null unless price_public
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
    case when p.price_public then v.tiers          end
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
  -- the one current price row (+ ladder) — the view already picks
  -- published_at desc nulls last, created_at desc
  left join public.current_pricelist_item v
    on v.product_id = p.id
  where p.deleted_at is null
    and p.profile_visible = true
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

-- ----------------------------------------------------------------------------
-- 5. import_products — stops writing the dropped columns. Base body re-diffed
--    against the LIVE pg_get_functiondef 2026-08-16 (identical apart from the
--    insert delta). Post-C the CSV's single bracket lands as RUNG 1 directly
--    when well-formed (thr > 0, price > 0, price < base); anything malformed
--    with a value present is stamped metadata.legacy_bundle (guard on the
--    EXTRACTED VALUES, not key presence). Only diff from E: the pricelist_item
--    insert no longer names the two dropped columns.
-- ----------------------------------------------------------------------------
create or replace function public.import_products(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company   uuid := current_company_id();
  v_pricelist uuid;
  v_row   jsonb;
  v_prod  jsonb;
  v_pl    jsonb;
  v_cost  jsonb;
  v_batch jsonb;
  v_terp  jsonb;
  v_product_id uuid;
  v_batch_id   uuid;
  v_terp_code  text;
  v_item_id uuid;
  v_thr     numeric;
  v_bpg     numeric;
  v_count int := 0;
begin
  if v_company is null then
    raise exception 'import_products: current user has no company';
  end if;

  -- one company-wide standard pricelist (create on first import)
  select id into v_pricelist
    from pricelist
    where company_id = v_company and deleted_at is null
    order by created_at asc limit 1;
  if v_pricelist is null then
    insert into pricelist (company_id, name, status_code, currency, published_at, created_by)
    values (v_company, 'Standard', 'published', 'EUR', now(), auth.uid())
    returning id into v_pricelist;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_prod  := v_row->'product';
    v_pl    := v_row->'pricelist';
    v_cost  := v_row->'productCost';
    v_batch := v_row->'batch';

    insert into product (
      company_id, name, cultivar, thc_percent, cbd_percent, cbg_percent, cbn_percent,
      pack_size_grams, unit_code, supplier_product_code, local_code_pzn,
      dominance_code, irradiation_code, country_of_origin, region, cultivator,
      lineage_parent_a, lineage_parent_b, packaging_material, resealable,
      rrp_per_gram, visibility_start, visibility_end, price_public,
      metadata, created_by
    ) values (
      v_company,
      v_prod->>'name', v_prod->>'cultivar',
      (v_prod->>'thc_percent')::numeric, (v_prod->>'cbd_percent')::numeric,
      (v_prod->>'cbg_percent')::numeric, (v_prod->>'cbn_percent')::numeric,
      (v_prod->>'pack_size_grams')::numeric, v_prod->>'unit_code',
      v_prod->>'supplier_product_code', v_prod->>'local_code_pzn',
      v_prod->>'dominance_code', v_prod->>'irradiation_code',
      v_prod->>'country_of_origin', v_prod->>'region', v_prod->>'cultivator',
      v_prod->>'lineage_parent_a', v_prod->>'lineage_parent_b',
      v_prod->>'packaging_material', (v_prod->>'resealable')::boolean,
      (v_prod->>'rrp_per_gram')::numeric,
      (v_prod->>'visibility_start')::date, (v_prod->>'visibility_end')::date,
      coalesce((v_prod->>'price_public')::boolean, false),
      case when v_prod ? 'note'
           then jsonb_build_object('note', v_prod->>'note') else '{}'::jsonb end,
      auth.uid()
    ) returning id into v_product_id;

    -- CSV "Image filename" → cover image (position 0). Optional; skipped when blank.
    if coalesce(v_prod->>'image_path', '') <> '' then
      insert into product_image (product_id, company_id, image_path, position)
      values (v_product_id, v_company, v_prod->>'image_path', 0);
    end if;

    if v_pl ? 'price_per_gram' then
      v_thr := (v_pl->>'bundle_threshold_grams')::numeric;
      v_bpg := (v_pl->>'bundle_price_per_gram')::numeric;
      insert into pricelist_item (pricelist_id, product_id, price_per_gram, currency, created_by)
      values (v_pricelist, v_product_id, (v_pl->>'price_per_gram')::numeric,
        'EUR', auth.uid())
      returning id into v_item_id;
      if v_thr > 0 and v_bpg > 0 and v_bpg < (v_pl->>'price_per_gram')::numeric then
        insert into pricelist_item_tier (pricelist_item_id, min_grams, price_per_gram, created_by)
        values (v_item_id, v_thr, v_bpg, auth.uid());
      elsif v_thr is not null or v_bpg is not null then
        update pricelist_item set metadata = metadata
          || jsonb_build_object('legacy_bundle',
               jsonb_build_object('threshold', v_thr, 'price', v_bpg))
        where id = v_item_id;
      end if;
    end if;

    if v_cost ? 'cogs' then
      insert into product_cost (product_id, company_id, cogs, created_by)
      values (v_product_id, v_company, (v_cost->>'cogs')::numeric, auth.uid());
    end if;

    if v_batch ? 'batch_number' or v_batch ? 'thc_percent' then
      insert into product_batch (company_id, product_id, batch_number,
        thc_percent, cbd_percent, ready_for_sale_date, expiry_date, created_by)
      values (v_company, v_product_id, v_batch->>'batch_number',
        (v_batch->>'thc_percent')::numeric, (v_batch->>'cbd_percent')::numeric,
        (v_batch->>'ready_for_sale_date')::date, (v_batch->>'expiry_date')::date, auth.uid())
      returning id into v_batch_id;

      -- terpenes: resolve display name → terpene_code; skip unknowns (don't fail the import)
      for v_terp in select value from jsonb_array_elements(coalesce(v_row->'terpenes','[]'::jsonb))
      loop
        select code into v_terp_code from terpene
          where lower(code) = lower(replace(v_terp->>'name', ' ', '_'))
             or lower(name) = lower(v_terp->>'name')
          limit 1;
        if v_terp_code is not null then
          insert into batch_terpene (product_batch_id, terpene_code, percent)
          values (v_batch_id, v_terp_code, (v_terp->>'pct')::numeric);
        end if;
      end loop;
    end if;

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('imported', v_count, 'pricelist_id', v_pricelist);
end;
$$;

revoke all on function public.import_products(jsonb) from public, anon;
grant execute on function public.import_products(jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. The one-shot backfill fn shipped by E (test-callable, criterion 2) has
--    done its job and its body names the dropped columns — retire it.
-- ----------------------------------------------------------------------------
DROP FUNCTION public.backfill_bundle_to_tiers();
