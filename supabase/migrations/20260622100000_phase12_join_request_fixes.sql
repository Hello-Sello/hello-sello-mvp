-- ============================================================================
-- Phase 12 — Path B fixes (code-review follow-up to 20260622091500)
-- ----------------------------------------------------------------------------
-- Two SECURITY DEFINER RPCs re-defined via `create or replace` (additive; no
-- schema change). Mirrors the phase-11 fix-migration pattern
-- (20260621150000_phase11_lockout_race_fix.sql) rather than editing the shipped
-- 091500 migration, which is already merged + in teammates' local DBs.
--
-- FIX A (request_to_join): reject a caller who ALREADY belongs to a company.
--   Before, the only defense was the approval-time `person.company_id IS NULL`
--   guard in approve_join_request — which fires AFTER flipping status->approved
--   (rolled back, but the row stays pending and re-appears in the target queue).
--   An existing member could POST request_to_join(otherCompany) directly and
--   pollute that company's queue. We now fail fast at submit. The RAISE string
--   matches approve_join_request's existing 'requester already belongs to a
--   company', so the 12-03 action layer's existing branch maps it to the
--   "You're already part of a company." copy.
--
-- FIX B (approve_join_request): never silently downgrade a Superadmin approval.
--   If p_role='superadmin' but the company has no live 'Superadmin' group, the
--   old code skipped the person_group insert AND still wrote a join.approved
--   audit with role='superadmin' — linking the person as an effective Member
--   with an audit trail that lies about their role. We now RAISE, rolling back
--   the whole approval atomically.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX A — request_to_join: company-less guard added at the top (rest unchanged).
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
  -- A caller who already belongs to a company must not be able to request to join
  -- another (defense-in-depth). current_company_id() is NULL only for a
  -- company-less caller; the same RAISE string approve_join_request uses so the
  -- action layer maps it to the existing "already part of a company" copy.
  if public.current_company_id() is not null then
    raise exception 'requester already belongs to a company';
  end if;

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
-- FIX B — approve_join_request: RAISE when a superadmin approval has no group to
-- grant (rest of the function unchanged from 091500).
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
  --     §9 lockdown). Member inserts NO group row. A missing group must NOT be a
  --     silent no-op: that would link the person as an effective Member while the
  --     audit below records role='superadmin'. RAISE rolls back the whole approval.
  if p_role = 'superadmin' then
    select g.id
      into v_group_id
      from public."group" g
     where g.company_id = v_company_id
       and g.name = 'Superadmin'
       and g.deleted_at is null
     limit 1;
    if v_group_id is null then
      raise exception 'superadmin group missing for company %', v_company_id;
    end if;
    insert into public.person_group (person_id, group_id)
    values (v_requester, v_group_id)
    on conflict do nothing;   -- idempotent vs uq_person_group_group_active
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
