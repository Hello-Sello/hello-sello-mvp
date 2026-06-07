-- ============================================================================
-- Migration — seller-only column split (F2 column hiding, Option B)
-- ----------------------------------------------------------------------------
-- RLS is row-level only, so a counterparty who can see a shared row can read
-- every column of it — leaking the 🔒 seller-only numbers. Fix: move those
-- numbers OUT of the shared rows into per-side sibling tables, so plain
-- row-RLS (filter by owning company) hides them natively. DB is empty -> no
-- data migration.
--
--   product.cogs                         -> product_cost          (owner-only)
--   deal_line_item.seller_margin/.buyer_metric -> deal_line_item_private (per-side)
--
-- Each sibling row belongs to ONE company (the side that owns the number); RLS
-- shows a company only its own row, so the counterparty never sees it.
-- ============================================================================

-- ── product.cogs -> product_cost ─────────────────────────────────────────────
CREATE TABLE product_cost (
  product_id UUID PRIMARY KEY REFERENCES product(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES company(id),   -- = product owner; RLS key
  cogs       NUMERIC(15, 4) NULL,
  created_by UUID NULL REFERENCES person(id),
  updated_by UUID NULL REFERENCES person(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_product_cost_company ON product_cost(company_id);

ALTER TABLE product DROP COLUMN cogs;

-- ── deal_line_item.seller_margin / buyer_metric -> deal_line_item_private ─────
-- Immutable like its parent deal_line_item (versioned snapshot; no updated_at).
-- One row per side per line item: the seller's row carries seller_margin, the
-- buyer's row carries buyer_metric. RLS by company_id hides the other side's row.
CREATE TABLE deal_line_item_private (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_line_item_id UUID NOT NULL REFERENCES deal_line_item(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES company(id),   -- owning side; RLS key
  seller_margin     NUMERIC(6, 4) NULL,   -- set on the seller's row
  buyer_metric      NUMERIC(6, 4) NULL,   -- set on the buyer's row (name TBD)
  created_by        UUID NULL REFERENCES person(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_dli_private UNIQUE (deal_line_item_id, company_id)
);
CREATE INDEX idx_dli_private_line ON deal_line_item_private(deal_line_item_id);
CREATE INDEX idx_dli_private_company ON deal_line_item_private(company_id);

ALTER TABLE deal_line_item DROP COLUMN seller_margin;
ALTER TABLE deal_line_item DROP COLUMN buyer_metric;

-- ── RLS — each side sees only its own private row ─────────────────────────────
ALTER TABLE product_cost ENABLE ROW LEVEL SECURITY;            -- idempotent
ALTER TABLE deal_line_item_private ENABLE ROW LEVEL SECURITY;  -- idempotent

CREATE POLICY product_cost_all ON product_cost FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

CREATE POLICY dli_private_all ON deal_line_item_private FOR ALL TO authenticated
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- updated_at automation (product_cost only; the private table is immutable)
CREATE TRIGGER trg_product_cost_set_updated_at
  BEFORE UPDATE ON product_cost
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- audit vocabulary for the new pricing-sensitive tables
INSERT INTO auditable_content_type (code, description, target_table) VALUES
  ('product_cost',           'A product cost (COGS)', 'product_cost'),
  ('deal_line_item_private', 'A deal line private metric', 'deal_line_item_private');
