-- ============================================================================
-- Lane A · deliver_deal — the ONE deal-delivery routing primitive (A2)
-- (Muskan, 2026-07-20)
-- ----------------------------------------------------------------------------
-- A born deal must RELIABLY reach its recipient. The routing key is a single
-- fact: does the card have a counterparty co-owner person (a second deal_member
-- owner ≠ creator)?
--
--   · NO  → company-target: write ONE claimable 'deal_card' ticket into the
--           OTHER company's inbox (pending_inbox_item), right here at birth.
--   · YES → person-target: this function NO-OPS. Person delivery is a chat
--           message posted by the app's send/composition layer — in SQL it
--           would double-deliver the Sella-detection door (which already posts
--           its own deal_detected message).
--
-- Reads deal_member (side-agnostic co-owner probe) instead of comparing
-- initiating_company_id, avoiding the timing gap on the detection path where
-- the initiator is the confirmer, not necessarily the creator's side.
--
-- SECURITY DEFINER: pending_inbox_item's insert RLS requires the SENDER company
-- = the caller's company, but this runs inside the birth RPC (itself definer)
-- and derives every id from the card row — no client input is trusted.
-- Idempotent: at most one live ticket per card, so a re-delivery adds nothing.
--
-- Called from create_deal_draft (next migration) — the single birth path, so
-- ALL producers (c2c chat, p2p chat, basket, Sella confirm) are covered by
-- construction. Additive only; no existing object is altered here.
-- ============================================================================

create or replace function public.deliver_deal(p_deal_card_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_rel uuid; v_initiator uuid; v_creator uuid;
        v_a uuid; v_b uuid; v_receiver uuid; v_has_coowner boolean;
begin
  select relationship_id, initiating_company_id, created_by
    into v_rel, v_initiator, v_creator from public.deal_card where id = p_deal_card_id;
  if v_rel is null then return; end if;

  -- person-target iff a second owner (not the creator) exists (side-agnostic;
  -- avoids the initiating_company_id timing gap on the detection path)
  select exists (
    select 1 from public.deal_member dm
    join public.deal_workspace dw on dw.id = dm.deal_workspace_id
    where dw.deal_card_id = p_deal_card_id and dm.person_id <> v_creator
  ) into v_has_coowner;
  if v_has_coowner then return; end if;  -- PERSON delivery is the send layer's job

  -- COMPANY delivery: one claimable ticket, idempotent
  select company_a_id, company_b_id into v_a, v_b from public.relationship where id = v_rel;
  v_receiver := case when v_initiator = v_a then v_b else v_a end;
  if not exists (select 1 from public.pending_inbox_item
                 where deal_card_id = p_deal_card_id and deleted_at is null) then
    insert into public.pending_inbox_item
      (type, sender_person_id, sender_company_id, receiver_company_id, deal_card_id, status)
    values ('deal_card', v_creator, v_initiator, v_receiver, p_deal_card_id, 'pending');
  end if;
end; $$;

grant execute on function public.deliver_deal(uuid) to authenticated;
