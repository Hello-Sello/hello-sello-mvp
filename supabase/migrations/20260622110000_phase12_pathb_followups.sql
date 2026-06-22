-- ============================================================================
-- Phase 12 — Path B follow-ups (code-review findings #6 + #4)
-- ----------------------------------------------------------------------------
-- Two independent `create or replace`s, additive, no schema change. Sits after
-- 20260622100000 (the Fix A/B migration) so withdraw_join_request already exists.
--
-- FIX #6 (search_joinable_companies): escape LIKE metacharacters. The search term
--   was interpolated straight into an ILIKE pattern, so a literal % matched every
--   company and _ matched any single char. We escape \ % _ (backslash first) so the
--   box matches literally. Verified-only filter + curated projection are unchanged.
--
-- FIX #4 (onboard_company): cancel the caller's pending join_request on Path-A
--   company birth. A requester who hit "create my own company instead" kept a live
--   pending row lingering in the target company's queue (a phantom). We now reconcile
--   it by reusing withdraw_join_request (so the cancel is audited exactly like a
--   manual withdraw: status->'cancelled' + a join.withdrawn audit on the target).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FIX #6 — search_joinable_companies with LIKE-metacharacter escaping.
-- ----------------------------------------------------------------------------
create or replace function public.search_joinable_companies(p_term text)
returns table (id uuid, name text, city text, logo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  -- Escape the LIKE wildcards so a literal % / _ / \ in the search box is matched
  -- literally, not as a pattern. Backslash MUST be escaped first (it is the LIKE
  -- escape char) or it would double-escape the % / _ replacements that follow.
  with q as (
    select replace(replace(replace(coalesce(p_term, ''), '\', '\\'), '%', '\%'), '_', '\_') as term
  )
  select c.id, c.name::text, c.city::text, c.logo_path::text
    from public.company c, q
   where c.deleted_at is null
     and c.verification_status = 'verified'
     and (q.term = '' or c.name ilike '%' || q.term || '%')
   order by (c.name ilike q.term || '%') desc, c.name   -- prefix matches first, then alpha
   limit 50;
$$;
revoke all on function public.search_joinable_companies(text) from public;
grant execute on function public.search_joinable_companies(text) to authenticated;

-- ----------------------------------------------------------------------------
-- FIX #4 — onboard_company cancels the caller's pending join_request (step 2c).
-- Full body re-emitted (create or replace) from 20260621110000; the ONLY change is
-- the added step 2c + the v_pending_join declaration. SECURITY INVOKER and
-- search_path=public are preserved.
-- ----------------------------------------------------------------------------
create or replace function public.onboard_company(
  p_name       text,
  p_country    text,
  p_type_codes text[] default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid          uuid := auth.uid();
  -- Pre-generate the id rather than INSERT ... RETURNING. RETURNING under RLS
  -- forces a SELECT-policy check on the new row, but company_select is
  -- (id = current_company_id() OR is_hs_team()) — and the caller isn't linked to
  -- the company yet, so they can't "see" it and the insert is rejected. Generating
  -- the id here lets us INSERT without RETURNING and link the person afterwards.
  v_company_id   uuid := gen_random_uuid();
  v_code         text;
  v_pending_join uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Guard: a person who already belongs to a company cannot create another.
  -- (The company INSERT policy would reject this anyway; this gives a clean error.)
  if public.current_company_id() is not null then
    raise exception 'already_has_company';
  end if;

  -- 1. Birth the company. created_by = caller satisfies the INSERT policy; the
  --    explicit id avoids RETURNING (see the SELECT-policy note above).
  insert into public.company (id, name, country, created_by)
  values (v_company_id, p_name, p_country, v_uid);

  -- 2. Link the caller to it. From here current_company_id() returns v_company_id,
  --    which unlocks the child inserts below under RLS.
  update public.person
  set company_id = v_company_id, updated_at = now()
  where id = v_uid;

  -- 2b. Seed the founder's Superadmin role (D-02). Definer helper writes the
  --     Superadmin group + founder person_group + the two gated grants despite the
  --     §9 SELECT-only lockdown of those tables. Must run AFTER the person link so
  --     current_company_id() (and any internal scoping) sees the new company.
  perform public.seed_company_superadmin(v_company_id, v_uid);

  -- 2c. Path-B reconciliation (review #4): if the caller had a PENDING join_request
  --     at another company (e.g. they hit "create my own company instead"), cancel
  --     it so it doesn't linger as a phantom in that company's approval queue. Reuse
  --     withdraw_join_request so the cancel is audited like a manual withdraw
  --     (status->'cancelled' + join.withdrawn on the target). The partial-unique
  --     index guarantees at most one pending row, so a single withdraw suffices.
  select id into v_pending_join
    from public.join_request
   where requester_person_id = v_uid
     and status = 'pending'
   limit 1;
  if v_pending_join is not null then
    perform public.withdraw_join_request(v_pending_join);
  end if;

  -- 3. Business-category assignments (multi-select; may be empty).
  foreach v_code in array p_type_codes loop
    insert into public.company_type_assignment (company_id, company_type_code, created_by)
    values (v_company_id, v_code, v_uid);
  end loop;

  return v_company_id;
end;
$$;
