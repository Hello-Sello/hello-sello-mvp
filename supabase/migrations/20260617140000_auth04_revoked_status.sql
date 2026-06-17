-- =============================================================================
-- Phase 4 Wave-0: AUTH-03 prerequisite — add `revoked` lookup value
-- =============================================================================
-- (1) INSERT the `revoked` row into company_verification_status so a company
--     can be moved to 'revoked' without an FK violation. Idempotent: uses
--     ON CONFLICT (code) DO NOTHING so a re-reset is safe.
-- (2) CREATE OR REPLACE list_decided_verifications() widening the WHERE filter
--     to include 'revoked' so revoked companies surface in the admin Decided tab
--     (RESEARCH caveat A3; CONTEXT D-10).
-- No revoke_company RPC, no HS-admin revocation trigger — both are out of Phase
-- 4 scope (CONTEXT Deferred Ideas). A test fixture sets state by direct UPDATE.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. Add 'revoked' to the company_verification_status lookup
-- ----------------------------------------------------------------------------
insert into public.company_verification_status (code, description, sort_order, is_terminal)
values ('revoked', 'Access revoked by Hello Sello', 4, true)
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- 2. Widen list_decided_verifications to surface revoked companies in Decided
--    tab. Body copied verbatim from 20260617094300_verif_reject_and_licence.sql
--    (lines 79-136); only the WHERE filter changes:
--      'in (''verified'', ''rejected'')' → 'in (''verified'', ''rejected'', ''revoked'')'
-- ----------------------------------------------------------------------------
create or replace function public.list_decided_verifications()
returns table (
  id                  uuid,
  name                text,
  country             text,
  submitted_at        timestamptz,
  type_codes          text[],
  verification_status text,
  decision_action     text,
  decision_reason     text,
  decision_preset     text,
  decision_actor_id   uuid,
  decision_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    c.name::text,
    c.country::text,
    c.created_at                                          as submitted_at,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    )                                                     as type_codes,
    c.verification_status::text,
    al.action::text                                       as decision_action,
    al.reason                                             as decision_reason,
    al.metadata->>'preset'                                as decision_preset,
    al.actor_person_id                                    as decision_actor_id,
    al.created_at                                         as decision_at
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  -- Latest decision audit row for this company (one per company)
  left join lateral (
    select a.action, a.reason, a.metadata, a.actor_person_id, a.created_at
      from public.audit_log a
     where a.content_type = 'company'
       and a.content_id   = c.id
       and a.action in ('company.verify_approved', 'company.verify_rejected')
     order by a.created_at desc
     limit 1
  ) al on true
  where c.deleted_at is null
    and c.verification_status in ('verified', 'rejected', 'revoked')
    and public.is_hs_team()                               -- false ⇒ 0 rows (fail-safe)
  group by c.id, c.name, c.country, c.created_at, c.verification_status,
           al.action, al.reason, al.metadata, al.actor_person_id
  order by al.created_at desc nulls last;                 -- most recently decided first
$$;

revoke all on function public.list_decided_verifications() from public;
grant execute on function public.list_decided_verifications() to authenticated;
