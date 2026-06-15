-- Slice 6 · P11 — demo seed: give a verified company a public catalogue so the
-- Discover profile demonstrably shows L1 + L2 (and the Request-pricing path for a
-- not-yet-connected viewer). Records the demo state that was applied ad-hoc during
-- P8 verification, so it survives a rebuild and isn't drift.
--
-- Idempotent: targets Aurora by her fixed demo id + products by their stable demo
-- names. Re-running sets the same values. Other companies stay default-hidden.
-- ----------------------------------------------------------------------------

-- San Raf 29/1 PNK -> L2 (visible, price public)
update public.product
   set profile_visible = true, price_public = true
 where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and name = 'San Raf 29/1 PNK'
   and deleted_at is null;

-- Superseed T30 CK CTY -> L1 (visible, price on request)
update public.product
   set profile_visible = true, price_public = false
 where company_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   and name = 'Superseed T30 CK CTY'
   and deleted_at is null;
