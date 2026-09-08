-- A seller's named shop/warehouse, promoted from the free-text product.location
-- label so it can be renamed once and reordered deliberately. Renaming used to
-- mean rewriting the label on every product row; the name now lives on one row.
-- Position mirrors product_image.position / product_media.position — integer
-- position, full-list renumber on every reorder.

create table public.shop_location (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  name       varchar(80) not null,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create index idx_shop_location_company on public.shop_location(company_id, position);
-- Stops two shops silently collapsing into one on rename.
create unique index uq_shop_location_company_name on public.shop_location(company_id, name);

alter table public.product
  add column location_id uuid references public.shop_location(id) on delete set null;
create index idx_product_location_id on public.product(location_id);

alter table public.shop_location enable row level security;

-- Door 1 of 2 — the GRANT that PostgREST checks first. This table is seller-only:
-- no buyer view, deal doc or order doc reads a shop's name, so anon gets nothing.
revoke all on public.shop_location from anon;
grant select, insert, update, delete on public.shop_location to authenticated;

-- Door 2 of 2 — the row filter. Company-scoped, mirrors product_all.
create policy shop_location_all on public.shop_location for all to authenticated
  using (company_id = current_company_id())
  with check (company_id = current_company_id());

-- Backfill: one row per distinct existing label, alphabetical for a stable start.
insert into public.shop_location (company_id, name, position)
select p.company_id,
       btrim(p.location),
       (row_number() over (partition by p.company_id order by btrim(p.location)) - 1)::smallint
  from public.product p
 where p.location is not null and btrim(p.location) <> ''
 group by p.company_id, btrim(p.location);

update public.product p
   set location_id = sl.id
  from public.shop_location sl
 where sl.company_id = p.company_id
   and sl.name = btrim(p.location);
