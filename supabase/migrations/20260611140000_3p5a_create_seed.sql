-- =====================================================================
-- 3.5a Phase 0 · create-deal foundation  (Ayush, 2026-06-11)
--
--   1) audit action code `deal.created` — the first create-side
--      `writeAudit` caller (3d added the confirm-side codes).
--   2) seed Aurora Deutschland's catalogue so the create-form product
--      picker has real rows. Aurora (aaaaaaaa-…) is the SELLER on the
--      demo relationship and had only 1 product. These 4 are Aurora's OWN
--      rows from the blueprint (docs/product/blueprint/Product list —
--      Canadian Craft Info.csv, the Aurora section). Prices = the CSV
--      "Basic Price / g". Added to Aurora's existing published "Standard"
--      pricelist (3fe179d5-…). Idempotent (re-runnable; guards on the
--      per-company supplier_product_code).
-- =====================================================================

-- 1) audit action code -------------------------------------------------
INSERT INTO audit_action_type (code, description, category) VALUES
  ('deal.created', 'A draft deal card was created (manual, from chat)', 'lifecycle')
ON CONFLICT (code) DO NOTHING;

-- 2) Aurora catalogue — products --------------------------------------
INSERT INTO product (company_id, name, cultivar, supplier_product_code, local_code_pzn,
                     pack_size_grams, unit_code, thc_percent, cbd_percent, rrp_per_gram,
                     cultivator, country_of_origin, region)
SELECT v.company_id, v.name, v.cultivar, v.code, v.pzn, v.pack, 'g', v.thc, v.cbd, v.rrp,
       v.cultivator, 'Canada', v.region
FROM (VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 31/1 COS-CA',  'Cosmic Cream', 'AUR-1A', '38364843', 1000, 31, 1, 9.00, 'Aurora Inc',    'Toronto'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 31/1 PND-CA',  'Pink Diesel',  'AUR-1B', '52839467', 1000, 31, 1, 8.50, 'Aurora Inc',    'Toronto'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'San Raf 29/1 PNK',      'Pink OG Kush', 'AUR-1C', '38374774', 1000, 22, 1, 5.00, 'Pure Sunfarms', 'Montreal'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Pedanios 10/10 MBE-CA', 'Moon Berry',   'AUR-1D', '38383838',   10, 10, 10, 6.00, 'Aurora Inc',    'Toronto')
) AS v(company_id, name, cultivar, code, pzn, pack, thc, cbd, rrp, cultivator, region)
WHERE NOT EXISTS (
  SELECT 1 FROM product p
  WHERE p.company_id = v.company_id
    AND p.supplier_product_code = v.code
    AND p.deleted_at IS NULL
);

-- 2) Aurora catalogue — pricelist items (Basic Price / g from the CSV) --
INSERT INTO pricelist_item (pricelist_id, product_id, price_per_gram, currency)
SELECT '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid, p.id, v.price, 'EUR'
FROM (VALUES
  ('AUR-1A', 8.00),
  ('AUR-1B', 6.00),
  ('AUR-1C', 4.00),
  ('AUR-1D', 5.00)
) AS v(code, price)
JOIN product p
  ON p.company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
 AND p.supplier_product_code = v.code
 AND p.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM pricelist_item pi
  WHERE pi.pricelist_id = '3fe179d5-c0e7-4eff-9726-f707c04572f9'::uuid
    AND pi.product_id = p.id
    AND pi.deleted_at IS NULL
);
