-- ============================================================================
-- Phase 11 (11-05) — Team-management mutation RPCs (RBAC-02 / RBAC-03 / RBAC-04)
-- ----------------------------------------------------------------------------
-- The three team mutations + the team-list read, all as the proven
-- route→action→SECURITY DEFINER RPC→audit chain (D-18). Each is tenant-scoped to
-- current_company_id() and Superadmin-gated through the QUERIED matrix
-- (has_permission('team.manage'), built in plan 02). These RPCs are what turn the
-- RED rbac_enforcement_test.sql (plan 01) GREEN for the right reason — the SC3
-- lockout guard fires instead of a missing-function error.
--
--   change_member_role(p_person_id, p_role)  — add/remove the Superadmin person_group
--       row; D-15 lockout RAISE before demoting the last Superadmin; team.role_changed.
--   remove_member(p_person_id)               — null company_id (instant cross-company
--       RLS deny via the live current_company_id()) + soft-delete person_group +
--       team.member_removed audit; D-15 lockout RAISE. Refresh-token revoke is app-side
--       in actions.ts (resolved D-11) — the DB closes the data window first.
--   invite_member(p_email, p_role)           — role + not-already-member precheck +
--       team.member_invited audit. Does NOT create the auth user (admin API is app-side);
--       RAISEs a distinguishable error if the email is already an active member (D-09).
--   list_company_members()                   — this company's active members + derived
--       role; Superadmin-gated. Pending invitees are merged app-side via the admin client.
--
-- Patterns mirrored from 20260617094200_verif_admin_rpcs.sql (the gold shape):
--   security definer + set search_path = '' (fully-qualified names, Pitfall 4)
--   + two-door discipline (revoke all from public / grant execute to authenticated)
--   + body guard + state guard (IF NOT FOUND THEN RAISE) + in-RPC audit_log insert.
-- actor_type = 'user' — a company Superadmin is an end user (NOT 'hs_team'). The
-- BEFORE INSERT trigger fills sequence_number + the hash chain (insert business cols only).
--
-- These RPCs are SECURITY DEFINER (bypass RLS) on purpose: §9 (plan 02) locked
-- person_group / permission_matrix_entry to SELECT-only for authenticated, so every
-- membership write MUST flow through a definer RPC that re-asserts role + tenant + the
-- D-15 lockout internally. This is the privilege-escalation defence, not a convenience.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Internal helper: the caller's company Superadmin group id (active).
--   Resolves once per RPC so the membership writes target the right group.
--   Returns NULL if the caller's company has no active Superadmin group (a
--   half-seeded state) — callers RAISE on NULL rather than writing blind.
-- ----------------------------------------------------------------------------
create or replace function public.current_superadmin_group_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id
    from public."group" g
   where g.company_id = public.current_company_id()
     and g.name = 'Superadmin'
     and g.deleted_at is null
   limit 1;
$$;

revoke all on function public.current_superadmin_group_id() from public;
grant execute on function public.current_superadmin_group_id() to authenticated;

-- ----------------------------------------------------------------------------
-- 1. change_member_role(p_person_id uuid, p_role text)
--    'superadmin' → insert (or un-soft-delete) the target's row in the company's
--    Superadmin group; 'member' → soft-delete it. D-15: RAISE before a demote that
--    would leave the company with zero active Superadmins. Tenant-scoped: the target
--    must belong to current_company_id(). Audit team.role_changed.
-- ----------------------------------------------------------------------------
create or replace function public.change_member_role(
  p_person_id uuid,
  p_role      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_company_id   uuid := public.current_company_id();
  v_group_id     uuid := public.current_superadmin_group_id();
  v_is_super     boolean;
  v_super_count  integer;
  v_from         text;
begin
  -- Belt: Superadmin-only (the GRANT is the primary door; this is the body guard).
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  -- Domain validate the role (only two roles exist, D-01).
  if p_role not in ('member', 'superadmin') then
    raise exception 'invalid role: %', p_role;
  end if;

  if v_group_id is null then
    raise exception 'no Superadmin group for this company';
  end if;

  -- Tenant + existence guard: target must be an active person in THIS company.
  perform 1
    from public.person p
   where p.id = p_person_id
     and p.company_id = v_company_id;
  if not found then
    raise exception 'member not found in your company';
  end if;

  -- Current role (derived): is the target in the active Superadmin group?
  select exists (
    select 1 from public.person_group pg
     where pg.person_id = p_person_id
       and pg.group_id = v_group_id
       and pg.deleted_at is null
  ) into v_is_super;
  v_from := case when v_is_super then 'superadmin' else 'member' end;

  -- No-op if already in the requested role (idempotent, no audit noise).
  if v_from = p_role then
    return;
  end if;

  if p_role = 'superadmin' then
    -- Promote: un-soft-delete an existing row, else insert a fresh membership.
    update public.person_group
       set deleted_at = null
     where person_id = p_person_id
       and group_id = v_group_id
       and deleted_at is not null;
    if not found then
      insert into public.person_group (person_id, group_id)
      values (p_person_id, v_group_id)
      on conflict do nothing;
    end if;
  else
    -- Demote: D-15 lockout — never drop the company's last active Superadmin.
    select count(*) into v_super_count
      from public.person_group pg
     where pg.group_id = v_group_id
       and pg.deleted_at is null;
    if v_super_count <= 1 then
      raise exception 'cannot demote the last Superadmin — promote a replacement first';
    end if;

    update public.person_group
       set deleted_at = now()
     where person_id = p_person_id
       and group_id = v_group_id
       and deleted_at is null;
  end if;

  -- Audit (in-RPC, same-tenant: company_id = current_company_id()).
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'team.role_changed', 'person_group', p_person_id,
     jsonb_build_object('from', v_from, 'to', p_role));
