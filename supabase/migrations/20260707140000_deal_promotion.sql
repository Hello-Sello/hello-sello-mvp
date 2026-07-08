-- =====================================================================
-- Phase 7 / 07-06 · deal_promotion - the INDEPENDENT yellow promotion track
-- (Ayush, 2026-07-07)
-- =====================================================================
-- WHY: a seller-offered promotion/bundle (D-21) is a SEPARATE decision track
-- from the red/green negotiation diff. Per Linear DEV-155 it is modeled as REAL
-- product-table line changes (line_deltas) - e.g. "2 more units of product X" is
-- an actual line-quantity change, not free text. Non-product rewards (free
-- delivery, D-22) go in condition_deltas and render in Extra Conditions, never as
-- a product line.
--
-- SEPARATE ROW, NO SHARED LOCK (Pitfall 2, the load-bearing correction): the
-- negotiation's held change (deal_pending_change) carries a one-active-row lock
-- on deal_card_id so only one paper sits on the table at a time. The promotion
-- must NOT reuse that lock - a live promotion and a live negotiation must be able
-- to co-exist (D-21). So this is its OWN table with NO one-active-row index; a
-- deal may carry a pending promotion AND a pending negotiation at the same time.
--
-- SIGN-AGNOSTIC (D-26, supersedes the prototype's JS): resolving the promotion
-- NEVER touches deal_confirmation or the Sign gate. Accept applies the line
-- deltas INDEPENDENTLY at accept time (Open Question 2) and records state; it does
-- not bump the version or write a confirmation. The prototype's Sign-gating is
-- WRONG and is not built.
--
-- ADDITIVE ONLY: new table + its own policy + three audit codes. Touches no
-- existing table or RLS. FKs only to deal_card / company / person -> droppable
-- later with zero blast radius.
-- =====================================================================

CREATE TABLE public.deal_promotion (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id         UUID NOT NULL REFERENCES public.deal_card(id) ON DELETE CASCADE,
  base_version         INT  NOT NULL,                          -- the live version the offer was made against
  offered_by_company   UUID NOT NULL REFERENCES public.company(id),  -- the seller (session-derived at offer time)
  offered_by_person    UUID NOT NULL REFERENCES public.person(id),
  line_deltas          JSONB NOT NULL DEFAULT '[]'::jsonb,     -- REAL product-table reward lines (D-21)
  condition_deltas     JSONB NOT NULL DEFAULT '[]'::jsonb,     -- non-product rewards -> Extra Conditions (D-22)
  state                TEXT NOT NULL DEFAULT 'pending'
                         CHECK (state IN ('pending','accepted','declined')),
  resolved_by_person   UUID NULL REFERENCES public.person(id), -- the buyer who accepted/declined
  resolved_at          TIMESTAMPTZ NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL (Pitfall 2): a PLAIN read index only. Unlike deal_pending_change,
-- there is deliberately NO one-active-row lock here - a live promotion and a live
-- negotiation never block each other (D-21). The read pattern is "the card's
-- current promotion", so index the parent for the lookup.
CREATE INDEX idx_deal_promotion_card
  ON public.deal_promotion (deal_card_id);

-- ---------------------------------------------------------------------
-- RLS: the promotion is SHARED. Any relationship member of the card may read it;
-- the seller offers and the buyer acts on it (the actions re-derive the side from
-- the session, never trusting a client-claimed side). Mirrors the shared
-- pendingchange_member_all policy - card_relationship_member for BOTH using +
-- with check, NOT the owner-only current_company_id() variant.
-- ---------------------------------------------------------------------
ALTER TABLE public.deal_promotion ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotion_member_all ON public.deal_promotion FOR ALL TO authenticated
  USING (public.card_relationship_member(deal_card_id))
  WITH CHECK (public.card_relationship_member(deal_card_id));

-- ---------------------------------------------------------------------
-- Audit codes for the promotion lifecycle moments (writeAudit logs these from the
-- server actions; the action column is FK-validated against audit_action_type).
-- Idempotent via the code primary key.
-- ---------------------------------------------------------------------
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('promotion.offered',  'A seller offered an independent promotion (pending the buyer)',        'lifecycle'),
  ('promotion.accepted', 'A buyer accepted a promotion; its line deltas were applied to the deal', 'lifecycle'),
  ('promotion.declined', 'A buyer declined a promotion; the base deal was left unchanged',        'lifecycle')
ON CONFLICT (code) DO NOTHING;
