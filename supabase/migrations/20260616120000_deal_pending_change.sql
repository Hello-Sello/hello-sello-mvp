-- =====================================================================
-- 4.5.4 / T1 · deal_pending_change - the HELD two-sided change backbone
-- (Ayush, 2026-06-16)
-- =====================================================================
-- WHY: today a card edit commits INSTANTLY (edit_deal_draft bumps the live
-- card at Send). The product rule is that nothing changes a deal unless a
-- human on EACH side confirms. So an edit must become a HELD pending change:
-- the editor auto-accepts their own side, the change waits until the other
-- side accepts, and a decline/withdraw discards it. The card is only touched
-- on the second yes (in confirm_deal_change). This table stores that held
-- change between Send and commit.
--
-- TRANSIENT ROW (D-05): there is at most ONE active pending change per deal,
-- and the row is DELETED on EVERY exit (accept-commit, decline, withdraw).
-- The permanent history lives in deal_card_log + deal_change_input, NEVER
-- here. Because the row is deleted on every exit, a PLAIN unique index on
-- deal_card_id is enough - it is BOTH the full lock (DCHG-03: only one paper
-- on the table at a time) AND the concurrency guard: a second concurrent
-- propose fails with a unique violation (23505) at the DB, not a second row -
-- so the lock cannot be bypassed by racing the disabled Edit pencil.
--
-- PRIVACY (D-09): `draft` carries SHARED card facts ONLY (line_items, value,
-- currency, terms, free-delivery flag). The seller's private box
-- (deal_party_field) and per-line seller_margin/buyer_metric NEVER enter this
-- snapshot - both sides read the same strip, so a private value here would
-- leak. The private box is written immediately + ungated to the proposer's
-- own deal_party_field, outside this shared row.
--
-- SHARED, not owner-scoped: unlike deal_party_field (owner-only RLS), this row
-- is SHARED - both relationship members read it and the OTHER side acts on it.
-- So RLS gates on card_relationship_member(deal_card_id) for both using +
-- with check (any member of the card's relationship), NOT current_company_id().
--
-- ADDITIVE ONLY: new table + its own policy + four audit codes. Touches no
-- existing table or RLS. FKs only to deal_card / company / person -> droppable
-- later with zero blast radius.
-- =====================================================================

CREATE TABLE public.deal_pending_change (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id         UUID NOT NULL REFERENCES public.deal_card(id) ON DELETE CASCADE,
  base_version         INT  NOT NULL,                          -- the live version this change is built on
  source               VARCHAR(10) NOT NULL DEFAULT 'manual'
                         CHECK (source IN ('manual','sella')), -- 'sella' is Phase 5 (additive now)
  proposed_by_company  UUID NOT NULL REFERENCES public.company(id),
  proposed_by_person   UUID NOT NULL REFERENCES public.person(id),
  proposer_reason      TEXT NOT NULL,                          -- D-07: required at Send
  draft                JSONB NOT NULL,                         -- SHARED snapshot only (no private, D-09)
  votes                JSONB NOT NULL,                         -- { "<companyId>": "accept" | null }
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- THE LOCK (DCHG-03 full lock + the concurrency guard): at most one active
-- pending change per card. The row is deleted on every exit, so a plain unique
-- index on deal_card_id is the whole lock - a second concurrent propose raises
-- a unique violation (23505) instead of inserting a second paper.
CREATE UNIQUE INDEX uq_deal_pending_change_active
  ON public.deal_pending_change(deal_card_id);

-- the read pattern: look up a card's pending change by id (strip + pencil lock)
CREATE INDEX idx_deal_pending_change_card
  ON public.deal_pending_change(deal_card_id);

-- ---------------------------------------------------------------------
-- RLS: the pending change is SHARED. Any relationship member of the card may
-- read it and act on it (the OTHER side casts the deciding vote). Reuses the
-- audited card_relationship_member helper for BOTH using + with check - NOT
-- the owner-only current_company_id() variant.
-- ---------------------------------------------------------------------
ALTER TABLE public.deal_pending_change ENABLE ROW LEVEL SECURITY;

CREATE POLICY pendingchange_member_all ON public.deal_pending_change FOR ALL TO authenticated
  USING (public.card_relationship_member(deal_card_id))
  WITH CHECK (public.card_relationship_member(deal_card_id));

-- ---------------------------------------------------------------------
-- Audit codes for the new lifecycle moments (writeAudit logs these from the
-- server actions). Idempotent via the code primary key.
-- ---------------------------------------------------------------------
INSERT INTO public.audit_action_type (code, description, category) VALUES
  ('deal.change_proposed',  'A held two-sided change was proposed (pending the other side)',        'lifecycle'),
  ('deal.change_committed', 'A held change was accepted by both sides and committed to a new version', 'lifecycle'),
  ('deal.change_declined',  'A held change was declined by the other side and discarded',           'lifecycle'),
  ('deal.change_withdrawn', 'A held change was withdrawn by its proposer',                          'lifecycle')
ON CONFLICT (code) DO NOTHING;
