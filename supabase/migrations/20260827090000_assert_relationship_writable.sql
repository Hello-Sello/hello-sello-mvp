-- ============================================================================
-- HEL-84 (0026-relationship-write-gate) · assert_relationship_writable — the
-- single shared gate for NEW writes onto a relationship.
-- ----------------------------------------------------------------------------
-- HEL-82 made 'suspended'/'ended' reachable relationship statuses. That alone
-- only stopped `accept_connection_request` from adopting a suspended pair and
-- (via 20260825180000/20260825190000) stopped `send_deal`/
-- `confirm_detected_deal` from delivering a NEW deal onto one. Ordinary chat
-- messages (`msg_all`) and connect/pricing requests (`inbox_insert`) were
-- still unguarded — `authenticated` holds INSERT on both tables outright, no
-- relationship-status term anywhere in either policy. This function is the
-- one place that answers "is this relationship open for new writes", so
-- `msg_all`, `inbox_insert`, `deliver_deal`, and the two Sella edge functions
-- all call the SAME rule instead of five reimplementations drifting apart.
-- ============================================================================

create function public.assert_relationship_writable(p_relationship_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  -- NULL means nothing to gate: no relationship exists yet (a first-contact
  -- pending_inbox_item), a company-less p2p chat_thread (accept_person_
  -- connection creates these with relationship_id NULL by design), or a
  -- `group` chat_thread (no relationship at all). None are suspendable.
  if p_relationship_id is null then
    return true;
  end if;

  -- Caller must be a party. Without this, ANY authenticated user could call
  -- this function directly (it must be EXECUTE-granted to `authenticated` for
  -- the RLS call sites) with an arbitrary id and read the relationship's
  -- status back out of the raised message. Same NOT FOUND message for "doesn't
  -- exist" and "not yours" — a probe can't tell them apart.
  --
  -- Deliberately does NOT restrict `service_role` (no end-user JWT at all, so
  -- auth.uid() is NULL) — service_role already bypasses RLS system-wide, it
  -- isn't a caller this check is FOR. Discriminated on auth.uid(), NOT
  -- current_company_id(): the latter is ALSO NULL for a real, reachable
  -- authenticated state this repo deliberately supports — a signed-in person
  -- between signup and company onboarding (person.company_id is nullable by
  -- design, per the v0 invariant). Checking current_company_id() IS NULL
  -- would let any company-less signed-in user pass this branch unconditionally
  -- and probe any relationship id's existence/status through the raised
  -- message — the exact leak this comment says it prevents, just for a
  -- different population than service_role.
  select status into v_status
  from public.relationship
  where id = p_relationship_id
    and deleted_at is null
    and (auth.uid() is null
         or public.current_company_id() in (company_a_id, company_b_id));

  if v_status is null then
    raise exception 'assert_relationship_writable: relationship not found';
  end if;

  if v_status <> 'active' then
    raise exception 'assert_relationship_writable: relationship is % — no new writes', v_status;
  end if;

  return true;
end;
$$;

comment on function public.assert_relationship_writable(uuid) is
  'Single owner of "is this relationship open for NEW writes". Returns true or '
  'raises — usable both as a boolean WITH CHECK term and via perform in a '
  'definer RPC. Does not touch is_relationship_member() or any read-side rule; '
  'historical reads stay open regardless of status.';

revoke execute on function public.assert_relationship_writable(uuid) from public, anon;
grant  execute on function public.assert_relationship_writable(uuid) to authenticated;
grant  execute on function public.assert_relationship_writable(uuid) to service_role;
