-- SEC-01 + GAP-1 — gate the three Discover RPCs on the CALLER's own verification,
-- and close the anon EXECUTE grant door.
-- ----------------------------------------------------------------------------
-- The Discover RPCs (list_discoverable_companies / get_discoverable_company /
-- get_discoverable_shop) filter the TARGET company by verification_status =
-- 'verified' but never check the CALLER. So any logged-in user — even an
-- unverified one — could browse the whole verified directory + every verified
-- company's profile and opted-in catalogue, and anon could too (Supabase
-- auto-grants EXECUTE to anon on every public function).
--
-- This migration closes BOTH doors (two-door discipline):
--   * BODY gate  — a new public.is_caller_verified() helper, added as one
--     predicate to each RPC's WHERE clause. false ⇒ the SELECT returns 0 rows
--     (empty return, matching the existing "nothing to show" client contract).
--   * GRANT gate — revoke the auto-granted anon EXECUTE on all three RPCs so
--     an unauthenticated caller can't even invoke the function.
--
-- The RPCs run `set search_path to ''`, so the helper is called fully-qualified
-- (public.is_caller_verified()). The helper itself pins search_path = public.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. The single authoritative caller-verified gate (mirrors is_hs_team()).
--    anon ⇒ current_company_id() is NULL ⇒ no match ⇒ false (fail-safe deny).
-- ----------------------------------------------------------------------------
create or replace function public.is_caller_verified()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.company c
    where c.id = public.current_company_id()
      and c.verification_status = 'verified'
      and c.deleted_at is null
  );
$$;

revoke all on function public.is_caller_verified() from public;
grant execute on function public.is_caller_verified() to authenticated;