end;
$$;

revoke all on function public.change_member_role(uuid, text) from public;
grant execute on function public.change_member_role(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. remove_member(p_person_id uuid)
--    Soft-detach (D-10): null company_id (instant cross-company RLS deny via the
--    live current_company_id()) + soft-delete the target's Superadmin membership.
--    D-15: RAISE if removing the company's last active Superadmin. Audit
--    team.member_removed. Refresh-token revoke is app-side (resolved D-11) — the
--    data window is already closed by company_id=null before signOut runs.
-- ----------------------------------------------------------------------------
create or replace function public.remove_member(p_person_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_company_id   uuid := public.current_company_id();
  v_group_id     uuid := public.current_superadmin_group_id();
  v_is_super     boolean := false;
  v_super_count  integer;
begin
  -- Belt: Superadmin-only.
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  -- Tenant + existence guard: target must be an active person in THIS company.
  perform 1
    from public.person p
   where p.id = p_person_id
     and p.company_id = v_company_id;
  if not found then
    raise exception 'member not found in your company';
  end if;

  -- D-15 lockout: if the target is the last active Superadmin, refuse removal.
  if v_group_id is not null then
    select exists (
      select 1 from public.person_group pg
       where pg.person_id = p_person_id
         and pg.group_id = v_group_id
         and pg.deleted_at is null
    ) into v_is_super;

    if v_is_super then
      select count(*) into v_super_count
        from public.person_group pg
       where pg.group_id = v_group_id
         and pg.deleted_at is null;
      if v_super_count <= 1 then
        raise exception 'cannot remove the last Superadmin — promote a replacement first';
      end if;
    end if;
  end if;

  -- Close the cross-company data window FIRST (D-11): null company_id → the live
  -- current_company_id() returns NULL on the target's next request → every
  -- company_id = current_company_id() RLS policy denies (fail-safe). Scoped to this
  -- company so a stale id can't detach someone who already moved on.
  update public.person
     set company_id = null
   where id = p_person_id
     and company_id = v_company_id;
  if not found then
    raise exception 'member not found in your company';
  end if;

  -- Soft-delete the target's group memberships for this company (Superadmin row
  -- included) so the role is dropped alongside the detach.
  update public.person_group pg
     set deleted_at = now()
    from public."group" g
   where pg.group_id = g.id
     and g.company_id = v_company_id
     and pg.person_id = p_person_id
     and pg.deleted_at is null;

  -- Audit (in-RPC, same-tenant).
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'team.member_removed', 'person', p_person_id, '{}'::jsonb);
end;
$$;

revoke all on function public.remove_member(uuid) from public;
grant execute on function public.remove_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. invite_member(p_email text, p_role text)
--    Pre-check + audit only — the auth-user creation (inviteUserByEmail) is the
--    app-side admin call (RESEARCH Open-Q #2 option a). Validates the role, blocks
--    inviting someone who is already an ACTIVE member of this company, and writes
--    team.member_invited. RAISEs a distinguishable 'already_member' so the action
--    can surface a clean message (D-09 is the separate has-an-account case, handled
--    app-side off the inviteUserByEmail error).
-- ----------------------------------------------------------------------------
create or replace function public.invite_member(
  p_email text,
  p_role  text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  -- Belt: Superadmin-only.
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  -- Domain validate the role (D-08: Member | Superadmin, default chosen app-side).
  if p_role not in ('member', 'superadmin') then
    raise exception 'invalid role: %', p_role;
  end if;

  if v_company_id is null then
    raise exception 'no company for the caller';
  end if;

  -- Precheck: the email is not already an active member of THIS company. A person's
  -- email lives on auth.users; match the active company person by their auth email.
  if exists (
    select 1
      from public.person p
      join auth.users u on u.id = p.id
     where p.company_id = v_company_id
       and lower(u.email) = lower(p_email)
  ) then
    raise exception 'already_member: % is already a member of this company', p_email;
  end if;

  -- Audit the invite intent (the auth-user creation + email send is app-side).
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'team.member_invited', 'person', v_company_id,
     jsonb_build_object('email', lower(p_email), 'role', p_role));
end;
$$;

revoke all on function public.invite_member(text, text) from public;
grant execute on function public.invite_member(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. list_company_members()
--    The team-list read (plan 07 UI renders it). Active members of the caller's
--    company with their display name, email, and derived role (in the Superadmin
--    group ⇒ superadmin, else member). Superadmin-gated: a non-Superadmin gets 0
--    rows (fail-safe, mirrors list_pending_verifications). Pending invitees are
--    merged app-side via the admin client (auth.users invited-not-confirmed).
-- ----------------------------------------------------------------------------
create or replace function public.list_company_members()
returns table (
  person_id    uuid,
  display_name text,
  email        text,
  role         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id                                                  as person_id,
    p.display_name::text                                  as display_name,
    u.email::text                                         as email,
    case when pg.person_id is not null then 'superadmin'
         else 'member' end                                as role
  from public.person p
  join auth.users u
    on u.id = p.id
  -- active Superadmin membership for the caller's company (LEFT → role derivation)
  left join public."group" g
    on g.company_id = public.current_company_id()
   and g.name = 'Superadmin'
   and g.deleted_at is null
  left join public.person_group pg
    on pg.person_id = p.id
   and pg.group_id = g.id
   and pg.deleted_at is null
  where p.company_id = public.current_company_id()
    and public.has_permission('team.manage')   -- non-Superadmin ⇒ 0 rows (fail-safe)
  order by p.display_name asc;
$$;

revoke all on function public.list_company_members() from public;
grant execute on function public.list_company_members() to authenticated;
