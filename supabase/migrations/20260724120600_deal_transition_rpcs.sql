-- ============================================================================
-- Phase 12 · the four small transition RPCs — decline / finalize / reopen / close
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- WHY: every status transition today rides a raw client UPDATE (actions.ts
-- updateStatus) — the survey found ANY authenticated user can decline another
-- relationship's deal, and none of the flips are protected once plan 12-04
-- REVOKEs UPDATE on deal_card from authenticated. These four SECURITY DEFINER
-- functions port the existing action guards byte-for-byte (D-09), so the app's
-- transition verbs keep working when the raw write path closes:
--
--   decline_deal        <- declineDeal      (either party; idempotent on
--                                            'cancelled'/'done'; -> 'cancelled')
--   finalize_deal       <- finalizeDeal     (SELLER-only, derived in SQL; a
--                                            seller-uploaded invoice must exist;
--                                            'confirmed' -> 'done'; idempotent)
--   reopen_deal_ticket  <- reopenTicket     (either party; 'done' only;
--                                            -> 'ticket_created'; optional note)
--   close_deal_ticket   <- closeTicket      (either party; 'ticket_created'
--                                            only; -> 'ticket_closed')
--
-- Six-small-functions over one parameterized transition RPC: the guards differ
-- too much per verb (finalize reads deal_artifact; sign nests
-- confirm_deal_change) — RESEARCH Pattern 3's rejection rationale.
--
-- Shared shape (Pattern 2 skeleton): session identity from auth.uid() ->
-- person.company_id, FOR UPDATE card lock (race safety), relationship
-- membership, per-verb status guard, the flip, the log line with the action's
-- exact wording. Error prefix '<fn_name>: ' + the action's exact sentence, so
-- the app's error banners keep today's text.
--
-- The status literals written here ('cancelled','done','ticket_created',
-- 'ticket_closed') are unchanged vocabulary — only sign_deal (120500) guards
-- on the renamed 'negotiation'.
--
-- NOT touched: audit stamps (writeAudit) and announceDealEvent stay APP-side
-- (plan 12-07) — no audit rows are written here. No deal_confirmation write
-- (the Seal is deferred, D-11).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- decline_deal — either party closes the deal; idempotent on an already-closed
-- card (ports declineDeal: membership guard, cancelled/done early-return).
-- ----------------------------------------------------------------------------
create or replace function public.decline_deal(p_deal_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_card    record;
  v_a       uuid;
  v_b       uuid;
begin
  if v_uid is null then
    raise exception 'decline_deal: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'decline_deal: caller has no company';
  end if;

  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'decline_deal: deal not found';
  end if;

  -- membership guard: the caller's company must be a party to this deal.
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship where id = v_card.relationship_id;
  if v_company is distinct from v_a and v_company is distinct from v_b then
    raise exception 'decline_deal: Only a party to this deal can decline it.';
  end if;

  -- WR-02 status matrix: decline is a NEGOTIATION-only verb.
  --   · unsent          -> a PRIVATE draft; it is DISCARDED, never declined
  --                        (declining would un-hide a draft the counterparty
  --                        was never meant to see) — raises;
  --   · cancelled/done  -> idempotent no-op (an already-closed deal);
  --   · confirmed / ticket_* / anything else -> not declinable.
  -- Order matters: 'unsent' raises BEFORE the idempotent return (it is not yet
  -- closed), and cancelled/done still short-circuit before the negotiation-only
  -- gate so re-declining a closed deal stays a silent no-op.
  if v_card.status = 'unsent' then
    raise exception 'decline_deal: a private draft cannot be declined - discard it instead';
  end if;

  -- idempotent: an already-closed deal does not get a second write.
  if v_card.status in ('cancelled', 'done') then
    return;
  end if;

  -- only a live negotiation can be declined (confirmed -> cancelled is unsupported).
  if v_card.status <> 'negotiation' then
    raise exception 'decline_deal: only a deal in negotiation can be declined';
  end if;

  update public.deal_card
  set status = 'cancelled', updated_by = v_uid, updated_at = now()
  where id = p_deal_card_id;

  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_card.version, 'Deal declined - the deal is closed.',
          'deal_chat', 'person', v_uid);
end;
$$;

