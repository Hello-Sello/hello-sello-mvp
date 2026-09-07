-- Persisted seller-set display order for products in their own shop grid
-- (DEV-167). Same shape as product_image.position / product_media.position —
-- integer position, renumbered across the affected group on every reorder.
-- Default 0 for every row: an untouched product ties with every other
-- untouched product, and getMyShop()'s query falls through to its name/id
-- tiebreakers — nothing resorts until a seller actually drags something.
alter table public.product
  add column shelf_position smallint not null default 0;
