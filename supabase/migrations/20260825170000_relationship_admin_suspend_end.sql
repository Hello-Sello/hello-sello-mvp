-- ============================================================================
-- HEL-82 · a relationship can now be suspended, reactivated, or ended
-- ----------------------------------------------------------------------------
-- Today `relationship.status` is seeded active/suspended/ended, referenced by
-- FK, asserted in a test — and unreachable. `authenticated` holds SELECT +
-- REFERENCES only; the one function that writes the table (`accept_connection_
-- request`) only INSERTs. Once connected, a pair is permanent, which is wrong
-- for the actual trigger: EU GDP (2013/C 343/01) requires a wholesale
-- distributor to keep qualifying its counterparties, and to stop new trade the
-- moment a licence lapses while retaining every past transaction (>=5 years).
--
-- This is an operator/compliance transition, not a user-facing "disconnect" —
-- Muskan's ruling: reuse the existing `/admin` surface (is_hs_team()-gated,
-- same shape as company verification), not `/connect/relationship`.
--
-- ⚠️ REVISION (same session, before ship): the first draft of this migration
-- also broadened `rel_all`'s USING with `OR is_hs_team()`, meant to let an
-- HS-team viewer load the ordinary `/connect/relationship/[id]` page. Review
-- (critic + security) found that page is unreachable anyway — the whole
-- `/connect` tree sits behind `requireVerified()`, which redirects a
-- companyless account (the seeded HS reviewer) to `/onboarding` before the
-- page ever runs — AND that the "obvious" fix (give the HS operator a real
-- company) would turn three other relationship readers
-- (`messaging/supabase/store.ts`, `messaging/supabase/connections.ts`,
-- `basket/supabase/reads.ts`) into cross-tenant leaks, because none of them
-- has an explicit membership check — they lean on RLS alone. So the read
-- broadening bought nothing reachable and carried a real risk. Dropped;
-- `list_relationships_admin()` below (a SECURITY DEFINER RPC, the same
-- shape as `list_pending_verifications()`) is the real fix — `relationship`
-- stays exactly as narrow as it was before this ticket.
--
-- Three RPCs, one guarded transition each (relationship_status.is_terminal
-- already marks 'ended' terminal, 20260607090001:326-328):
--   suspend_relationship    active            -> suspended  (reversible)
--   reactivate_relationship suspended         -> active     (NOT from ended)
--   end_relationship        active|suspended  -> ended       (terminal)
-- Plus one read RPC, `list_relationships_admin()`, so the admin page has
-- something to render — HS staff have no other way to discover a
-- relationship id, and `relationship` itself is not otherwise readable to
-- a non-member, non-service caller.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New audit vocabulary (relationship_term.* is the naming precedent).
-- ON CONFLICT DO NOTHING per the repo's own stated rule (20260706090000:52-53):
-- a plain INSERT into a seeded lookup turns `db reset` red the moment this
-- migration is ever replayed after the codes already exist.
-- ----------------------------------------------------------------------------
insert into public.audit_action_type (code, description, category) values
  ('relationship.suspended',   'HS team suspended a relationship (new trade blocked)', 'lifecycle'),
  ('relationship.reactivated', 'HS team reactivated a suspended relationship',         'lifecycle'),
  ('relationship.ended',       'HS team ended a relationship (terminal)',              'lifecycle')
on conflict (code) do nothing;

insert into public.auditable_content_type (code, description, target_table) values
  ('relationship', 'A company-to-company relationship', 'relationship')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- list_relationships_admin() — HS-team-only. Non-HS caller: is_hs_team()
