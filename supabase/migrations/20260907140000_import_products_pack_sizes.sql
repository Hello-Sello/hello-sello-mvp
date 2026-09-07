-- import_products gains the "Additional pack sizes (g)" CSV column.
--
-- Base body re-diffed against the LIVE pg_get_functiondef 2026-09-07 (identical
-- to 20260816190000_tier_ladder_contract.sql's version apart from the metadata
-- expression below). Only change: product.metadata now also carries pack_sizes
-- when the row's `product` object has that key — the same "extra sellable pack
-- sizes" array ProductCard's "Edit details" dialog writes today
-- (product.metadata.pack_sizes, ADR-0004 §5's packSizes()), so a CSV/manual-add
-- row can set it at creation instead of a required follow-up card edit.
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
      (case when v_prod ? 'note'
            then jsonb_build_object('note', v_prod->>'note') else '{}'::jsonb end)
      || (case when v_prod ? 'pack_sizes'
            then jsonb_build_object('pack_sizes', v_prod->'pack_sizes') else '{}'::jsonb end),
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
