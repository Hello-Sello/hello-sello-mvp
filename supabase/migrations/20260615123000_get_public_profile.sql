-- ============================================================================
-- Migration — get_public_profile RPC (DATA-01, F3 drift backfill)
-- ----------------------------------------------------------------------------
-- The curated anon-facing read for /c/[handle]. Body captured VERBATIM from the
-- cloud DB (ref byipusuthdlskdxoexkt) via Supabase MCP pg_get_functiondef
-- (2026-06-16) — not reconstructed. Retires the get_public_profile half of the
-- F3 drift; after this, repo == local == cloud.
--
-- Security (ASVS V4): SECURITY DEFINER but returns ONLY the 13 curated card
-- fields (never select-star); the person/auth.users tables stay closed to anon.
-- search_path is empty → every reference is schema-qualified (Pitfall 4, blocks
-- search_path hijack). revoke all from public, then grant execute to anon +
-- authenticated (reproduces the live hardened grants). `language sql security
-- definer` (NOT stable) — matches live so `supabase db diff` shows parity.
-- company_products <- company.primary_products; company_logo_path <- company.logo_path.
-- ============================================================================

create or replace function public.get_public_profile(p_handle text)
returns table(
  display_name text, title text, avatar_path text, phone text, links jsonb,
  email text, company_name text, company_tagline text, company_about text,
  company_products text, company_country text, company_website text, company_logo_path text
)
language sql
security definer
set search_path to ''
as $function$
  select p.display_name, p.title, p.avatar_path, p.phone, p.links, u.email::text,
         c.name, c.tagline, c.description, c.primary_products, c.country, c.website, c.logo_path
  from public.person p
  join auth.users u on u.id = p.id
  left join public.company c on c.id = p.company_id
  where p.public_handle = p_handle and p.deleted_at is null
  limit 1;
$function$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;