grant execute on function public.decline_deal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- finalize_deal — the invoice close (D-27): SELLER-only, derived in SQL from
-- deal_type + initiating_company_id vs the relationship pair (sellerCompanyId
-- semantics: 'offer' -> the initiator IS the seller; 'order' -> the seller is
-- the OTHER company). Requires a live SELLER-uploaded invoice artifact.
-- Idempotent on an already-'done' card (ports finalizeDeal's guard order:
-- idempotency BEFORE the seller guard, matching the action byte-for-byte).
-- ----------------------------------------------------------------------------
create or replace function public.finalize_deal(p_deal_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_company     uuid;
  v_card        record;
  v_a           uuid;
  v_b           uuid;
  v_seller      uuid;
  v_ws          uuid;
  v_has_invoice boolean;
begin
  if v_uid is null then
    raise exception 'finalize_deal: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'finalize_deal: caller has no company';
  end if;

  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'finalize_deal: deal not found';
  end if;

  -- WR-04: resolve the relationship pair + gate on PARTY MEMBERSHIP first, BEFORE
  -- the idempotent 'done' early-return. Before this a NON-PARTY calling finalize
  -- on an already-'done' card got a silent void (the early-return fired ahead of
  -- any authorization) instead of the seller rejection. A non-party is certainly
  -- not the seller, so it shares the seller-only error text.
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship where id = v_card.relationship_id;
  if v_a is null then
    raise exception 'finalize_deal: relationship not found';
  end if;
  if v_company is distinct from v_a and v_company is distinct from v_b then
    raise exception 'finalize_deal: Only the seller can finalize this deal.';
  end if;

  -- idempotency guard: if already done, do NOT write again (a party re-finalizing
  -- a closed deal is a no-op — now BELOW the membership gate so a non-party can
  -- never receive a silent success).
  if v_card.status = 'done' then
    return;
  end if;

  -- derive the SELLER company from the card's issuer facts + the relationship
  -- pair (sellerCompanyId, derive.ts:48-55, ported exactly; reuses v_a/v_b
  -- resolved just above).
  v_seller := case
    when v_card.deal_type = 'offer' then v_card.initiating_company_id
    when v_card.initiating_company_id = v_a then v_b
    else v_a
  end;

  -- SELLER-ONLY guard (ASVS V4): only the seller side may close the deal.
  if v_company is distinct from v_seller then
    raise exception 'finalize_deal: Only the seller can finalize this deal.';
  end if;

  -- the workspace this card belongs to (the invoice artifact hangs off it).
  select id into v_ws
  from public.deal_workspace
  where deal_card_id = p_deal_card_id and deleted_at is null;
  if v_ws is null then
    raise exception 'finalize_deal: deal workspace not found';
  end if;

  -- TRIGGER: a live SELLER-uploaded invoice must exist (ports the existence
  -- predicate from finalizeDeal — a buyer-uploaded or forged invoice fails it).
  select exists (
    select 1 from public.deal_artifact
    where deal_workspace_id = v_ws
      and category = 'invoice'
      and uploaded_by_company_id = v_seller
      and deleted_at is null
  ) into v_has_invoice;

  -- GATE (D-27, canFinalizeByInvoice ported): an AGREED status ('confirmed' —
  -- the 'amended' arm dies with this phase's vocabulary cleanup) AND the
  -- seller invoice. One combined check = the action's one combined error.
  if v_card.status <> 'confirmed' or not v_has_invoice then
    raise exception 'finalize_deal: A confirmed deal with the seller''s invoice is required to finalize.';
  end if;

  update public.deal_card
  set status = 'done', updated_by = v_uid, updated_at = now()
  where id = p_deal_card_id;

  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_card.version, 'Deal Executed - the seller uploaded the invoice.',
          'deal_chat', 'person', v_uid);
end;
$$;

grant execute on function public.finalize_deal(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- reopen_deal_ticket — either party reopens a CLOSED (executed) deal as a
-- ticket (D-29: the ONLY path back is from 'done'). Optional note rides the
-- log line exactly as reopenTicket composes it today.
-- ----------------------------------------------------------------------------
create or replace function public.reopen_deal_ticket(
  p_deal_card_id uuid,
  p_note         text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_card    record;
  v_a       uuid;
  v_b       uuid;
  v_note    text;
begin
  if v_uid is null then
    raise exception 'reopen_deal_ticket: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'reopen_deal_ticket: caller has no company';
  end if;

  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'reopen_deal_ticket: deal not found';
  end if;

  -- EITHER party may reopen - the session company must be one of the two sides.
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship where id = v_card.relationship_id;
  if v_company is distinct from v_a and v_company is distinct from v_b then
    raise exception 'reopen_deal_ticket: Only a deal party can reopen this deal.';
  end if;

  -- D-29: the ONLY path back is from a closed deal.
  if v_card.status <> 'done' then
    raise exception 'reopen_deal_ticket: Only a closed (executed) deal can be reopened.';
  end if;

  update public.deal_card
  set status = 'ticket_created', updated_by = v_uid, updated_at = now()
  where id = p_deal_card_id;

  -- the optional note, exactly as reopenTicket composes it (empty trims to none).
  v_note := nullif(btrim(p_note), '');
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_card.version,
          case when v_note is not null
               then 'Reopen ticket opened - ' || v_note
               else 'Reopen ticket opened.' end,
          'deal_chat', 'person', v_uid);
end;
$$;

grant execute on function public.reopen_deal_ticket(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- close_deal_ticket — either party closes an OPEN reopen ticket; only from
-- 'ticket_created' (ports closeTicket; never touches the sealed terms).
-- ----------------------------------------------------------------------------
create or replace function public.close_deal_ticket(p_deal_card_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_company uuid;
  v_card    record;
  v_a       uuid;
  v_b       uuid;
begin
  if v_uid is null then
    raise exception 'close_deal_ticket: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'close_deal_ticket: caller has no company';
  end if;

  select * into v_card from public.deal_card where id = p_deal_card_id for update;
  if v_card.id is null then
    raise exception 'close_deal_ticket: deal not found';
  end if;

  select company_a_id, company_b_id into v_a, v_b
  from public.relationship where id = v_card.relationship_id;
  if v_company is distinct from v_a and v_company is distinct from v_b then
    raise exception 'close_deal_ticket: Only a deal party can close this ticket.';
  end if;

  if v_card.status <> 'ticket_created' then
    raise exception 'close_deal_ticket: Only an open reopen ticket can be closed.';
  end if;

  update public.deal_card
  set status = 'ticket_closed', updated_by = v_uid, updated_at = now()
  where id = p_deal_card_id;

  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, v_card.version, 'Reopen ticket closed.',
          'deal_chat', 'person', v_uid);
end;
$$;

grant execute on function public.close_deal_ticket(uuid) to authenticated;
