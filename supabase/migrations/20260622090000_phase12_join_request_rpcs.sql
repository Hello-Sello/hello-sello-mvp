-- ============================================================================
-- Phase 12 — Path B: join an existing company (PATHB-02 / 03 / 04)
-- ----------------------------------------------------------------------------
-- The ENTIRE net-new schema surface for Path B: five SECURITY DEFINER RPCs,
-- one partial-unique index ("one active pending request"), and four join.*
-- audit action codes. This is an ADDITIVE migration only.
--
-- ALREADY SHIPPED in Phase 1 — DO NOT recreate (any of these turns db reset RED):
--   • TABLE join_request                  — 20260607090002_phase1_core.sql:217
--   • lookup join_request_status          — 20260607090001_lookups_and_seeds.sql:348
--       codes: pending | approved | rejected | cancelled  (NO 'withdrawn';
--       'cancelled' IS the requester-withdraw terminal status)
--   • auditable_content_type 'join_request' — 20260607090001:525  (DO NOT re-insert)
--   • RLS jr_select / jr_insert / jr_update — 20260607170000_rls_policies.sql:239
--   • helpers current_company_id(), has_permission('team.manage') — definer helpers
--
-- Cross-cutting discipline applied to ALL five RPCs (PATTERNS SP-1):
--   language ... security definer set search_path = ''  + fully-qualified
--   identifiers (public.x) + the two-door grant
--   (revoke all from public; grant execute to authenticated).
--
-- audit_log.company_id is UUID NOT NULL (20260607090002:258). A company-less
-- requester's current_company_id() is NULL, so the two REQUESTER-side audits
-- (join.requested / join.withdrawn) MUST use the TARGET company id, never
-- current_company_id() — else the NOT NULL constraint fires and the RPC raises.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) One-active-request partial-unique index (D-12).
--     Mirrors uq_person_group_group_active (20260607090002:137-139).
--     A concurrent double-submit hits a unique violation (SQLSTATE 23505),
--     race-free. Re-request after reject/cancel is allowed — terminal rows fall
--     OUTSIDE the partial predicate.
-- ----------------------------------------------------------------------------
create unique index uq_join_request_active_pending
  on public.join_request (requester_person_id)
  where status = 'pending' and deleted_at is null;

-- ----------------------------------------------------------------------------
-- (2) Seed the four join.* audit action codes (D-13). Incremental insert with
--     on conflict do nothing (mirror 20260621100000:159). NOTE: the AUDIT action
--     for a withdraw is 'join.withdrawn' even though the row STATUS it writes is
--     'cancelled' — three intentionally-different strings.
--     The 'join_request' content type already ships (20260607090001:525) — this
--     migration does NOT re-seed it.
-- ----------------------------------------------------------------------------
insert into public.audit_action_type (code, description, category) values
  ('join.requested', 'A person requested to join a company', 'lifecycle'),
  ('join.approved',  'A Superadmin approved a join request',  'lifecycle'),
  ('join.rejected',  'A Superadmin rejected a join request',  'lifecycle'),
  ('join.withdrawn', 'A requester withdrew a join request',   'lifecycle')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- (3) search_joinable_companies(p_term text) — company-less-safe curated search
--     (D-05 / D-06). Mirrors the list_discoverable_companies projection
--     (20260618120100) but DROPS the current_company_id() access gate and the
--     connection_state CASE — the caller has no company yet. verified-only is
--     the hard filter (T-12-02-I). Plain ILIKE (no pg_trgm — small set, A2).
--     Exactly four OUT columns: id / name / city / logo_path.
-- ----------------------------------------------------------------------------
create or replace function public.search_joinable_companies(p_term text)
returns table (id uuid, name text, city text, logo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name::text, c.city::text, c.logo_path::text
    from public.company c
   where c.deleted_at is null
     and c.verification_status = 'verified'
     and (p_term is null or p_term = '' or c.name ilike '%' || p_term || '%')
   order by (c.name ilike p_term || '%') desc, c.name   -- prefix matches first, then alpha
   limit 50;
$$;
revoke all on function public.search_joinable_companies(text) from public;
grant execute on function public.search_joinable_companies(text) to authenticated;

-- ----------------------------------------------------------------------------
-- (4) list_pending_join_requests() — Superadmin-gated queue read (D-07 / D-14).
--     Mirrors list_pending_verifications (20260617094200:19-60), swapping the
--     gate is_hs_team() -> has_permission('team.manage') and scoping to
--     current_company_id(). A non-Superadmin gets 0 rows (fail-safe). The name
--     projection is the CANONICAL display_name (20260620120000), coalesced to
--     first_name||' '||last_name (both NOT NULL) as a defensive fallback — there
--     is NO p.name column. Oldest-first.
-- ----------------------------------------------------------------------------
create or replace function public.list_pending_join_requests()
returns table (
  id                  uuid,
  requester_person_id uuid,
  requester_name      text,
  note                text,
  requested_at        timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    jr.id,
    jr.requester_person_id,
    coalesce(p.display_name, p.first_name || ' ' || p.last_name) as requester_name,
    jr.note,
    jr.created_at                                                as requested_at
  from public.join_request jr
  join public.person p on p.id = jr.requester_person_id
  where jr.target_company_id = public.current_company_id()   -- tenant scope (NULL ⇒ 0 rows)
    and jr.status = 'pending'
    and jr.deleted_at is null
    and public.has_permission('team.manage')                 -- non-Superadmin ⇒ 0 rows (fail-safe)
  order by jr.created_at asc;
$$;
revoke all on function public.list_pending_join_requests() from public;
grant execute on function public.list_pending_join_requests() to authenticated;
