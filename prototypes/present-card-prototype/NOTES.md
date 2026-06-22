# present-card-prototype

**Throwaway prototype — FINALIZED 2026-06-21.** Phase 7 (Present Catalogue UX).
The product card on its own, locked as the visual spec for the React build. Open
`index.html` directly in a browser.

## Locked design

A flippable product card (collectible feel — subtle tilt + sheen on hover).

**FRONT — all product info** (every `product` table field):
- Photo (carousel dots) + grade badge + ♥ favourite + a "Lab data & docs" flip button.
- Name · cultivar · PZN code · country flag.
- Cannabinoid quad: **THC / CBD / CBG / CBN** (label/advertised).
- Full spec list: **Dominance · Cultivator · Origin · Region · Lineage (parent A × B) · Irradiation · Format · Packaging · Resealable · Supplier code**.
- Price: price/g + **UVP (`rrp_per_gram`) strike-through** + **bundle tier** (≥X g → Y/g); or "Price on request".
- Quantity stepper + **Add to basket**.

**BACK — lab data (variant B2):**
- Measured CoA quad (measured THC/CBD/CBG/CBN from `product_batch`).
- Batch: loss-on-drying · water activity · ready · expiry · shelf life · genetics.
- **Terpene profile** bars (`batch_terpene`).
- Documents row: COAs / Images / Videos / Other.
- Inert **Sella "Marktvergleich"** stub — *no figure shown* (R1 / Sella-neutrality).
- "Full Present page" link.

## Decisions settled

- **Flip stays** (front = sell/spec, back = lab/proof) — the field count needs both faces.
- **All product info lives on the front** (chosen over Marcel's pink-label-row layout and the Nike-style lite front — both prototyped as F1/F2/F3, rejected in favour of the comprehensive front).
- **Collectible feel** via CSS tilt + sheen, kept subtle (not gaudy).
- **Photos:** `img/p1.jpg … p3.jpg` if present → loremflickr (online) → soft gradient. Real "Canadian craft" shots to be dropped into `img/`.

## Not decided here (next, when we build the full page)

- How this card sits in the **Present page** grid (the `present-redesign-prototype/` page still shows an older/denser card — align it to this one when the page is finalized).
- **Intake**: how products + price list + batches are taken from the seller (CSV-first vs manual wizard; one batch at create vs multi-batch manager) — discussion open.
- **Send prices to a customer** seam (Present-origin vs Relationship page vs deal-card cascade) — open.
- Real product photos.

## Schema basis (verified)

`product` (name, cultivar, PZN, pack/unit, packaging, resealable, THC/CBD/CBG/CBN label, cultivator, country/region, lineage A/B, dominance, irradiation, `cogs` seller-only, `rrp_per_gram`) · `product_batch` (batch no., ready/expiry/shelf, loss-on-drying, water activity, measured cannabinoids) · `batch_terpene` (21 terpenes × %) · `product_image` (gallery) · `pricelist` + `pricelist_item` (price/g + one bundle tier; Standard list, draft/published). Source: `supabase/migrations/20260607090004_catalog.sql`.
