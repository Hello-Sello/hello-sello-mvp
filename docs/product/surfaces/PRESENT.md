# Present

## One-sentence definition

The seller's **shop** — how a company presents its product catalog (and, later, deal-specific pitch material) to buyers.

## Status

- Depth: sketch
- Last updated: 2026-06-10
- Eventual depth: built (v0 storefront shipping — session 16)

## Who uses this surface and why

- **Seller (shop owner)** — sets up their shop (cover, logo, profile), uploads their product catalog (CSV + images) or adds products manually, and controls which products show a price vs "on request". This is the Marcel / Canadian Craft use case: build a shop on the platform to present to buyers.
- **Buyer (visitor)** — browses a seller's shop, filters the catalog, and either sees a price or clicks **Request pricing**.

## Core objects this surface owns

- **Shop** = a company's storefront: the `company` profile (name, tagline, description, cover/logo, HQ, warehouse, tags via `company_type`, links) + its products.
- **Product** (`product`) + **current batch** (`product_batch` + `batch_terpene`) — the catalog rows.
- **Price** (`pricelist_item` on one company-wide `pricelist`) — basic + bundle price/g; visibility per product via `product.price_public`.
- **(Deferred)** Deal Room — the deal-specific presentation tool, distinct from the shop.

## Core flows

1. **Set up a shop** — onboarded company → `/present` shows an **empty state** → owner edits profile + uploads cover/logo.
2. **Add products** — "Manage shop" → "Add products" drawer → **Upload CSV** (our template → validate → preview errors → atomic import) **or** Add manually; attach product images.
3. **Visitor browses** — `/present` (own) or a public shop → cover + profile cards + dominance filters + product card grid; price shown if `price_public`, else **Request pricing** → Connect inbox (`pricelist_request`).

## What this surface shares with others

- **Foundation:** User, Company, Auth, Permissions, Storage, Event stream.
- **Connect:** Request-pricing creates a `pending_inbox_item` (type `pricelist_request`) in Connect's inbox.
- **Discover:** surfaces shops/products for browse + discovery (later).
- **Sella (cross-cutting):** help write descriptions, suggest pricing, generate shop content (later).

## Open questions

- Off-template CSV uploads (sellers with their own export) — fuzzy parser parked post-v0.
- Terpene name matching drops unrecognised/misspelled names silently — surface as a preview warning? *(track-doubt.)*
- Shop-level vs per-product price-visibility default (per-product shipped; revisit if a shop-wide toggle is wanted).
- Public browsing of *another* company's shop (`/present/[companyId]`) — RLS supports it; route + entry point not built yet.

## References

- `../layers/LAYER-1-USERS-AND-CORE-OBJECTS.md` §4.4 (Deal Room — the deferred half)
- `../layers/LAYER-2-SURFACES.md` §2 (Present in the Big 7)
- `../../decisions/DECISIONS.md` (2026-06-10 — Present storefront v0)
- `../../architecture/ARCHITECTURE-NOTES.md` (Present storefront — v0)
- Build: `src/app/present/` (shop page) · `src/modules/catalog/` (template, validator, import, shop read)
