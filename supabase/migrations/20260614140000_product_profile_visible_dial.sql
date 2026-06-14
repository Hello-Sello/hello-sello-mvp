-- Slice 4 · P1 — the profile_visible dial + its enforcement (introduced atomically).
-- ----------------------------------------------------------------------------
-- Dial A of the soft-openness model: a seller opts each product onto their public
-- profile. Default OFF, so nothing leaks until the seller opts in (the toggle =
-- slice 5). The column and its RLS enforcement ship together so the dial is never
-- a moment where it exists but means nothing.
--
-- The tightened public-read is the floor that makes Dial A real: before this, the
-- product_public_select policy exposed EVERY in-window product to any anon/auth
-- user (the dial would have been cosmetic — bypassable via a direct PostgREST read).
-- It's a SELECT-only policy OR'd on top of the company-scoped product_all write
-- policy, so own-company access and write isolation are untouched. Blast radius
-- traced in docs/muskan-build/discover-connect-loop.md (no current cross-tenant
-- reader breaks; the deal-picker correctly narrows to own-company).
-- ----------------------------------------------------------------------------

-- 1. the dial
alter table public.product
  add column if not exists profile_visible boolean not null default false;

-- 2. partial index — RLS adds this predicate to every public product read
create index if not exists idx_product_company_profile_visible
  on public.product (company_id) where profile_visible;

-- 3. enforce the dial: the public catalogue read now shows ONLY opted-in products
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to anon, authenticated
  using (deleted_at is null
         and profile_visible = true
         and (visibility_start is null or visibility_start <= current_date)
         and (visibility_end   is null or visibility_end   >= current_date));
