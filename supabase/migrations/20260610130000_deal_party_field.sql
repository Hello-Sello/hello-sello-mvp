-- =====================================================================
-- 3a · Deal card - role-scoped private fields  (Ayush, 2026-06-10)
-- =====================================================================
-- WHY: the seller's Margin (and the buyer's counterpart metric) have no home
-- in the schema, and MANY more seller-only / buyer-only fields are coming once
-- the Sell/Buy pages are designed. Instead of a fixed column per field, this is
-- ONE extensible table: one row per (card, version, side, field). Adding a new
-- private field later is a row insert, never a migration.
--
-- PRIVACY (the load-bearing rule): each row is owned by ONE company
-- (`owner_company_id`). RLS returns only your own company's rows, so the other
-- side's app NEVER receives the seller's Margin (or vice-versa) - in a PO or an
-- SO, no matter what the UI does. Same spine as `relationship_note`.
--
-- ADDITIVE ONLY: new table + its own policy + a demo seed. Touches no existing
-- table or RLS. Isolated (FKs only to deal_card + company) → droppable later
-- with zero blast radius if the Sell/Buy design changes its shape.
--
-- Versioned like `deal_line_item`: a row belongs to a card VERSION, so a
-- version bump (3a Phase 7) snapshots the private fields too.
-- =====================================================================

CREATE TABLE public.deal_party_field (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_card_id      UUID NOT NULL REFERENCES public.deal_card(id) ON DELETE CASCADE,
  version           INT  NOT NULL,
  owner_company_id  UUID NOT NULL REFERENCES public.company(id),   -- THE privacy key
  party_side        VARCHAR(10) NOT NULL CHECK (party_side IN ('seller','buyer')),
  field_key         VARCHAR(50) NOT NULL,                          -- 'margin', 'buyer_metric', …
  field_label       VARCHAR(100) NOT NULL,                         -- 'Margin'
  value_text        TEXT NULL,                                     -- flexible: '4.000 €', '17%', placeholder
  sort_order        SMALLINT NOT NULL DEFAULT 0,
  metadata          JSONB NOT NULL DEFAULT '{}',
  created_by        UUID NULL REFERENCES public.person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one value per field, per side, per card version
  CONSTRAINT deal_party_field_unique UNIQUE (deal_card_id, version, owner_company_id, field_key)
);

-- the read pattern: a card's current-version fields for the viewing company
CREATE INDEX deal_party_field_card_version_idx
  ON public.deal_party_field (deal_card_id, version, owner_company_id);

-- ---------------------------------------------------------------------
-- RLS: you ONLY ever see your own company's rows. Writes must be your own
-- company AND for a card you are a party to (reuses the existing helper).
-- ---------------------------------------------------------------------
ALTER TABLE public.deal_party_field ENABLE ROW LEVEL SECURITY;

CREATE POLICY partyfield_owner_only ON public.deal_party_field FOR ALL TO authenticated
  USING (owner_company_id = current_company_id())
  WITH CHECK (
    owner_company_id = current_company_id()
    AND card_relationship_member(deal_card_id)
  );

-- ---------------------------------------------------------------------
-- Demo seed: a seller Margin + a buyer placeholder on every demo-world card,
-- so the private field is verifiable immediately (and the historical cards on
-- the relationship page read richly). Seller/buyer derived from deal_type +
-- initiator (offer → initiator is seller). Idempotent via the unique key.
-- The live-demo draftable card (Phase 8) gets its own fields when created.
-- ---------------------------------------------------------------------
WITH demo AS (
  SELECT dc.id AS deal_card_id, dc.version,
         -- offer = seller-initiated → initiator is the seller; else the other side
         CASE WHEN dc.deal_type = 'offer' THEN dc.initiating_company_id
              WHEN dc.initiating_company_id = r.company_a_id THEN r.company_b_id
              ELSE r.company_a_id END AS seller_company_id,
         CASE WHEN dc.deal_type = 'offer'
                THEN CASE WHEN dc.initiating_company_id = r.company_a_id THEN r.company_b_id ELSE r.company_a_id END
              ELSE dc.initiating_company_id END AS buyer_company_id
  FROM public.deal_card dc
  JOIN public.relationship r ON r.id = dc.relationship_id
  WHERE dc.metadata->>'seed' = 'demo-world'
)
INSERT INTO public.deal_party_field
  (deal_card_id, version, owner_company_id, party_side, field_key, field_label, value_text, sort_order, metadata)
SELECT deal_card_id, version, seller_company_id, 'seller', 'margin', 'Margin', '4.000 €', 0,
       '{"seed":"demo-world"}'::jsonb
FROM demo
UNION ALL
SELECT deal_card_id, version, buyer_company_id, 'buyer', 'buyer_metric', 'Buyer metric', 'placeholder · name TBD', 0,
       '{"seed":"demo-world"}'::jsonb
FROM demo
ON CONFLICT ON CONSTRAINT deal_party_field_unique DO NOTHING;
