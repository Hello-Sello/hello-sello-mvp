---
status: draft
---

# Product Basket — buyer + seller, feeding Ayush's Deal Card

## Context

Builds the "Product Basket" layer (docs/architecture/CONTEXT.md) for the demo: a real,
persistent, per-person cart. A seller adds their own products; a buyer adds another connected
company's products. Grouped by seller company. On Send (per seller-group), a Deal Basket is
built and handed to the existing `createDeal()` — which is entirely Ayush's, unchanged. Our
work stops at the moment Send fires; everything after (deal stages, confirmation, pricing
negotiation) is his.

Vocabulary (see CONTEXT.md for full definitions): **Product Basket** (persistent cart,
nicknamed "the cart") → **Deal Basket** (transient, internal, built only at Send) → **Deal
Card** (Ayush's object, born by `createDeal`).

## Module boundary

New module: `src/modules/basket/` (types, schema-facing reads/writes, UI components), following
the same "own module, one public barrel" pattern as `deals/`, `messaging/`, `relationship/`. Its
ONLY dependency on the deals module is importing `createDeal`, `CreateDealInput`,
`DraftLineInput`, `DealSource` from `@/modules/deals` (already public, `deals/index.ts:75`). It
never touches `deal_card`/`deal_line_item` tables directly. If Ayush changes the Deal Card's
internals later, only that one import boundary is at risk — not our schema or UI.

## Schema (new, additive migration)

```sql
create table product_basket_line (
  id uuid primary key default gen_random_uuid(),
  owner_person_id uuid not null references person(id) on delete cascade,
  product_id uuid not null references product(id) on delete cascade,
  pack_count numeric not null default 1,   -- how many of the selected pack (the stepper)
  pack_size_grams numeric,                 -- snapshot of the selected pack-size bubble
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_person_id, product_id)     -- re-adding bumps pack_count, no dupes
);

alter table product_basket_line enable row level security;

create policy basket_line_owner_all on product_basket_line
  for all
  using (owner_person_id = auth.uid())
  with check (owner_person_id = auth.uid());
```

Total grams for a Deal Basket line = `pack_count * pack_size_grams`, computed only at Send time
(matches the documented "Pack (basket quantity)" rule — money math stays per-gram, unchanged).
No parent basket row, no seller_company_id column (derived by joining `product.company_id`), no
per-line note (typed fresh before Send, passed straight to `createDeal`'s `note` param).

**Owner = person** (private cart; a sent Deal Card is still company-wide visible afterward, same
as today — only the in-progress Product Basket is private to the person building it).

## Reads / writes (`src/modules/basket/`)

- `getMyBasket(): BasketView` — groups the viewer's lines by seller company (`{ sellerCompanyId,
  sellerCompanyName, isOwnCompany, lines }[]`).
- `addToBasket(productId, packCount, packSizeGrams)` — upsert.
- `updateBasketLinePackCount(lineId, packCount)`, `removeBasketLine(lineId)`.
- `sendBasketGroup(sellerCompanyId, { relationshipId, counterpartyPersonId?, note })` — maps
  that group's lines into `DraftLineInput[]` (computing grams), calls `createDeal`, deletes
  those lines from `product_basket_line` on success.

## Send behavior, per seller-group in the drawer

- **Group = someone else's company:** one click. `relationshipId` resolved from
  `getMyConnections()` (only reachable for companies you're connected to — same gate that lets
  you view their shop at all). `createDeal({ relationshipId, lines, note, dealType: 'order' })`.
- **Group = your own company:** opens a recipient picker (`getMyConnections()` — pick a
  connected company, optionally a person). `createDeal({ relationshipId, lines, note,
  counterpartyPersonId })` — `dealType` stays `'offer'`.

**Small additive change to `src/modules/deals`:** `CreateDealInput` gains two optional fields —
`dealType` (default `'offer'`, so the buyer path can pass `'order'`) and
`counterpartyPersonId` (threaded into `create_deal_draft`'s existing `p_counterparty_person_id`
param, which no current call site uses). Every existing call site is unaffected. Shared file —
sync ritual runs before this edit.

## UI

- Global basket icon in `TopBar.tsx`, beside the existing (inert) bell — badge = total line
  count, opens `BasketDrawer`.
- `BasketDrawer` — accordion per seller-company group (visual language from the finalized
  `prototypes/deal-basket-prototype/index.html`): product rows with the same stepper as
  `ProductCard`, one note field + one Send control per group.
- `ShopView` gains a `readOnly` mode for viewing another company's shop: same grid, same
  `ProductCard`, edit affordances off, `onAddToBasket` wired to `addToBasket`. New read
  (mirrors `ShopView`'s full product shape, not the narrower `DiscoverProduct` from
  `get_discoverable_shop`), gated to connected companies only.

## Edge cases

- Not connected to a shop you're trying to view → route unreachable (same gate Discover
  already enforces); no basket-layer handling needed.
- No batch chosen → fine, already a supported/tested case (Phase 17 decision).
- Price-less product → `unitPrice: null`, `createDeal`'s `sumValueNet` already skips it.
- Product deleted while in someone's basket → `on delete cascade` quietly drops the line.

## Testing

- Unit: basket-grouping (lines → per-seller groups), pack_count × pack_size_grams → grams
  conversion, `dealType`/`counterpartyPersonId` passthrough in `createDeal`'s line-mapping.
- RLS: a person cannot read/write another person's `product_basket_line` rows.
- Manual: add products from your own shop AND a connected company's shop into one basket,
  confirm two groups, send each, confirm both real deal cards appear (one `offer`, one `order`).

## Out of scope (Phase 17 proper)

Seller-owned pricing negotiation UI (handled post-birth by the existing deal-card edit flow),
"Coming soon" pre-sell, Deal Room media reuse, per-line batch selection inside the basket.
