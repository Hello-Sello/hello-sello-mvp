-- ============================================================================
-- Migration 4/5 — Product catalog & pricelist
-- ----------------------------------------------------------------------------
-- The supplier catalog spine: product (label) -> product_batch (measured CoA),
-- batch terpenes, buyer-specific codes, pricelist header + rows.
-- Depends on migrations 1 (lookups, incl. terpene), 2 (company/person),
-- 3 (relationship).
--
-- product is created here; the deferred deal_line_item.product_id FK is added
-- in migration 5 (deal_line_item lives in migration 3, before product exists).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- product  (catalog master; label/advertised cannabinoids)
-- ----------------------------------------------------------------------------
CREATE TABLE product (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES company(id),    -- supplier/owner
  name                  VARCHAR(200) NOT NULL,
  cultivar              VARCHAR(120) NULL,
  supplier_product_code VARCHAR(60) NULL,
  local_code_pzn        VARCHAR(30) NULL,                        -- German PZN
  pack_size_grams       NUMERIC(10, 2) NULL,
  unit_code             VARCHAR(10) NOT NULL DEFAULT 'g' REFERENCES product_unit(code),
  bundle_description    VARCHAR(60) NULL,
  packaging_material    VARCHAR(60) NULL,
  resealable            BOOLEAN NULL,
  thc_percent           NUMERIC(5, 2) NULL,                      -- label/advertised
  cbd_percent           NUMERIC(5, 2) NULL,                      -- label/advertised
  cbg_percent           NUMERIC(5, 2) NULL,                      -- label/advertised
  cbn_percent           NUMERIC(5, 2) NULL,                      -- label/advertised
  cultivator            VARCHAR(120) NULL,                       -- the grower
  country_of_origin     VARCHAR(80) NULL,
  region                VARCHAR(80) NULL,
  lineage_parent_a      VARCHAR(120) NULL,
  lineage_parent_b      VARCHAR(120) NULL,
  dominance_code        VARCHAR(20) NULL REFERENCES strain_dominance(code),
  irradiation_code      VARCHAR(20) NULL REFERENCES irradiation_type(code),
  cogs                  NUMERIC(15, 4) NULL,                     -- seller-only (RLS)
  rrp_per_gram          NUMERIC(15, 4) NULL,                     -- reference (UVP)
  visibility_start      DATE NULL,
  visibility_end        DATE NULL,
  image_path            VARCHAR(255) NULL,
  metadata              JSONB NOT NULL DEFAULT '{}',             -- per-company custom cols
  created_by            UUID NULL REFERENCES person(id),
  updated_by            UUID NULL REFERENCES person(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ NULL,
  deleted_by            UUID NULL REFERENCES person(id)
);
CREATE UNIQUE INDEX uq_product_supplier_code_active
  ON product(company_id, supplier_product_code) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_company ON product(company_id);
CREATE INDEX idx_product_company_cultivar ON product(company_id, cultivar);

-- ----------------------------------------------------------------------------
-- product_batch  (per-lot; measured CoA values)
-- ----------------------------------------------------------------------------
CREATE TABLE product_batch (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES company(id),   -- supplier (denormalized)
  product_id             UUID NOT NULL REFERENCES product(id),
  batch_number           VARCHAR(60) NOT NULL,
  ready_for_sale_date    DATE NULL,
  shelf_life_months      SMALLINT NULL,
  expiry_date            DATE NULL,
  loss_on_drying_percent NUMERIC(5, 2) NULL,
  water_activity         NUMERIC(4, 2) NULL,
  thc_percent            NUMERIC(5, 2) NULL,                     -- measured
  cbd_percent            NUMERIC(5, 2) NULL,                     -- measured
  cbg_percent            NUMERIC(5, 2) NULL,                     -- measured
  cbn_percent            NUMERIC(5, 2) NULL,                     -- measured
  description            TEXT NULL,
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_by             UUID NULL REFERENCES person(id),
  updated_by             UUID NULL REFERENCES person(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ NULL,
  deleted_by             UUID NULL REFERENCES person(id)
);
CREATE UNIQUE INDEX uq_product_batch_number_active
  ON product_batch(company_id, batch_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_product_batch_product ON product_batch(product_id);

-- ----------------------------------------------------------------------------
-- batch_terpene  (a batch's terpene profile; one row per terpene)
-- ----------------------------------------------------------------------------
CREATE TABLE batch_terpene (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_batch_id UUID NOT NULL REFERENCES product_batch(id),
  terpene_code     VARCHAR(40) NOT NULL REFERENCES terpene(code),
  percent          NUMERIC(5, 2) NULL,
  CONSTRAINT uq_batch_terpene UNIQUE (product_batch_id, terpene_code)
);

-- ----------------------------------------------------------------------------
-- product_buyer_code  (buyer's own code for a supplier's product; rel-scoped)
-- ----------------------------------------------------------------------------
CREATE TABLE product_buyer_code (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES product(id),
  relationship_id UUID NOT NULL REFERENCES relationship(id),
  code            VARCHAR(60) NOT NULL,
  created_by      UUID NULL REFERENCES person(id),
  updated_by      UUID NULL REFERENCES person(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ NULL
);
CREATE UNIQUE INDEX uq_product_buyer_code_active
  ON product_buyer_code(product_id, relationship_id) WHERE deleted_at IS NULL;

-- ----------------------------------------------------------------------------
-- pricelist  (header; v0 = one standard company-wide list)
-- ----------------------------------------------------------------------------
CREATE TABLE pricelist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES company(id),
  name         VARCHAR(120) NOT NULL,
  status_code  VARCHAR(20) NOT NULL DEFAULT 'draft' REFERENCES pricelist_status(code),
  published_at TIMESTAMPTZ NULL,
  currency     CHAR(3) NOT NULL DEFAULT 'EUR',
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_by   UUID NULL REFERENCES person(id),
  updated_by   UUID NULL REFERENCES person(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ NULL,
  deleted_by   UUID NULL REFERENCES person(id)
);
CREATE INDEX idx_pricelist_company ON pricelist(company_id);

-- ----------------------------------------------------------------------------
-- pricelist_item  (rows; basic + bundle pricing — one source of truth)
-- ----------------------------------------------------------------------------
CREATE TABLE pricelist_item (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pricelist_id           UUID NOT NULL REFERENCES pricelist(id),
  product_id             UUID NOT NULL REFERENCES product(id),
  price_per_gram         NUMERIC(15, 4) NOT NULL,
  bundle_threshold_grams NUMERIC(12, 2) NULL,
  bundle_price_per_gram  NUMERIC(15, 4) NULL,
  currency               CHAR(3) NOT NULL DEFAULT 'EUR',
  metadata               JSONB NOT NULL DEFAULT '{}',
  created_by             UUID NULL REFERENCES person(id),
  updated_by             UUID NULL REFERENCES person(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at             TIMESTAMPTZ NULL,
  deleted_by             UUID NULL REFERENCES person(id)
);
CREATE UNIQUE INDEX uq_pricelist_item_product_active
  ON pricelist_item(pricelist_id, product_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_pricelist_item_pricelist ON pricelist_item(pricelist_id);
