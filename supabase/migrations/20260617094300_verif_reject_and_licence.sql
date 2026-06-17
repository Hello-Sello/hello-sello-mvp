-- VERIF-03 / VERIF-04 (03-03)
-- Reject-with-reason + decided-list + licence-read + fail-soft license_viewed.
--
-- Two-door discipline (D-13 / VERIF-05):
--   BODY gate  — is_hs_team() predicate inside every function.
--   GRANT gate — revoke all on function … from public + grant execute to authenticated.
--
-- search_path = '' so every identifier is fully-qualified (Pitfall 4).
-- Threat mitigations: T-03-08 (no license_downloaded), T-03-09 (anon revoked),
--   T-03-10 (actor=auth.uid() inside definer), T-03-11 (pending guard + NOT FOUND raise),
--   T-03-13 (preset domain validated at form layer; audit column records what came in).
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. reject_company(p_company_id, p_reason, p_preset_code)
--    Flips verification_status to 'rejected' + writes a tamper-evident audit row
--    with reason and preset, both in one transaction (VERIF-03 / VERIF-04 / D-06).
--
--    Guards:
--      - is_hs_team() RAISE (belt; the grant is the braces)
--      - WHERE verification_status = 'pending' + IF NOT FOUND THEN RAISE
--        (double-decision guard, Pitfall 5 / D-12 / T-03-11)
--
--    Audit write is here (not app-side) because the reviewer is cross-tenant —
--    audit_insert WITH CHECK (company_id = current_company_id()) would reject an
--    app-side write scoped to the reviewed company (Pitfall 1 / T-03-10).
-- ----------------------------------------------------------------------------
create or replace function public.reject_company(
  p_company_id  uuid,
  p_reason      text,
  p_preset_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  -- Belt: explicit role check (the GRANT is the primary door).
  if not public.is_hs_team() then
    raise exception 'forbidden: not an HS team member';
  end if;

  -- Status flip — only on pending companies (D-12: one-time at MVP).
  update public.company
     set verification_status = 'rejected',
         updated_by           = v_uid
   where id = p_company_id
     and verification_status = 'pending';

  -- Double-decision guard: second concurrent reject (or reject-after-approve) gets
  -- a clean retryable error (T-03-11 / D-11).
  if not found then
    raise exception 'company not pending or not found';
  end if;

  -- Audit row (D-06): reason in reason column, preset code in metadata.preset.
  -- actor_type must be the seeded 'hs_team' FK code (Pitfall 3 / T-03-10).
  -- The BEFORE INSERT trigger fills prev_entry_hash + entry_hash + sequence_number.
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (p_company_id, v_uid, 'hs_team', 'company.verify_rejected', 'company', p_company_id,
     p_reason, jsonb_build_object('preset', p_preset_code));
end;
$$;

revoke all on function public.reject_company(uuid, text, text) from public;
grant execute on function public.reject_company(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. list_decided_verifications()
--    Returns verified/rejected companies with the latest decision echo (actor,
--    when, outcome, reason, preset) for the read-only Decided tab (D-07 / VERIF-04).
--    Non-HS caller: is_hs_team() returns false → 0 rows (fail-safe).
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
    and c.verification_status in ('verified', 'rejected')
    and public.is_hs_team()                               -- false ⇒ 0 rows (fail-safe)
  group by c.id, c.name, c.country, c.created_at, c.verification_status,
           al.action, al.reason, al.metadata, al.actor_person_id, al.created_at
  order by al.created_at desc nulls last;                 -- most recently decided first
$$;

revoke all on function public.list_decided_verifications() from public;
grant execute on function public.list_decided_verifications() to authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_company_licences(p_company_id uuid)
--    Returns the non-deleted licence file metadata rows for the viewer.
--    Feeds LicenceViewer to build signed URLs client-side.
--    Non-HS caller: is_hs_team() returns false → 0 rows (fail-safe, T-03-09).
-- ----------------------------------------------------------------------------
create or replace function public.get_company_licences(p_company_id uuid)
returns table (
  id                uuid,
  storage_path      text,
  original_filename text,
  mime_type         text,
  description       text,
  scan_status       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lf.id,
    lf.storage_path,
    lf.original_filename::text,
    lf.mime_type::text,
    lf.description,
    lf.scan_status::text
  from public.company_license_file lf
  where lf.company_id = p_company_id
    and lf.deleted_at is null
    and public.is_hs_team()           -- false ⇒ 0 rows (fail-safe, T-03-09)
  order by lf.created_at asc;
$$;

revoke all on function public.get_company_licences(uuid) from public;
grant execute on function public.get_company_licences(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. log_license_viewed(p_company_id uuid)
--    Fail-soft: INSERTs a company.license_viewed audit row; errors are swallowed
--    by the caller so a logging hiccup never blocks the review (Pitfall 6 / T-03-12).
--    No status change — audit-only (D-02).
--    NOTE: company.license_downloaded is NOT implemented here (D-02 / T-03-08).
-- ----------------------------------------------------------------------------
create or replace function public.log_license_viewed(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Belt: explicit role check.
  if not public.is_hs_team() then
    raise exception 'forbidden: not an HS team member';
  end if;

  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, metadata)
  values
    (p_company_id, auth.uid(), 'hs_team', 'company.license_viewed', 'company', p_company_id,
     '{}'::jsonb);
end;
$$;

revoke all on function public.log_license_viewed(uuid) from public;
grant execute on function public.log_license_viewed(uuid) to authenticated;
