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

-- ----------------------------------------------------------------------------
-- (5) request_to_join(p_company_id uuid, p_note text) -> uuid (PATHB-02, D-04/D-11/D-12).
--     The requester writes their OWN join_request row (allowed by jr_insert /
--     jr_select on requester_person_id = auth.uid()), so the create-then-link
--     trap does NOT apply here. Validate the target is verified BEFORE insert
--     (T-12-02-T1) and capture its name in the SAME guard query so the pending
--     screen can render the company name from metadata without a company read.
--     Audit join.requested in-RPC (SP-2) with company_id = p_company_id (the
--     verified TARGET), NEVER current_company_id() — the caller is company-less
--     so current_company_id() is NULL and would violate audit_log.company_id
--     NOT NULL. The partial-unique index is the duplicate guard: a concurrent
--     second submit raises a raw unique_violation (SQLSTATE 23505), which this
--     RPC does NOT catch (the 12-03 action layer maps it to the D-12 copy).
-- ----------------------------------------------------------------------------
create or replace function public.request_to_join(p_company_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_company_name text;
  v_request_id   uuid;
begin
  -- Tampering guard: target must be an EXISTING, VERIFIED company. Read its name
  -- in the same query so we never re-read company afterwards.
  select c.name::text
    into v_company_name
    from public.company c
   where c.id = p_company_id
     and c.deleted_at is null
     and c.verification_status = 'verified';
  if not found then
    raise exception 'company not found or not verified';
  end if;

  insert into public.join_request
    (requester_person_id, target_company_id, status, note, metadata)
  values
    (v_uid, p_company_id, 'pending', p_note,
     jsonb_build_object('company_name', v_company_name))
  returning id into v_request_id;

  -- Requester-side audit: company_id = the verified TARGET (p_company_id), NEVER
  -- current_company_id() (NULL for a company-less caller -> NOT NULL violation).
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (p_company_id, v_uid, 'user', 'join.requested', 'join_request', v_request_id,
     jsonb_build_object('company_name', v_company_name));

  return v_request_id;
end;
$$;
revoke all on function public.request_to_join(uuid, text) from public;
grant execute on function public.request_to_join(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (6) approve_join_request(p_request_id uuid, p_role text default 'member') -> void
--     The atomic core (PATHB-03, D-08/D-11/D-14). All DIRECT definer writes —
--     never re-SELECT a freshly-company-linked row through RLS (the
--     create-then-link trap). Exact order:
--       (1) gate has_permission('team.manage') + validate p_role; capture the
--           approver's company (= the target) as v_company_id.
--       (2) flip status->approved, tenant-scoped + pending-guarded, RETURNING the
--           requester; IF NOT FOUND RAISE (cross-company/double-decision guard).
--       (3) atomically link person.company_id WHERE company_id IS NULL; IF NOT
--           FOUND RAISE (defends the raced Path-A self-onboard, T-12-02-T3).
--       (4) IF p_role='superadmin' join the company's EXISTING Superadmin group
--           (§9 made person_group SELECT-only — this write is definer-only).
--           Member = NO group row (Member is the absence of Superadmin).
--       (5) audit join.approved in-RPC (company_id = v_company_id = the target).
-- ----------------------------------------------------------------------------
create or replace function public.approve_join_request(p_request_id uuid, p_role text default 'member')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
  v_requester  uuid;
  v_group_id   uuid;
begin
  -- (1) gate + role domain
  if not public.has_permission('team.manage') then
    raise exception 'forbidden';
  end if;
  if p_role not in ('member', 'superadmin') then
    raise exception 'invalid role: %', p_role;
  end if;
  v_company_id := public.current_company_id();   -- the approver's company = the target

  -- (2) flip status (tenant scope D-14 + double-decision guard)
  update public.join_request
     set status     = 'approved',
         decided_by = v_uid,
         decided_at = now(),
         updated_at = now()
   where id = p_request_id
     and target_company_id = v_company_id
     and status = 'pending'
  returning requester_person_id into v_requester;
  if not found then
    raise exception 'join request not pending or not in your company';
  end if;

  -- (3) atomic person link (mirrors onboard_company:62-64; IS NULL guards the
  --     raced Path-A self-onboard between request and approval)
  update public.person
     set company_id = v_company_id,
         updated_at = now()
   where id = v_requester
     and company_id is null;
  if not found then
    raise exception 'requester already belongs to a company';
  end if;

  -- (4) Superadmin role -> join the EXISTING Superadmin group (definer-only write,
  --     §9 lockdown). Member inserts NO group row.
  if p_role = 'superadmin' then
    select g.id
      into v_group_id
      from public."group" g
     where g.company_id = v_company_id
       and g.name = 'Superadmin'
       and g.deleted_at is null
     limit 1;
    if v_group_id is not null then
      insert into public.person_group (person_id, group_id)
      values (v_requester, v_group_id)
      on conflict do nothing;   -- idempotent vs uq_person_group_group_active
    end if;
  end if;

  -- (5) audit join.approved in-RPC (company_id = the target company)
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'join.approved', 'join_request', p_request_id,
     jsonb_build_object('requester', v_requester, 'role', p_role));
end;
$$;
revoke all on function public.approve_join_request(uuid, text) from public;
grant execute on function public.approve_join_request(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (7a) reject_join_request(p_request_id uuid, p_reason text) -> void (D-08).
--      Superadmin + tenant + pending guarded. Flips status->rejected, stores the
--      optional reason in join_request.rejection_reason, audits join.rejected
--      (reason in audit_log.reason). IF NOT FOUND RAISE comes BEFORE the audit
--      insert. The approver IS in the target company, so company_id = the target
--      (= current_company_id()) is non-NULL and correct here.
-- ----------------------------------------------------------------------------
create or replace function public.reject_join_request(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
begin
  if not public.has_permission('team.manage') then
    raise exception 'forbidden';
  end if;
  v_company_id := public.current_company_id();

  update public.join_request
     set status           = 'rejected',
         rejection_reason  = p_reason,
         decided_by        = v_uid,
         decided_at        = now(),
         updated_at        = now()
   where id = p_request_id
     and target_company_id = v_company_id
     and status = 'pending';
  if not found then
    raise exception 'join request not pending or not in your company';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_company_id, v_uid, 'user', 'join.rejected', 'join_request', p_request_id,
     p_reason, '{}'::jsonb);
end;
$$;
revoke all on function public.reject_join_request(uuid, text) from public;
grant execute on function public.reject_join_request(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- (7b) withdraw_join_request(p_request_id uuid) -> void (D-08/D-12).
--      Requester-owned guarded. Flips status->'cancelled' (NEVER 'withdrawn' —
--      'cancelled' IS the terminal status; only the AUDIT action is
--      join.withdrawn). The cancelled row's target_company_id is captured via
--      RETURNING in the SAME update.
--
--      CODE ORDER (review HIGH #2): the IF NOT FOUND RAISE MUST come immediately
--      after the update and BEFORE the audit insert. A zero-row update (wrong
--      requester / already terminal) leaves v_company_id NULL; if the audit
--      insert ran first it would trip audit_log.company_id NOT NULL and surface a
--      confusing 'null value violates not-null constraint' instead of the
--      friendly 'request not found'. The requester is company-less, so the audit
--      company_id MUST be the cancelled row's target_company_id, NEVER
--      current_company_id() (NULL here).
-- ----------------------------------------------------------------------------
create or replace function public.withdraw_join_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid;
begin
  update public.join_request
     set status     = 'cancelled',
         updated_at = now()
   where id = p_request_id
     and requester_person_id = v_uid
     and status = 'pending'
  returning target_company_id into v_company_id;
  -- Guard BEFORE the audit insert (v_company_id is now non-NULL on the success path).
  if not found then
    raise exception 'request not found';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'join.withdrawn', 'join_request', p_request_id, '{}'::jsonb);
end;
$$;
revoke all on function public.withdraw_join_request(uuid) from public;
grant execute on function public.withdraw_join_request(uuid) to authenticated;
