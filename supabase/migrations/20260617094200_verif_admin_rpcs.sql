-- VERIF-01 / VERIF-02 / VERIF-04 / VERIF-05 (03-02)
-- Admin verification RPCs: list pending queue, get company detail, approve a company.
-- Reject (VERIF-03) lands in 03-03.
--
-- Two-door discipline (D-13 / VERIF-05):
--   BODY gate  — is_hs_team() predicate inside every function.
--   GRANT gate — revoke all on function … from public + grant execute to authenticated.
--
-- search_path = '' so every identifier is fully-qualified (Pitfall 4).
-- The BEFORE INSERT trigger on audit_log fills sequence_number + hash chain
-- automatically — this file just INSERT's the business columns.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. list_pending_verifications()
--    Returns the pending queue, oldest-first (D-08).
--    Non-HS caller: is_hs_team() returns false → 0 rows (fail-safe, VERIF-05).
-- ----------------------------------------------------------------------------
create or replace function public.list_pending_verifications()
returns table (
  id           uuid,
  name         text,
  country      text,
  submitted_at timestamptz,
  type_codes   text[],
  has_licence  boolean
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
    c.created_at                                  as submitted_at,
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    )                                             as type_codes,
    exists (
      select 1
        from public.company_license_file lf
       where lf.company_id = c.id
         and lf.deleted_at is null
    )                                             as has_licence
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.deleted_at is null
    and c.verification_status = 'pending'
    and public.is_hs_team()                       -- false ⇒ 0 rows (fail-safe)
  group by c.id, c.name, c.country, c.created_at
  order by c.created_at asc;                      -- oldest-first (D-08)
$$;

revoke all on function public.list_pending_verifications() from public;
grant execute on function public.list_pending_verifications() to authenticated;

-- ----------------------------------------------------------------------------
-- 2. get_verification_detail(p_company_id uuid)
--    Returns the single company's review-screen header info (03-03 adds the
--    licence-file rows + signed URLs).
--    Non-HS caller: is_hs_team() returns false → 0 rows (fail-safe).
-- ----------------------------------------------------------------------------
create or replace function public.get_verification_detail(p_company_id uuid)
returns table (
  id                  uuid,
  name                text,
  country             text,
  type_codes          text[],
  verification_status text,
  created_at          timestamptz
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
    coalesce(
      array_agg(distinct cta.company_type_code::text)
        filter (where cta.company_type_code is not null),
      '{}'
    )                       as type_codes,
    c.verification_status::text,
    c.created_at
  from public.company c
  left join public.company_type_assignment cta
    on cta.company_id = c.id and cta.deleted_at is null
  where c.id = p_company_id
    and c.deleted_at is null
    and public.is_hs_team()     -- false ⇒ 0 rows (fail-safe)
  group by c.id, c.name, c.country, c.verification_status, c.created_at;
$$;

revoke all on function public.get_verification_detail(uuid) from public;
grant execute on function public.get_verification_detail(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. approve_company(p_company_id uuid)
--    Flips verification_status to 'verified' + writes the hs_team audit row,
--    both in one transaction (VERIF-02 / VERIF-04).
--
--    Guards:
--      - is_hs_team() RAISE (belt; the grant is the braces)
--      - WHERE verification_status = 'pending' + IF NOT FOUND THEN RAISE
--        (double-decision guard, Pitfall 5 / D-12)
--
--    Audit write is here (not app-side writeAudit) because the reviewer is
--    cross-tenant: audit_insert WITH CHECK (company_id = current_company_id())
--    physically rejects an app-side write scoped to the reviewed company.
--    The BEFORE INSERT trigger fills sequence_number + the hash chain. (Pitfall 1.)
-- ----------------------------------------------------------------------------
create or replace function public.approve_company(p_company_id uuid)
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
     set verification_status = 'verified',
         verified_at          = now(),
         verified_by          = v_uid,
         updated_by           = v_uid
   where id = p_company_id
     and verification_status = 'pending';

  -- Double-decision guard: second concurrent approve gets a clean retryable error.
  if not found then
    raise exception 'company not pending or not found';
  end if;

  -- Audit row (inside this definer RPC so it can set company_id = reviewed company).
  -- actor_type must be the seeded 'hs_team' FK code (Pitfall 3).
  -- The BEFORE INSERT trigger fills prev_entry_hash + entry_hash + sequence_number.
  insert into public.audit_log
    (company_id, actor_person_id, actor_type, action, content_type, content_id, reason, metadata)
  values
    (p_company_id, v_uid, 'hs_team', 'company.verify_approved', 'company', p_company_id, null, '{}'::jsonb);
end;
$$;

revoke all on function public.approve_company(uuid) from public;
grant execute on function public.approve_company(uuid) to authenticated;
