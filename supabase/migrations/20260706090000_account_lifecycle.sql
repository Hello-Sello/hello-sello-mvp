-- ============================================================================
-- Phase 13 — SET-02: Account & company lifecycle (columns + RPCs + audit codes)
-- ----------------------------------------------------------------------------
-- The synchronous half of the lifecycle: a nullable-timestamp state model on
-- person/company plus the SECURITY DEFINER RPCs that drive it. The daily erasure
-- sweep (13-03) is a trivial `where deletion_scheduled_for <= now() and
-- anonymized_at is null` over these columns — orthogonal timestamps DEFINE AWAY
-- invalid states (no status enum to keep consistent).
--
-- ADDITIVE ONLY. Reuses Phase-1/11/12 infrastructure — DO NOT recreate:
--   • helpers current_company_id() (20260607170000:58),
--     current_superadmin_group_id() + the sole-Superadmin count guard
--     (20260621130000:42 / remove_member:197-215), has_permission('team.manage')
--   • audit_log(company_id NOT NULL, actor_type FK 'user', content_type FK
--     'person'/'company') — entry_hash is trigger-computed (migration 5)
--   • existing audit codes person.soft_deleted / person.gdpr_scrubbed
--     (20260607090001:486-487) — used by the 13-03 erase sweep, NOT re-seeded here
--
-- SECURITY INVARIANTS (honor exactly):
--   • Every write is a definer RPC scoped to the caller's OWN row (id = auth.uid())
--     or their OWN company (id = current_company_id()). No client-passed target id.
--   • NEVER widen a base person/company UPDATE grant or RLS policy — the open
--     DEV-88 self-link hole is adjacent; these RPCs are the only new write path.
--   • NEVER hard-remove a person or auth.users row (cascade corrupts the
--     append-only audit chain) — lifecycle is soft state + a scheduled 13-03 scrub.
--
-- COMPANY-LESS AUDIT (RESEARCH Open-Q #2): audit_log.company_id is NOT NULL
-- (20260607090002:261). A half-onboarded caller's current_company_id() is NULL,
-- so each account RPC guards its audit insert on `if v_company_id is not null` —
-- a genuinely company-less self-deletion SKIPS the company-scoped audit rather
-- than tripping the NOT NULL constraint (mirrors the Path-B ordering discipline,
-- 20260622091500:22-25).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) Nullable lifecycle timestamp columns (orthogonal state — NOT an enum).
--     person.deactivated_at        — user paused their own account
--     person.deletion_scheduled_for — end of the 30-day erasure runway (13-03 reads)
--     person.anonymized_at         — set by the 13-03 scrub once PII is erased
--     company.deactivated_at       — a Superadmin paused the whole company
-- ----------------------------------------------------------------------------
alter table public.person
  add column deactivated_at         timestamptz null,
  add column deletion_scheduled_for timestamptz null,
  add column anonymized_at          timestamptz null;

alter table public.company
  add column deactivated_at timestamptz null;

-- ----------------------------------------------------------------------------
-- (2) New lifecycle audit action codes. Incremental insert with
--     `on conflict (code) do nothing` (mirror 20260622091500:47-52) — re-seeding
--     an existing code turns `db reset` RED. person.soft_deleted /
--     person.gdpr_scrubbed already ship (20260607090001:486-487) — NOT re-seeded.
-- ----------------------------------------------------------------------------
insert into public.audit_action_type (code, description, category) values
  ('account.deactivated',        'A user deactivated their own account',        'lifecycle'),
  ('account.reactivated',        'A user reactivated their own account',        'lifecycle'),
  ('account.deletion_requested', 'A user requested erasure of their account',   'lifecycle'),
  ('account.deletion_cancelled', 'A user cancelled a pending account erasure',  'lifecycle'),
  ('company.deactivated',        'A Superadmin deactivated the company',        'lifecycle'),
  ('company.reactivated',        'A Superadmin reactivated the company',        'lifecycle')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- (3a) deactivate_account() — pause the caller's OWN account.
