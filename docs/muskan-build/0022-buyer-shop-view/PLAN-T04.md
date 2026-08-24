# PLAN-T04 — Per-product request pricing; retire the shop-level CTA
slug 0022 · **HEL-58** · size S · depends on: T03 ✅ + T02 ✅ · **rev 4** · plan-checker **2 rounds, budget SPENT, did NOT converge** — r1 5 blocking + 10 notes, r2 **5 blocking (all NEW, all defects in r1's own fold-ins)** + 11 notes. All folded. **rev 4 = two defects `test-writer` found in rev 3, corrected below.**

## The criteria (verbatim from TICKETS.md)

1. When a **non-connected** buyer requests pricing on a product, the system shall create a
   `pricelist_request` inbox item carrying that product's reference in `metadata` (AC 3, as amended at G3).
2. When a **connected** buyer requests pricing on a product, the system shall create the same
   inbox item naming the product.
3. When a buyer has already asked about product A and then asks about product B, the system
   shall create a second ask — the dup-guard is per-ask **per-product**, never per-pair.
4. When this ticket completes, the shop-level Request-pricing CTA shall no longer render.

## What is already standing (read, not assumed)

| fact | evidence |
|---|---|
| The button exists and is already gated correctly | `ProductCard.tsx:820-831`, `canAsk = !editing && !viewerIsOwner && !pricePublic` (`:377`). T03 shipped it. |
| Its handler is a no-op today | `onClick={() => onRequestPricing?.(p.id)}` — `ShopView` never passes `onRequestPricing`. This is `critic` K7, filed at T03 and knowingly deferred here. |
| The shop-level CTA **already does not render** | `RequestPricingActions.tsx` has exactly one importer — itself. T02's `page.tsx` rewrite dropped it. **Criterion 4 is satisfied by deletion, not by a render change.** |
| `pending_inbox_item.metadata` is `JSONB NOT NULL DEFAULT '{}'` | `20260607090002_phase1_core.sql:203` |
| `inbox_insert` gates only on the sender | `20260607170000_rls_policies.sql:233-234` — `WITH CHECK (sender_company_id = current_company_id())`. No migration needed; **no new column, no new policy, no new type**. |
| `note` already renders to the seller | `InboxRow.tsx:29` (preview) and `InboxDetail.tsx:109-113` (blockquote). |
| `actions.ts` is `"use server"` and may export only types + async functions | verified across every such file in `src/`. **Correction (checker N7): `companies.ts` is NOT one of them** — it has no `"use server"` directive; line 14 is a *comment* mentioning the phrase, which a `grep -rl` matches. It is a plain module exporting sync helpers. So the constraint forces the helper out of `actions.ts`, it does not by itself force a NEW file — see D7. |

## Design decisions

### D1 · The handler lives in `ShopView`, exactly where `handleAddToBasket` lives — NOT in `BuyerShopView`

The ticket's Files list says `BuyerShopView.tsx (handler wiring)`. **It cannot.** `BuyerShopView`
does not render `ProductCard` — `ShopView` does (`ShopView.tsx:674-689`). Reaching the card from
`BuyerShopView` needs a new handler prop on `ShopView`, and ADR-0005 §1 is explicit: *"`ShopView`
gains no behaviour prop."*

The precedent is sitting in the same file. `onAddToBasket` is **not** a prop threaded from the
page — `ShopView` owns `handleAddToBasket` itself (`:572-581`), calls the server action directly,
and the comment above it says why: *"Available to every viewer, owner or buyer — not owner-only
chrome."* Request-pricing is the same shape, and is even self-gating: `canAsk` requires
`!viewerIsOwner`, so on `/present` (`viewerCanManage` true) the button never renders and the
handler is unreachable.

`ShopView` importing a route-level action is also already the idiom — it imports
`saveCompanyProfile` from `@/app/account/actions` (`:43`).

> **DEVIATION, declared not reinterpreted (L-017):** the Files list is wrong about which file
> carries the wiring. `BuyerShopView.tsx` is **not touched**; `ShopView.tsx` gains one function
> and one prop pass at the call site. Muskan adjudicates at G4.

### D2 · Authorization and the product name come through the ONE read door

The action must answer two things: *may this buyer ask about this product*, and *what is the
product called*. Both come from `getDiscoverableShop(receiverCompanyId)` — the same RPC that
rendered the card.

- It is `SECURITY DEFINER` and applies the seller's own visibility rules, so "the product is in
  the buyer's discoverable shop" **is** the permission answer. A product id the buyer cannot see
  is refused.
- The name is resolved **server-side from that read**, never taken from the client. A crafted call
  cannot put an arbitrary string in front of the seller.
- **The real reason, stated plainly (checker N1 — rev 2 stretched a fence).** `ARCHITECTURE-NOTES.md:421-423`
  is scoped to **prices**; a direct `.from("product")` read is not "a parallel *price* reader", so
  that rule does not by itself forbid one. What forbids it is correctness: the card's data never
  came through the buyer's own `product` RLS, and pre-T06 that RLS does not yet carry the connection
  arm — so a direct read would answer a *different* question than the one that put the card on
  screen. Authorizing through the same `SECURITY DEFINER` RPC that rendered it is the only way the
  two agree.
- **Cost, named (checker N6):** resolving one name reads the whole catalogue — `get_discoverable_shop`
  returns every visible product with its image JSON and tier array (`20260816190000:118-147`) and
  `mapDiscoverShopRow` maps all of them. O(catalogue) per button click, on a page that just rendered
  the same data. Accepted: correctness through one door beats a narrower second door.

### D3 · `metadata` carries the reference; `note` carries the name

- `metadata: { product_id: <uuid> }` — criterion 1's literal requirement, and the dup-guard key.
- `note: 'Pricing request for "<product name>".'` — generated, clamped by the same 280 rule as every
  other note. This is what makes criterion 2's *"naming the product"* true **to the seller's eye**:
  `note` already renders in both inbox surfaces. A `metadata` key alone renders nowhere, so the
  criterion would be met on paper and failed in the product.
- No inbox UI changes. `REQUEST_TYPE_META.pricelist_request` already exists; the `REQUEST_TYPE_BLURB`
  fallback is unreachable for these items because `note` is always set.

### D4 · The dup-guard becomes per-product for pricing, unchanged for connect

`createPairInboxItem`'s guard currently keys on `(sender, receiver, status, type-group)`
(`actions.ts:40-51`). Criterion 3 needs one more key for pricing asks:
`.filter("metadata->>product_id", "eq", productId)`.

The connect arm must be **structurally unchanged** — it has no product and must keep swallowing a
second connect ask. This is not the banned "keeps behavior" claim (checker N2): the change is a
*conditionally appended* `.filter()`, so when `productId` is undefined the emitted query is the same
query. It is inspectable in the diff, and criterion 3's E2E below fails loudly if the guard is
mis-keyed in either direction.

**Why legacy rows correctly do NOT match (checker Q3 — reasoned from Postgres, recorded here because
the whole of criterion 3 rests on it).** PostgREST renders `metadata->>product_id=eq.<uuid>` as
`(metadata ->> 'product_id') = '<uuid>'`. `metadata` is `JSONB NOT NULL DEFAULT '{}'`, so for a
legacy shop-level row the left operand is `'{}'::jsonb ->> 'product_id'` = **NULL**, and
`NULL = '<uuid>'` evaluates to **NULL**, which a `WHERE` clause does not admit. The row is excluded —
exactly what criterion 3 needs. Nothing is wrongly excluded either: rows this code writes carry
`{"product_id":"<uuid>"}`, `->>` returns canonical lowercase uuid text, and the client passes back
the same string `get_discoverable_shop` gave it — a byte-identical text comparison. UUIDs contain no
PostgREST reserved characters, so no quoting is needed.

### D5 · Retire means delete, both halves

`RequestPricingActions.tsx` is deleted. So is the `requestPricing` server action — once its only
caller is gone it is a **live, exported, reachable public endpoint** with no UI behind it (Server
Actions are reachable without page navigation; the file's own comment at `:75-78` says so). Leaving
it is the dead-endpoint half of the DEV-88 class. Nothing else imports it (grepped).

### The behaviour changes this ticket makes, named (checker N3 — "keeps behavior" is banned)

1. **The buyer loses the free-text note.** `RequestPricingActions.tsx:51-58` offered a 280-char
   textarea; the per-product ask sends a generated note instead. Deliberate: the ask is now one
   click on a card, and D2 requires the seller-visible text be server-authored.
2. **`DiscoverableCompany.pricingRequested` changes meaning** (`companies.ts:97`, mapped `:179`,
   computed `20260820090000_discoverable_company_shop_chrome.sql:96`) — from *"used the shop CTA"*
   to *"has any per-product ask pending"*. It has no UI consumer today, so nothing renders
   differently; this is a **semantic** change, not dead code. Noted for T08.
3. **The dup-guard ceiling on pending pricing asks is removed** — see D8, which is where the blast
   radius of that lands.
### D6 · The buyer must see that the ask landed — proven by E2E only

T02's G4 established the standard: a control that renders and does nothing is a defect, and
`critic` K7 filed this exact button at T03 as *"known and accepted between T02 and T04"*. Wiring a
handler that produces no visible change would leave K7 open under a different description.

Feedback is the card's own local sent state — the same shape `flipped`, `qty`, `pack` and
`pricesOpen` already use in `ProductCard`. The button swaps to a non-interactive "Pricing
requested" confirmation. No new prop, no new component, no toast primitive (there is none in
`src/shared/ui/` — inventing one is a new pattern `consistency` would rightly flag).

`onRequestPricing`'s type widens from `=> void` to `=> void | Promise<{ ok: true } | { error: string }>`
so the card can distinguish landed from failed. Existing callers: none (grepped — the sole call site
is `ProductCard.tsx:825`, and no test passes the prop). T03's docstring — *"The card only reports the
intent; the handler lives with the caller"* — stays true: the card still owns no write.

> **⚠️ rev 1 planned three unit assertions for this in `ProductCard.gate.test.tsx`. They are
> unwritable and have been REMOVED (checker B1, verified).** `vitest.config.ts:34` is
> `environment: "node"` and `package.json` carries no `jsdom`, no `happy-dom` and no
> `@testing-library` (grepped: zero matches). Every ProductCard suite renders through
> `renderToStaticMarkup` — an HTML **string**: no DOM, no click, no re-render. The file says so
> itself at `:19-21` — *"no jsdom, initial paint only — `pricesOpen` etc. are local state and out of
> scope here."* `asked` is that same class. Adding a DOM environment is a real dependency decision
> and does not belong inside an S ticket. **D6 is therefore proven by E2E alone**, and the plan says
> so rather than shipping three tests that can never go green (the exact L-017 failure mode).

### D7 · Where the pure builders live (checker N7)

`actions.ts` is `"use server"`, so a sync helper cannot be exported from it — that is real. But it
does not follow that a **new** file is the answer, and `companies.ts` (same directory, plain module,
already exports `mapDiscoverShopRow` / `toShopCompany` / `mapDiscoverCompanyRow`) is a live
alternative.

Chosen: a small dedicated `pricingRequest.ts`. `companies.ts` is the Discover **read** module —
mapping RPC rows into view models. A note/metadata builder for an outbound *write* is a different
subject, and folding it in would make that module about two things. The cost is one file holding a
constant and two one-liners; the benefit is that the seller-facing note format — a contract, not an
implementation detail — has one named owner and one test file. **Flagged for `consistency` at
review rather than assumed.**

### D8 · Blast radius: this ticket makes DEV-83 the default path (checker B5)

**Named, not fixed here.** Today the guard permits at most one pending `pricelist_request` per
company pair. D4 removes that ceiling: N products ⇒ N pending rows. Trace a seller accepting two:

1. `src/modules/connect/supabase/inbox.ts:283` → `acceptInbox({ inboxItemId, requestType: 'pricelist_request', … })`
2. `src/modules/messaging/supabase/store.ts:535-539` — idempotency keys on **`inbox_item_id`**, not
   on the pair. A second, different inbox item finds nothing and falls through to the INSERT.
3. `20260607090003_phase2_deal.sql:33-34` —
   `CREATE UNIQUE INDEX uq_relationship_pair_active ON relationship(company_a_id, company_b_id) WHERE deleted_at IS NULL`
   → `23505`, and `store.ts:585` does `if (relErr) throw relErr;`. Unhandled throw in the seller's
   inbox; the item stays `pending` (only Decline clears it).

**This is already filed as DEV-83** ("accept-from-already-connected crash", project `CLAUDE.md` →
*"sits in `messaging/store.ts` rollout"*). It is reachable today — a pending `connect` and a pending
`pricelist_request` may already coexist by design (`actions.ts:15-18` says so explicitly) — so T04
does not create it. What T04 does is **promote it from a two-different-CTAs edge case into the
ordinary path**: a buyer clicking Request-pricing on two cards is Marcel's demo shape.

**Disposition proposed, for Muskan at G4:** accept as a known limitation for this ticket, and fix it
in DEV-83's own change. The remedy is small and known — before the INSERT in `acceptInbox`, look up
an existing active relationship *for the pair* and adopt it (returning its id + threads) instead of
inserting, which is the correct semantic anyway since `relationship` is per-pair by construction.
It is not built here because it lives in another module, has its own ticket, and would take an S
ticket into shared-write territory. **If Muskan would rather close it now, the source change is
roughly six lines — but checker N10 is right that its TEST cost is uncosted, so do not read "six
lines" as "ready to ship".**

*Round 2 verified this whole trace independently and found nothing to correct — recorded so G4 does
not re-litigate it.*
## Files

| file | change | in ticket's list? |
|---|---|---|
| `src/app/discover/pricingRequest.ts` | **new** — note + metadata builders, the metadata key constant | ➕ D7 |
| `src/app/discover/pricingRequest.test.ts` | **new** — unit contract for the builders | ➕ D7 |
| `src/app/discover/actions.ts` | `requestProductPricing` added; `requestPricing` deleted; `createPairInboxItem` gains the optional per-product guard key + metadata | ✅ |
| `src/app/discover/[companyId]/RequestPricingActions.tsx` | **deleted** | ✅ |
| `src/app/present/ShopView.tsx` | `handleRequestPricing` + the call-site pass | ➕ D1 (replaces `BuyerShopView.tsx`, which is **not touched**) |
| `src/modules/catalog/components/ProductCard.tsx` | local `asked` state; handler return type widened | ➕ D6 |
| `supabase/seed/seed.sql` | **AUR-1F** — a second `profile_visible=true, price_public=false` product | ➕ B2 |
| `e2e/discover-shop.spec.ts` | three round-trip guards | ➕ (checker N3 — rev 2 wrongly marked this ✅) |
| `e2e/fixtures/two-company.ts` | two exported SQL readers — `countPricingRequests` (the row exists) and `pricingRequestNote` (what it says) — joining the existing `countX` family | ➕ (see Test surface) |

### Declared deviations — every one for Muskan at G4 (L-017)

| # | deviation | why |
|---|---|---|
| 1 | `ShopView.tsx` carries the wiring, **not** `BuyerShopView.tsx` | D1 — the ticket's Files list is not buildable |
| 2 | `ProductCard.tsx` touched | D6 — a control with no feedback is the T02 G4 defect |
| 3 | `pricingRequest.ts` + its test are new files | D7 |
| 4 | `seed.sql` gains AUR-1F | criterion 3 is untestable without a product B |
| 5 | `e2e/fixtures/two-company.ts` — a **shared** file | the SQL counter belongs with the existing `countX` family, not duplicated |
| 6 | **ADR-0005 §6** writes `onRequestPricing` as `=> void`; D6 widens it | checker N5, round 1 |
| 7 | **ADR-0005 §6:575-577** — *"`ShopView` still gets none beyond the stale-comment fix in §1"* | checker N2, round 2. D1 adds a function + a call-site pass to `ShopView`. rev 2 cited only §1 and showed Muskan one ADR deviation where there are two. |

## Signatures

```ts
// src/app/discover/pricingRequest.ts  (plain module — NOT "use server")
export const PRODUCT_ID_KEY = "product_id";
export function buildPricingRequestNote(productName: string): string;
export function buildPricingRequestMetadata(productId: string): { product_id: string };

// src/app/discover/actions.ts
async function createPairInboxItem(
  type: PairInboxType,
  receiverCompanyId: string,
  note: string,
  productId?: string,          // NEW — guard key + metadata; undefined = today's behaviour
): Promise<{ ok: true } | { error: string }>;

export async function requestProductPricing(
  receiverCompanyId: string,
  productId: string,
): Promise<{ ok: true } | { error: string }>;

// src/modules/catalog/components/ProductCard.tsx
onRequestPricing?: (productId: string) => void | Promise<{ ok: true } | { error: string }>;

// e2e/fixtures/two-company.ts
export function countPricingRequests(senderCompanyName: string, productCode: string): number;
export function pricingRequestNote(senderCompanyName: string, productCode: string): string | null;
```

## Steps, in runnable order

1. **`pricingRequest.ts`** — the two builders + the key. Note format: `Pricing request for "<name>".`
   The name is clamped so the whole note stays inside 280 (the cap `createPairInboxItem:53-55`
   already applies server-side).
2. **`seed.sql`** — add **AUR-1F**: `name = 'Zephyr 24/1 ZPH-CA'`, `cultivar = 'Zephyr Haze'`,
   `profile_visible=true`, `price_public=false`,
   location **`'Toronto Warehouse'` — a fence, not a preference** (see the dependents check), with a
   live `pricelist_item` price row mirroring AUR-1A. Idempotent, in the style of the rows beside it.
3. **`actions.ts`** — `createPairInboxItem` gains `productId?`:
   - guard: when `productId` is set, append `.filter("metadata->>product_id", "eq", productId)`;
     when unset the query is unchanged.
   - insert: `metadata: buildPricingRequestMetadata(productId)` when set, **key omitted entirely
     otherwise — never `null`** (checker N1 r1: `metadata` is `NOT NULL`; an explicit `null` would
     `23502` on *every connect request*, and `JSON.stringify` drops `undefined` keys, so omission
     correctly falls through to the `'{}'` default).
4. **`requestProductPricing`** — `requireVerified()` → `getDiscoverableShop(receiverCompanyId)` →
   find `productId` → not found ⇒ refuse → `createPairInboxItem("pricelist_request",
   receiverCompanyId, buildPricingRequestNote(name), productId)`.
   Checker N6 r1: `getDiscoverableShop` swallows RPC errors (`companies.ts:340` returns `[]`), so a
   transient fault is indistinguishable from a real denial. **Accepted, and worded for it** — the
   refusal reads *"We couldn't confirm that product is available from this shop. Try again."*, honest
   under both causes. Distinguishing them means changing that function's return contract — T05's
   file, not this ticket's.
5. **Delete** `requestPricing` and `RequestPricingActions.tsx`.
6. **`ShopView`** — `handleRequestPricing(productId)` returning the action's result, wired at the
   card call site beside `onAddToBasket`.
7. **`ProductCard`** — `asked` local state; on `{ ok: true }` render the confirmation in the button's
   slot; on `{ error }` keep the button clickable and surface the message inline.
8. **`two-company.ts`** — `countPricingRequests`, reusing the file's private `psqlBin()`.
9. Run the gate.

## Test surface

**Unit — `pricingRequest.test.ts` (new):** the note names the product · a quote in the name does not
break it · a very long name still yields ≤ 280 chars · the metadata key is exactly `product_id`.

**No new `ProductCard.gate.test.tsx` assertions** — see D6's box (no DOM environment exists).

### The E2E assert the ROW, via SQL — not the inbox UI

**Round 2's B2/B3 killed rev 2's design and this replaces it.** rev 2 had the buyer click, then
*sign in as the seller* and count rows in her inbox. That is not executable: `proxy.ts:77-82`
redirects a signed-in user away from `/login`, and there is **no sign-out helper anywhere in
`e2e/`** — so the identity switch hangs. It was also unsound: `playwright.config.ts:19,26` runs one
worker against one DB, so an earlier test's request lands in the same inbox and a bare count reads
high.

The repo already has the right tool. `e2e/chat-phase7.spec.ts:99-101` runs `psql` as superuser for
*"the assertions a tenant-scoped client can NOT see"*, and `e2e/fixtures/two-company.ts` exports a
whole `countX()` family built on it. Asserting the row directly dissolves B2, B3 and N7 together,
and is **strictly stronger** — it can see `metadata->>'product_id'`, which no inbox screen renders.

| # | proves | identity | shape |
|---|---|---|---|
| 1 | the wire is live (criterion 4's replacement works) | Bob (connected, `seed.sql:308-323`) | click Request-pricing on **AUR-1A** → the confirmation appears. **Red today** — the click is a no-op. |
| 2 | criterion **2** — a connected buyer's ask lands, naming the product | Bob | after the click, `countPricingRequests('StonePharm','AUR-1A') === 1`, and the row's `note` contains **`Pedanios 31/1 COS-CA`**. |
| 3 | criteria **1 + 3** — a **non-connected** buyer's ask carries `metadata`, and the guard is per-product | **Eva** (`eva@bavaria.test`, Bavaria Medical Cannabis — verified `seed.sql:282-285`, **not** connected; only a pending `connect` at `seed.sql:371`) | ask on AUR-1A → **reload** → ask again → still `=== 1`. Then ask on **AUR-1F** → `countPricingRequests('Bavaria Medical Cannabis GmbH','AUR-1F') === 1`. Two rows, one per product. |

**Why test 3 reloads (checker B1).** rev 2 said "ask twice" while D6 says the button is replaced by a
non-interactive confirmation — there is nothing to click again. `asked` is local state and no
server field re-derives it, so a reload restores the button. This is not a workaround: the dup-guard
is **server-side**, and a reload is precisely how you prove the server refuses the second ask rather
than the client hiding it.

**Why test 3 carries criterion 1 (checker B4).** rev 2 proved `metadata` only under Bob, who is
*connected* — leaving criterion 1, which is scoped to a non-connected buyer, asserted by nothing.
Moving the dup-guard proof onto Eva gives every criterion a row-level test under the identity it
names. The counts are scoped by **sender company AND product code**, so no other test in the file
can move them.

**What each count can and cannot prove (checker N8).** `createPairInboxItem` returns `{ok:true}`
*without inserting* when the guard hits (`actions.ts:51`), so "the confirmation appeared" proves the
action resolved, not that a row exists. Test 1 is a render guard only; tests 2 and 3 are the write
proofs.

**Not tested here:** the seller-side inbox rendering (existing shipped UI over an existing column —
asserting it would be asserting `InboxRow.tsx`). Criterion 4 has no regression guard because
deletion is stronger than a test, though nothing prevents a shop-level CTA returning later
(checker N9 r1).

### Seed dependents check for AUR-1F — corrected and completed (L-005)

> **rev 2's reasoning here was wrong even though its conclusion held (checker B5).** It claimed
> `.first()` is safe because `shop.ts:183` orders by `name`. **Rendered order is not global name
> order.** `ShopView.tsx:524-548` runs `groupByLocation(filterByLocation(…))`, and
> `locationFilter.ts:37-53` emits named locations in **first-seen order with `Unassigned` last** — so
> with the seed matrix the first group is *Montreal* and `.first()` is **AUR-1D**, not AUR-1A. The
> correct rule: a **Toronto** product named *Zephyr Haze* appends to the tail of the **last** named
> group, so it cannot become `.first()` under any grouping.

| depends on | verdict |
|---|---|
| `seed_visibility_matrix_test.sql:96-99` (block 2) | **safe, explicitly** — its own comment: *"it cannot detect a SIXTH product coexisting."* |
| `seed_visibility_matrix_test.sql:136-140` (block 3) | ⚠️ **THE LIVE FENCE, missed by rev 2** — asserts `count(DISTINCT location) = 2` across **all** GreenLeaf products. AUR-1F **must** reuse an existing location. Toronto. A new location name, or NULL (which also adds an "Unassigned" group — `seed.sql:416` warns about exactly that), fails this. |
| `seed_visibility_matrix_test.sql` blocks 1, 4, 5 | **safe** — all scoped to the literal list `AUR-1A..1E`. |
| `cross_tenant_lockdown_test.sql:110-116,134` | **safe** — calls `get_discoverable_shop` on GreenLeaf but asserts `= 0` relative / fixture-id-scoped. (Missed by rev 2's sweep.) |
| `pricelist_item_tier_test.sql:351` | **safe** — same, fixture-id-scoped. (Missed by rev 2's sweep.) |
| `e2e/present-grid.spec.ts:50,61` · `present-manage.spec.ts:81-83` | **safe** — counts are relative, read at runtime. |
| `e2e/present-card-edit.spec.ts` (`.first()` ×4) | **safe** — by group order, per the correction above. |
| `e2e/discover-shop.spec.ts` | **safe** — `.first()` + `filter({ hasText })`, no counts. |
| T00's 2×2 matrix meaning | **untouched** — AUR-1F is a sixth row, not a reassignment of a corner. |

**One consequence to state (checker N11):** the buyer page now renders **two** `request-pricing`
buttons, so any unqualified `getByTestId("request-pricing")` becomes ambiguous. T02's existing test
scopes by product name (`discover-shop.spec.ts:117`) and is safe; new tests must do the same.

## Fences

- `ShopView` gains **no prop** (ADR-0005 §1). One internal function, one call-site pass.
- AUR-1F uses **`'Toronto Warehouse'`** — `count(DISTINCT location) = 2` is asserted.
- No migration, no RLS change, no new inbox type, no new component.
- **Deferred, must NOT be built:** the chat-thread arm for connected buyers (rev 6 collapsed both
  arms into one mechanism), any shop-level pricing CTA, and DEV-83's fix (D8 — named, not built).

## Two defects `test-writer` found in rev 3 (corrected above, recorded here)

1. **rev 3 said the note would contain *"Cosmic Cream"*. Wrong field.** `seed.sql:391` puts
   *Cosmic Cream* in **`cultivar`**; AUR-1A's `name` is `Pedanios 31/1 COS-CA`, and
   `mapDiscoverShopRow` (`companies.ts:292`) keeps the two separate. D3 builds the note from the
   product's `name`, which is also what the shipped `aria-label` uses (`ProductCard.tsx:824`).
   Asserting *Cosmic Cream* would have been permanently red against a correct implementation — the
   very failure D6's box warns about. `test-writer` refused the instruction and flagged it instead
   of copying it (L-001's disposition, applied to a spec rather than an agent).
   *Both fields do render:* `ProductCard.tsx:541` is the `name` headline, `:543` the `cultivar`
   subtitle — so an e2e locator may scope by either, but the **note** names the product's `name`.
2. **AUR-1F needed an explicit `name`/`cultivar` split, which rev 3 left as a single string.**
   `name` is what sorts (`shop.ts:183`) and what the note carries; `cultivar` is what a reader
   recognises. `'Zephyr 24/1 ZPH-CA'` / `'Zephyr Haze'` follows the seed's own brand-code
   convention **and** keeps the row sorting last — the ordering property the dependents check
   depends on. A name like `'Pedanios 28/1 ZPH-CA'` would have sorted *before* AUR-1A and moved
   `.first()`.

**Orchestrator edit to the test files (declared):** `test-writer` left a private `psqlBin()`, a
`DB_URL` and a second query helper inside `discover-shop.spec.ts`, duplicating plumbing
`e2e/fixtures/two-company.ts` already owns. `pricingRequestNote` was moved into that module beside
`countPricingRequests` and the spec now imports both — one home for the SQL, no duplicated psql
lookup. (`chat-phase7.spec.ts` does keep its own copy, which is the precedent `test-writer` cited;
the difference is that this ticket is *already* adding an exported reader to the fixtures module, so
a second one belongs beside it rather than in the spec.)

## For `consistency` at review — two patterns with no local precedent

1. `pricingRequest.ts` as a separate module rather than folding into `companies.ts` (D7).
2. `.filter("metadata->>product_id", "eq", …)` — **zero** PostgREST JSON-path filters exist anywhere
   in `src/` today. It compiles without a cast (`postgrest-js` carries an untyped `filter()`
   overload, lockfile 2.107.0 — checker N5 r2 verified this is *not* a compile trap), but it is a
   first for this tree.
