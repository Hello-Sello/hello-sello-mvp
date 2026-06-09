-- ============================================================================
-- Migration — RLS: Connect counterparty visibility (2d Phase 2 fix)
-- ----------------------------------------------------------------------------
-- The base policies (company_select / person_select, rls_policies.sql) allowed a
-- user to read ONLY their own company + own company's people — a safe
-- default-deny written for tenant isolation, but never exercised across
-- companies (Connect was mock). Connect must let you see the NAME of a company/
-- person you have a LINK with (a relationship, or a pending inbox request),
-- otherwise an inbound request shows "Unknown company" and chat can't show the
-- counterpart's name.
--
-- This adds that one exception, WhatsApp-style: you see the counterpart's NAME
-- when you share a connection/inbox link — never their private data (their other
-- relationships, deals, documents stay hidden by those tables' own RLS).
--
-- SECURITY DEFINER helpers resolve the link while bypassing the subquery tables'
-- RLS (same pattern as the rest of rls_policies.sql) — so no policy recursion.
-- ============================================================================

create or replace function public.shares_connection_with_company(p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.relationship r
    where public.current_company_id() in (r.company_a_id, r.company_b_id)
      and p_company_id in (r.company_a_id, r.company_b_id)
  ) or exists (
    select 1 from public.pending_inbox_item p
    where (p.sender_company_id = p_company_id and p.receiver_company_id = public.current_company_id())
       or (p.receiver_company_id = p_company_id and p.sender_company_id = public.current_company_id())
  );
$$;

create or replace function public.can_see_person(p_person_id uuid, p_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.shares_connection_with_company(p_company_id)
  or exists (
    select 1 from public.pending_inbox_item p
    where p.sender_person_id = p_person_id and p.receiver_company_id = public.current_company_id()
  );
$$;

grant execute on function public.shares_connection_with_company(uuid) to authenticated;
grant execute on function public.can_see_person(uuid, uuid) to authenticated;

-- company: own + HS team + a company you share a connection / inbox link with
drop policy if exists company_select on company;
create policy company_select on company for select to authenticated
using (
  id = current_company_id()
  or is_hs_team()
  or shares_connection_with_company(id)
);

-- person: self + own company + HS team + a person you can legitimately see
drop policy if exists person_select on person;
create policy person_select on person for select to authenticated
using (
  id = auth.uid()
  or company_id = current_company_id()
  or is_hs_team()
  or can_see_person(id, company_id)
);