--      Own row only (id = auth.uid()); audit guarded on non-null company_id.
-- ----------------------------------------------------------------------------
create or replace function public.deactivate_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  update public.person
     set deactivated_at = now()
   where id = v_uid;
  if not found then
    raise exception 'account not found';
  end if;

  -- Company-less caller (half-onboarded): current_company_id() is NULL and
  -- audit_log.company_id is NOT NULL — skip rather than violate the constraint.
  if v_company_id is not null then
    insert into public.audit_log
      (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
    values
      (v_company_id, v_uid, 'user', 'account.deactivated', 'person', v_uid, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.deactivate_account() from public;
grant execute on function public.deactivate_account() to authenticated;

-- ----------------------------------------------------------------------------
-- (3b) reactivate_account() — un-pause: clear deactivated_at AND any pending
--      deletion runway (undo a mistaken deactivation). Own row only.
-- ----------------------------------------------------------------------------
create or replace function public.reactivate_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  update public.person
     set deactivated_at         = null,
         deletion_scheduled_for = null
   where id = v_uid;
  if not found then
    raise exception 'account not found';
  end if;

  if v_company_id is not null then
    insert into public.audit_log
      (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
    values
      (v_company_id, v_uid, 'user', 'account.reactivated', 'person', v_uid, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.reactivate_account() from public;
grant execute on function public.reactivate_account() to authenticated;

-- ----------------------------------------------------------------------------
-- (3c) request_account_deletion() — schedule the caller's OWN account for erasure.
--      Sole-Superadmin lockout (D-11): a Superadmin cannot schedule their own
--      erasure while they are the company's LAST active Superadmin (would leave
--      it headless). Copies the remove_member count guard (20260621130000:197-215)
--      but scoped to the CALLER (auth.uid()) deleting THEMSELVES — never a passed
--      id. Then deactivate now + open a 30-day runway; the 13-03 sweep scrubs it.
-- ----------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_company_id  uuid := public.current_company_id();
  v_group_id    uuid := public.current_superadmin_group_id();
  v_is_super    boolean := false;
  v_super_count integer;
begin
  -- Sole-Superadmin guard, scoped to the self-deleting caller (v_uid). A
  -- company-less caller has v_group_id NULL → guard skipped (nothing to protect).
  if v_group_id is not null then
    select exists (
      select 1 from public.person_group pg
       where pg.person_id = v_uid
         and pg.group_id = v_group_id
         and pg.deleted_at is null
    ) into v_is_super;

    if v_is_super then
      select count(*) into v_super_count
        from public.person_group pg
       where pg.group_id = v_group_id
         and pg.deleted_at is null;
      if v_super_count <= 1 then
        raise exception 'promote another Superadmin before deleting your account';
      end if;
    end if;
  end if;

  -- Own row only (id = auth.uid()); never a client-passed id (DEV-88).
  update public.person
     set deactivated_at         = now(),
         deletion_scheduled_for = now() + interval '30 days'
   where id = v_uid;
  if not found then
    raise exception 'account not found';
  end if;

  if v_company_id is not null then
    insert into public.audit_log
      (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
    values
      (v_company_id, v_uid, 'user', 'account.deletion_requested', 'person', v_uid, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;

-- ----------------------------------------------------------------------------
-- (3d) cancel_account_deletion() — abort a pending erasure: clear the runway AND
--      the deactivation (the account comes fully back). Own row only.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  update public.person
     set deletion_scheduled_for = null,
         deactivated_at         = null
   where id = v_uid;
  if not found then
    raise exception 'account not found';
  end if;

  if v_company_id is not null then
    insert into public.audit_log
      (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
    values
      (v_company_id, v_uid, 'user', 'account.deletion_cancelled', 'person', v_uid, '{}'::jsonb);
  end if;
end;
$$;
revoke all on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- ----------------------------------------------------------------------------
-- (3e) deactivate_company() — a Superadmin pauses the whole company.
--      Belt gate has_permission('team.manage') (the two-door GRANT is the primary
--      door); scope to the caller's OWN company (id = current_company_id()).
-- ----------------------------------------------------------------------------
create or replace function public.deactivate_company()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  update public.company
     set deactivated_at = now()
   where id = v_company_id;
  if not found then
    raise exception 'company not found';
  end if;

  -- has_permission('team.manage') guarantees a company → v_company_id is non-null.
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'company.deactivated', 'company', v_company_id, '{}'::jsonb);
end;
$$;
revoke all on function public.deactivate_company() from public;
grant execute on function public.deactivate_company() to authenticated;

-- ----------------------------------------------------------------------------
-- (3f) reactivate_company() — same gate; clear company.deactivated_at.
-- ----------------------------------------------------------------------------
create or replace function public.reactivate_company()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_company_id uuid := public.current_company_id();
begin
  if not public.has_permission('team.manage') then
    raise exception 'forbidden: not a company Superadmin';
  end if;

  update public.company
     set deactivated_at = null
   where id = v_company_id;
  if not found then
    raise exception 'company not found';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (v_company_id, v_uid, 'user', 'company.reactivated', 'company', v_company_id, '{}'::jsonb);
end;
$$;
revoke all on function public.reactivate_company() from public;
grant execute on function public.reactivate_company() to authenticated;
