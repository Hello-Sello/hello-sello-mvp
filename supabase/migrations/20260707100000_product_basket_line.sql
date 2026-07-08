-- ============================================================================
-- Migration — Product Basket (persistent per-person cart, DECISIONS 2026-06-29)
-- ----------------------------------------------------------------------------
-- Additive-only. One new table + its owner-scoped RLS. No touch to deal_card /
-- deal_line_item / any existing policy. The cart is the "Product Basket" layer
-- (CONTEXT.md): products a person has added, grouped-by-seller at read time via
-- product.company_id. It stores pack_count + pack_size_grams (never grams) — the
-- "Pack (basket quantity)" rule — and grams are computed only at Send.
-- ============================================================================

create table public.product_basket_line (
  id              uuid primary key default gen_random_uuid(),
  owner_person_id uuid not null references public.person(id) on delete cascade,
  product_id      uuid not null references public.product(id) on delete cascade,
  pack_count      numeric not null default 1,
  pack_size_grams numeric,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (owner_person_id, product_id)
);

alter table public.product_basket_line enable row level security;

-- Owner-only: a person reads/writes ONLY their own cart lines. auth.uid() is the
-- person id (person.id == auth.users.id on this platform).
create policy basket_line_owner_all on public.product_basket_line
  for all
  to authenticated
  using (owner_person_id = auth.uid())
  with check (owner_person_id = auth.uid());
