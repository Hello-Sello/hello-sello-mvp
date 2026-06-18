-- ============================================================================
-- Phase 3c · per-company note columns on deal_card (Ayush, 2026-06-18)
-- ----------------------------------------------------------------------------
-- The held card Note (NOTE-01, D-04/D-05/D-06): "one more shared key in the held
-- draft + one more column on the card". Two nullable text columns hold each
-- company's note, mapped STRUCTURALLY to relationship.company_a_id /
-- company_b_id (NOT seller/buyer) — the same a/b convention already used for
-- payment_terms_code and the private-box pair. Nullable so every existing card
-- reads note = null with no backfill needed.
--
-- NO new RLS policy. The existing `card_all` ROW policy
-- (FOR ALL TO authenticated USING is_relationship_member(relationship_id))
-- already covers every column on deal_card, including these two. Both notes
-- being visible to both relationship members IS the intended model (D-03) —
-- this is NOT like deal_party_field (owner-only); a note is shared content by
-- design, so it must never be modelled as private.
--
-- Also publish deal_card to supabase_realtime, mirroring the
-- 20260617130000_deal_pending_change_realtime precedent, so a committed note
-- (and any other card field) can update live on both screens without a manual
-- refresh.
-- ============================================================================

alter table public.deal_card add column note_company_a text null;
alter table public.deal_card add column note_company_b text null;

alter publication supabase_realtime add table public.deal_card;
