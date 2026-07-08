-- ============================================================================
-- Migration — Buy-page schema (Phase 18): buyer_resale_price + purchase_history_import
-- ----------------------------------------------------------------------------
-- Both tables are additive and scoped to the BUYER's own company via RLS,
-- mirroring product_cost's proven company_id = current_company_id() pattern
-- (see 20260607190000_seller_only_column_split.sql).
--
-- Naming ambiguity resolved here (CONTEXT.md's own prose uses "company_id" to
-- mean two different things in the same paragraph): buyer_resale_price keeps
-- BOTH concepts as separate, clearly-named columns —
--   buyer_company_id     = the RLS owner: the BUYER's OWN company (never the
--                           supplier's). This is what RLS filters on.
--   supplier_company_id  = a nullable FK to a CONNECTED supplier's company
--                           row, populated only when that supplier is a real
--                           connected company (not a CSV-only partner).
-- supplier_name/product_name are always populated (display/dedup keys, and
-- the only identity CSV-only suppliers/products have).
--
-- v0-independence lock (CONTEXT.md): buyer_resale_price is fully independent
-- of deal_line_item_private.buyer_metric (per-deal-version snapshot) — no
-- auto-fill/snapshot link yet.
-- ============================================================================

-- ── buyer_resale_price — pencil-edit net/gross cells, per (buyer, partner, product) ──
CREATE TABLE buyer_resale_price (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_company_id     UUID NOT NULL REFERENCES company(id),   -- RLS owner: the buyer's OWN company
  supplier_company_id  UUID NULL REFERENCES company(id),       -- populated only when the supplier is a real connected company
  supplier_name        TEXT NOT NULL,                          -- always populated; display/dedup key, also the key for CSV-only (unconnected) suppliers
  product_id           UUID NULL REFERENCES product(id),       -- populated only for a real catalogue product (live-deal partners)
  product_name         TEXT NOT NULL,                          -- always populated; display/dedup key, also the key for CSV-only products
  net                  NUMERIC(15, 4) NULL,
  gross                NUMERIC(15, 4) NULL,
  created_by           UUID NULL REFERENCES person(id),
  updated_by           UUID NULL REFERENCES person(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_buyer_resale_price UNIQUE (buyer_company_id, supplier_name, product_name)
);
CREATE INDEX idx_buyer_resale_price_buyer ON buyer_resale_price(buyer_company_id);

ALTER TABLE buyer_resale_price ENABLE ROW LEVEL SECURITY;
CREATE POLICY buyer_resale_price_all ON buyer_resale_price FOR ALL TO authenticated
  USING (buyer_company_id = current_company_id())
  WITH CHECK (buyer_company_id = current_company_id());

CREATE TRIGGER trg_buyer_resale_price_set_updated_at
  BEFORE UPDATE ON buyer_resale_price
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── purchase_history_import — minimal CSV backfill rows ─────────────────────
-- No fuzzy supplier/product matching in v0 — every CSV-imported supplier name
-- is its own partner row unless the buyer explicitly links it later (deferred,
-- mirrors the parked catalogue-ingestion-DESIGN.md's full reconciliation work).
CREATE TABLE purchase_history_import (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_company_id UUID NOT NULL REFERENCES company(id),        -- RLS owner
  supplier_name    TEXT NOT NULL,
  product_name     TEXT NOT NULL,
  purchase_date    DATE NOT NULL,
  quantity         NUMERIC(15, 3) NOT NULL,
  unit             VARCHAR(20) NOT NULL REFERENCES deal_line_unit(code),  -- reuse existing lookup (g/kg/unit) — do NOT invent a new enum
  unit_price       NUMERIC(15, 4) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'EUR',
  created_by       UUID NULL REFERENCES person(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_purchase_history_import_buyer ON purchase_history_import(buyer_company_id);

ALTER TABLE purchase_history_import ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_history_import_all ON purchase_history_import FOR ALL TO authenticated
  USING (buyer_company_id = current_company_id())
  WITH CHECK (buyer_company_id = current_company_id());

-- audit vocabulary for the new pricing-sensitive tables (mirrors product_cost precedent)
INSERT INTO auditable_content_type (code, description, target_table) VALUES
  ('buyer_resale_price',      'A buyer''s own resale price (net/gross) per partner/product', 'buyer_resale_price'),
  ('purchase_history_import', 'A CSV-imported purchase-history backfill row',                 'purchase_history_import');