-- returns false -> 0 rows (fail-safe, same shape as list_pending_verifications,
-- 20260617094200:14-17).
-- ----------------------------------------------------------------------------
create or replace function public.list_relationships_admin()
returns table (
  id            uuid,
  company_a_id  uuid,
  company_a_name text,
  company_b_id  uuid,
  company_b_name text,
  status        text,
  connected_at  timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.company_a_id,
    ca.name::text,
    r.company_b_id,
    cb.name::text,
    r.status::text,
    r.created_at
  from public.relationship r
  join public.company ca on ca.id = r.company_a_id
  join public.company cb on cb.id = r.company_b_id
  where r.deleted_at is null
    and public.is_hs_team()                       -- false ⇒ 0 rows (fail-safe)
  order by r.status, r.created_at desc;
$$;

revoke all on function public.list_relationships_admin() from public;
grant execute on function public.list_relationships_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- suspend_relationship(p_relationship_id, p_reason)
-- ----------------------------------------------------------------------------
create or replace function public.suspend_relationship(p_relationship_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ca  uuid;
  v_cb  uuid;
begin
  if not public.is_hs_team() then
    raise exception 'forbidden: not an HS team member';
  end if;

  update public.relationship
     set status = 'suspended', updated_by = v_uid, updated_at = now()
   where id = p_relationship_id
     and deleted_at is null
     and status = 'active'
  returning company_a_id, company_b_id into v_ca, v_cb;

  if not found then
    raise exception 'relationship not active or not found';
  end if;

  -- One row per side, as two separate INSERT statements — not the
  -- one-statement, two-VALUES-tuple form the first draft used. The hash-chain
  -- trigger (20260607090005:110-113) reads the latest `sequence_number` per
  -- row; two statements make each row's chain link unambiguous rather than
  -- resting on same-statement visibility inside one multi-row INSERT.
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_ca, v_uid, 'hs_team', 'relationship.suspended', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_cb, v_uid, 'hs_team', 'relationship.suspended', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
end;
$$;

revoke all on function public.suspend_relationship(uuid, text) from public;
grant execute on function public.suspend_relationship(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- reactivate_relationship(p_relationship_id, p_reason) — suspended -> active
-- ONLY. Deliberately cannot reactivate from 'ended': relationship_status.
-- is_terminal marks 'ended' as final by design (20260607090001:326-328); this
-- RPC honors that rather than re-deriving it from a second predicate.
-- ----------------------------------------------------------------------------
create or replace function public.reactivate_relationship(p_relationship_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ca  uuid;
  v_cb  uuid;
begin
  if not public.is_hs_team() then
    raise exception 'forbidden: not an HS team member';
  end if;

  update public.relationship
     set status = 'active', updated_by = v_uid, updated_at = now()
   where id = p_relationship_id
     and deleted_at is null
     and status = 'suspended'
  returning company_a_id, company_b_id into v_ca, v_cb;

  if not found then
    raise exception 'relationship not suspended or not found';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_ca, v_uid, 'hs_team', 'relationship.reactivated', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_cb, v_uid, 'hs_team', 'relationship.reactivated', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
end;
$$;

revoke all on function public.reactivate_relationship(uuid, text) from public;
grant execute on function public.reactivate_relationship(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- end_relationship(p_relationship_id, p_reason) — active|suspended -> ended.
-- Terminal: no RPC transitions out of 'ended' (matches is_terminal=true).
-- ----------------------------------------------------------------------------
create or replace function public.end_relationship(p_relationship_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ca  uuid;
  v_cb  uuid;
begin
  if not public.is_hs_team() then
    raise exception 'forbidden: not an HS team member';
  end if;

  update public.relationship
     set status = 'ended', updated_by = v_uid, updated_at = now()
   where id = p_relationship_id
     and deleted_at is null
     and status in ('active', 'suspended')
  returning company_a_id, company_b_id into v_ca, v_cb;

  if not found then
    raise exception 'relationship already ended or not found';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_ca, v_uid, 'hs_team', 'relationship.ended', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (v_cb, v_uid, 'hs_team', 'relationship.ended', 'relationship', p_relationship_id, p_reason, '{}'::jsonb);
end;
$$;

revoke all on function public.end_relationship(uuid, text) from public;
grant execute on function public.end_relationship(uuid, text) to authenticated;
