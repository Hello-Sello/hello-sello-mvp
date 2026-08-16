-- ============================================================================
-- Phase 12 · sign_deal — the fixed-signer accept, atomic commit + flip (A3/D-10)
-- (Ayush, 2026-07-24)
-- ----------------------------------------------------------------------------
-- WHY: today Sign is UI-only ("who sent the latest version", DecisionBar) and
-- the app's signDeal runs TWO separate statements: the held-change commit
-- (confirm_deal_change RPC) and then a raw client UPDATE to 'confirmed'. A
-- crash between them signs nothing; a direct PostgREST caller skips the rule
-- entirely and the INITIATOR can sign their own fresh proposal. This function
-- moves the whole verb behind one SECURITY DEFINER transaction so plan 12-04's
-- REVOKE UPDATE ON deal_card can land without breaking Sign.
--
-- Guards, in order (D-10 + Pitfall 6):
--   1. session identity (auth.uid() -> person.company_id; never client input)
--   2. FOR UPDATE lock on the card (double-sign race)
--   3. relationship membership (caller company is one of the pair)
--   4. status = 'negotiation' (the post-rename live vocabulary, 12-01/12-02)
--   5. FIXED SIGNER: caller company <> initiating_company_id — the from-birth
--      stored fact; the initiating company can never sign its own deal
--   6. own-held-change rejection: when the held change was proposed by the
--      CALLER's company, their 'accept' would record one vote and commit
--      NOTHING (the D-02 both-accept gate) — the flip would sign an
--      uncommitted card. Server-side twin of the Wave-3 disabled-Sign rule.
--
-- Held change from the OTHER side: committed via a NESTED definer call
-- public.confirm_deal_change(card, 'accept', 'Signed the deal') — the proven
-- house practice (confirm_detected_deal nests create_deal_draft); the votes
-- gate commits because the proposer's yes was pre-seeded at propose time.
-- NEVER re-implement the 7-re-emit commit body here.
--
-- Returns int: the new version from the nested commit, null when no change
-- was held (the app can tell "signed as-is" from "committed v+1 then signed").
--
-- NOT touched: deal_confirmation (the Seal is DEFERRED to the final stage —
-- locked project memory / D-11 keeps that table read-only for the future Seal
-- record); audit stamping + announceDealEvent stay APP-side (plan 12-07).
-- ============================================================================

create or replace function public.sign_deal(p_deal_card_id uuid)
returns int   -- new version when a held change was committed, else null
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
  v_proposer_co uuid;
  v_version     int;   -- from the nested commit; stays null when nothing was held
begin
  -- 1 · identity from the session (never a client-supplied company)
  if v_uid is null then
    raise exception 'sign_deal: not authenticated';
  end if;
  select company_id into v_company from public.person where id = v_uid;
  if v_company is null then
    raise exception 'sign_deal: caller has no company';
  end if;

  -- 2 · lock the card (prevents a double-sign race; same FOR UPDATE shape as
  --     confirm_deal_change's held-row lock)
  select * into v_card
  from public.deal_card
  where id = p_deal_card_id
  for update;
  if v_card.id is null then
    raise exception 'sign_deal: deal not found';
  end if;

  -- 3 · membership: the caller's company must be a party to this deal
  select company_a_id, company_b_id into v_a, v_b
  from public.relationship
  where id = v_card.relationship_id and deleted_at is null;
  if v_a is null then
    raise exception 'sign_deal: relationship not found';
  end if;
  if v_company <> v_a and v_company <> v_b then
    raise exception 'sign_deal: caller is not a member of this relationship';
  end if;

  -- 4 · only a live negotiation can be signed
  if v_card.status <> 'negotiation' then
    raise exception 'sign_deal: only a deal in negotiation can be signed';
  end if;

  -- 5 · FIXED SIGNER (D-10): the deal receiver signs, never the initiator
  if v_company = v_card.initiating_company_id then
    raise exception 'sign_deal: the initiating company cannot sign its own deal';
  end if;

  -- 6 · held change: lock the pending row and decide by proposer side
  select proposed_by_company into v_proposer_co
  from public.deal_pending_change
  where deal_card_id = p_deal_card_id
  for update;
  if found then
    if v_proposer_co = v_company then
      -- Pitfall 6: the caller's own accept records ONE vote and commits
      -- nothing — flipping now would sign an uncommitted card.
      raise exception 'sign_deal: withdraw your held change before signing';
    end if;
    -- the OTHER side proposed it: commit via the nested definer call (same
    -- transaction). The proposer's pre-seeded yes + this accept passes the
    -- D-02 both-accept gate, so this ALWAYS commits (returns v_base + 1).
    v_version := public.confirm_deal_change(p_deal_card_id, 'accept', 'Signed the deal');
  end if;

  -- 7 · the flip — same transaction as the commit above (atomicity is the point)
  update public.deal_card
  set status = 'confirmed',
      updated_by = v_uid,
      updated_at = now()
  where id = p_deal_card_id;

  -- 8 · the log line (signDeal's exact wording: "Deal signed."). Version is the
  --     card's CURRENT version — the committed v+1 when a change was held, else
  --     the version read at the lock (the app logged the pre-commit read; the
  --     post-commit version is the one the signature actually covers).
  insert into public.deal_card_log (
    deal_card_id, version, change_summary, origin, changed_by, changed_by_person_id)
  values (p_deal_card_id, coalesce(v_version, v_card.version), 'Deal signed.',
          'deal_chat', 'person', v_uid);

  return v_version;
end;
$$;

grant execute on function public.sign_deal(uuid) to authenticated;
