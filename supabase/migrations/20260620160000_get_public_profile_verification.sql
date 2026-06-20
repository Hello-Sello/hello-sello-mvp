-- ============================================================================
-- Migration — get_public_profile RPC + company_verification_status (ACCT-01)
-- ----------------------------------------------------------------------------
-- The public business card /c/[handle] is anon-readable and shows ANY company
-- (verified or not) — unlike the RPC-gated Discover surfaces which hard-filter
-- verification_status='verified'. So the card needs the REAL status threaded
-- through to gate the form-E "Verified" pill (D-02: renders only when verified).
--
-- Extends the curated 13-field def (20260615123000_get_public_profile.sql) by ONE
-- column — company_verification_status — appended LAST so the existing positional
-- PostgREST result keys stay stable (PublicRow maps by name, not ordinal, but the
-- 13-column order is preserved verbatim regardless).
--
-- Security (ASVS V4): unchanged from the live def. SECURITY DEFINER but returns
-- ONLY the curated card fields; verification_status is a coarse PUBLIC trust marker
-- (already public on Discover), no new sensitive surface. search_path stays empty →
-- every reference schema-qualified (blocks search_path hijack). revoke all from
-- public, then grant execute to anon + authenticated only — no broader grant.
-- ============================================================================

create or replace function public.get_public_profile(p_handle text)
returns table(
  display_name text, title text, avatar_path text, phone text, links jsonb,
  email text, company_name text, company_tagline text, company_about text,
  company_products text, company_country text, company_website text, company_logo_path text,
  company_verification_status text                                   -- NEW (14th)
)
language sql
security definer
set search_path to ''
as $function$
  select p.display_name, p.title, p.avatar_path, p.phone, p.links, u.email::text,
         c.name, c.tagline, c.description, c.primary_products, c.country, c.website, c.logo_path,
         c.verification_status::text                                 -- NEW
  from public.person p
  join auth.users u on u.id = p.id
  left join public.company c on c.id = p.company_id
  where p.public_handle = p_handle and p.deleted_at is null
  limit 1;
$function$;

revoke all on function public.get_public_profile(text) from public;
grant execute on function public.get_public_profile(text) to anon, authenticated;
