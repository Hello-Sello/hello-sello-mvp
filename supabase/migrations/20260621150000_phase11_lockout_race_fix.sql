-- ============================================================================
-- Phase 11 (corrective) — D-15 lockout race fix + phantom-invite-audit fix
-- ----------------------------------------------------------------------------
-- Corrective migration over 20260621130000_phase11_team_rpcs.sql. That file is
-- already committed + pushed (local-only) — per migration hygiene we do NOT edit
-- it; we CREATE OR REPLACE the affected functions here. Same gold shape:
--   security definer + set search_path = '' (fully-qualified names) + two-door
--   discipline (revoke all from public / grant execute to authenticated).
--
-- Fixes:
--   CR-01 (BLOCKER, D-15 TOCTOU) — change_member_role demote branch + remove_member
--     lockout branch implemented the last-Superadmin guard as count-then-act with no
--     lock. Under READ COMMITTED two concurrent demote/remove calls in a 2-Superadmin
--     company both read count=2, both pass the <=1 check, both write → 0 Superadmins
--     (unrecoverable headless company). Fix: take a per-Superadmin-group transaction
--     advisory lock (pg_advisory_xact_lock) BEFORE the count read in both functions.
--     The second concurrent txn blocks on the same lock key, and only proceeds after
--     the first COMMITs — so it re-reads the true post-commit count (1) and RAISEs.
--     The lock key is hashtext(v_group_id::text): per company Superadmin group, so
--     unrelated companies never contend. xact-scoped → auto-released at COMMIT/ROLLBACK.
--     INVARIANT: concurrent removal/demotion of the last two Superadmins of a company
--     cannot both succeed.
--
--   WR-01 (phantom invite audit) — invite_member wrote the team.member_invited audit
--     row in the SAME RPC as the precheck, BEFORE the app-side inviteUserByEmail send.
--     An expected D-09 "already has an account" / bad-email failure then left an
--     un-deletable audit row for an invite that never sent. Fix: invite_member is now
--     PRECHECK-ONLY (role + not-already-member, NO audit write). A new definer RPC
--     record_invite_sent(p_email, p_role) writes the audit row, and the action calls
--     it ONLY after inviteUserByEmail succeeds.
--
--   WR-02 (polymorphic audit key mismatch) — the invite audit stamped a company id
--     under content_type='person'. There is no person row at invite time (D-07), so
--     the correct internally-consistent pairing is content_type='company',
--     content_id=v_company_id (the invite acts on the company's membership). The
--     invited email + role already travel in metadata.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- change_member_role — CR-01: serialize the demote lockout under an advisory lock.
-- (Body unchanged except the pg_advisory_xact_lock taken in the demote branch
--  immediately before the last-Superadmin count read.)
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
    -- CR-01: serialize concurrent demote/remove of THIS company's Superadmin group
    -- before the count read. A second concurrent txn blocks on the same key until
    -- the first COMMITs, then re-reads the true post-commit count and RAISEs. Keyed
    -- per Superadmin group so unrelated companies never contend; xact-scoped lock
    -- auto-releases at COMMIT/ROLLBACK.
    perform pg_advisory_xact_lock(hashtext(v_group_id::text));

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
-- remove_member — CR-01: serialize the lockout under the same advisory lock key.
-- (Body unchanged except the pg_advisory_xact_lock taken before the last-Superadmin
--  count read in the lockout branch.)
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
    -- CR-01: serialize against concurrent demote/remove of THIS company's Superadmin
    -- group BEFORE deciding super-status + count. The same advisory key as
    -- change_member_role, so a concurrent demote and a concurrent remove also
    -- mutually serialize. xact-scoped → released at COMMIT/ROLLBACK.
    perform pg_advisory_xact_lock(hashtext(v_group_id::text));

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
-- invite_member — WR-01: PRECHECK-ONLY now. Validates the role + blocks inviting an
-- existing active member. NO audit write here anymore — the audit row is written by
-- record_invite_sent() AFTER the app-side inviteUserByEmail succeeds, so a failed /
-- D-09-rejected invite never leaves a phantom team.member_invited row.
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

  -- No audit here (WR-01). The team.member_invited row is written by
  -- record_invite_sent() only after the invite email actually sends.
end;
$$;

revoke all on function public.invite_member(text, text) from public;
grant execute on function public.invite_member(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- record_invite_sent(p_email, p_role) — WR-01/WR-02: write the team.member_invited
-- audit row, called by the action ONLY after inviteUserByEmail succeeds. Re-asserts
-- the Superadmin gate + tenant scope (it is itself a security boundary, not a trusted
-- internal-only helper). WR-02: content_type='company', content_id=v_company_id — an
-- internally consistent pair (the invite acts on the company's membership; there is no
-- person row yet, D-07). The invited email + role travel in metadata, as before.
-- ----------------------------------------------------------------------------
create or replace function public.record_invite_sent(
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
  -- Belt: Superadmin-only (this writes the audit chain — gate it like the others).
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  if p_role not in ('member', 'superadmin') then
    raise exception 'invalid role: %', p_role;
  end if;

  if v_company_id is null then
    raise exception 'no company for the caller';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'team.member_invited', 'company', v_company_id,
     jsonb_build_object('email', lower(p_email), 'role', p_role));
end;
$$;

revoke all on function public.record_invite_sent(text, text) from public;
grant execute on function public.record_invite_sent(text, text) to authenticated;
