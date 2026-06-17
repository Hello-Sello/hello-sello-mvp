# 7 - Deal Card & Form overhaul: the authoritative build map

> Source of truth for the "DealCard plus" milestone. Locked in the 2026-06-17 grill-with-docs
> session (the long card/form discussion, grounded against the live code + DB). Supersedes the
> tiny "Phase 3 = Card Note" scope and pulls the parked margin work (T5b) into v1.
> Read this FIRST when resuming. Then `/gsd:plan-phase 3a`.

---

## 0. What changed and why (the one-paragraph story)

We set out to add a small "card Note" (Phase 3). Stepping back, we found the deal **card** and the
**edit form** are the centre of the whole product, and several things were confused, dormant, or
wrong. So we widened Phase 3 into a proper **Deal Card & Form** milestone, built **properly** (real
backend + data, nothing hardcoded). The card/form becomes the final article; later only the *visual*
arrangement changes (a box moves), with no backend churn.

---

## 1. Vocabulary (locked / sharpened 2026-06-17)

- **Note (card)** = an optional, per-company content note shown ON the card face for the other side.
  It is **HELD** - a change to it goes through Accept/Decline like any shared term (reversed from the
  earlier "immediate" guess). Each company authors its OWN note; you edit only yours; the other side
  can Accept or Decline your note change but cannot rewrite it; a Decline discards it (the note stays
  as it was). Distinct from a Change reason. Reuses the existing edit-form note textarea as its input;
  on first creation it shows on the card (NOT in the log).
- **Change reason** = the required reason on every Accept/Decline (Phases 1-2, built). Stored in
  `deal_change_input.note` + the log. NOT a card note. (The edit-form note box is NOT this - the reason
  is collected by the strip's Send pop-up.)
- **Margin (card)** = a **per-product**, per-side, **private** ("only you") number, shown as a
  **percentage** on the card, computed from the side's own price vs the shared price. NOT the raw price.
- **Private price (per side)** = the side's own input that feeds the margin: the **seller's cost**
  (COGS) and the **buyer's resale** (price to patient). Owner-only.
- **Batch (product_batch)** = one lab-tested lot of a product, carrying the **measured** cannabinoids
  (vs the product's label values). A deal line should belong to a specific batch.
- **The unifying rule (load-bearing):** *shown on the shared card (both see it) -> HELD (both confirm
  a change); private to the owner -> IMMEDIATE (own-side, ungated).*

---

## 2. The card model (what lives on it, sorted by the rule)

| On the card | Who edits | Who sees | Held / immediate / derived |
|---|---|---|---|
| Line items (product, qty, unit, price) | either side | both | **Held** |
| Terms (delivery date, payment terms, free delivery) | either side | both | **Held** |
| **Note (card)** | each side, own | both | **Held** (new) |
| Value net, value gross | nobody (computed) | both | derived from lines |
| **Margin %** (per side) | owner enters price | owner only | **Immediate** input -> computed % |
| Batch number + measured THC/CBD (per line) | via batch pick | both | snapshot at deal time |
| SIGNALS (card back) | nobody (Sella) | **per-company** | read-only insight |

**Flexible display is the principle, not a feature to build now.** The display is data-driven; which
fields show is a choice. For now we show the agreed set (incl. batch number + measured THC/CBD); a
configurable "pick what shows" panel is a future nicety - noted, not built.

---

## 3. The form vision (Amazon-style, built properly; visual polish -> UI phase)

The edit form is the centrepiece. It must feel like a real product form, not a rough box:

- **Top section = a product browser.** Browse products; later each product is **clickable -> a
  product card** (a shared entity, ~1 week out). For now: product + its key info inline.
- **Product is chosen via its batch.** Either pick the batch then the product, or the product with a
  batch-number dropdown. Picking a batch fills the measured detail (snapshot onto the line).
- **Re-clicking a product increments its quantity** (Amazon/Zalando), NOT a duplicate row (FORM-01).
- **Add a custom product** not in the catalogue (manual name + unit + price; detail optional) (FORM-02).
- **Per-line private price + margin %** ("only you"), replacing today's single mislabeled box (MRGN-01).
- **Terms** (delivery, payment, free delivery) + the **Note** sit below.
- **Editable, decent.** This phase gets the DATA + BEHAVIOUR right; the *visual* arrangement is the
  later UI phase ("the information is here so I just arrange it").

---

## 4. The margin model (formulas + the tables we already have)

**Formulas (locked), per product line, the shared `unit_price` is the pivot:**
- **Seller margin** = selling price to the pharmacy (`unit_price`) - buying price from supplier (cost).
  As %: `(unit_price - cost) / unit_price`.
- **Buyer margin** = price to patient (resale) - selling price from supplier (`unit_price`).
  As %: `(resale - unit_price) / resale`.
- **Per product**, then a **deal-level average**. Shown as **percentage**, one box per side, "only you".
- Rule: store the **input** (cost / resale), **compute** the margin (no stored derived margin needed,
  though `deal_line_item_private.seller_margin/buyer_metric` columns exist if we choose to store it).

**The home already exists (just unused):**
- `deal_line_item_private` - per-line, per-company, **owner-only RLS** (`dli_private_all`), columns
  `seller_margin` + `buyer_metric`. THE per-product private store. (0 rows; only in types.)
- `product_cost` - the seller's standing per-product **COGS**, owner-only (`product_cost_all`). Filled
  by the product-import RPC. (0 rows; only in types.)
- Created together in `supabase/migrations/20260607190000_seller_only_column_split.sql`.
- NOTE: `deal_line_item` itself is PUBLIC and has NO margin columns (correction to an earlier note);
  it has `thc_percent`/`cbd_percent` (empty) + metadata (pzn, cultivar). The current app uses the
  simpler deal-level `deal_party_field` ("Buying price" box) instead of these per-line tables.

---

## 5. The batch model (built, dormant, disconnected)

**Exists:** `product_batch` (rich: batch_number, ready/expiry dates, shelf life, water_activity,
loss_on_drying, **measured** thc/cbd/cbg/cbn, description) + `batch_terpene` (per-batch terpene
profile) + a `terpene` lookup. FKs: a batch belongs to one product + one company.

**Missing:** `deal_line_item` has **no `batch_id`** (a line cannot point at a batch today); **0 batches
seeded** (the 4 dummy products have none); nothing in app code reads/writes batches (only in types).

**Decision:** a deal line should reference a **specific batch**; **snapshot** the batch's measured
THC/CBD + batch number onto the line at deal time (frozen pattern - a later catalogue/batch edit must
never rewrite a past deal); show **batch number + measured THC/CBD** on the card line now; the deep
detail (terpenes, water activity, genetics) waits for the future clickable product card.

---

## 6. Code reality (built / dormant / wrong / missing) - 2026-06-17

- **value_net** = app-computed `Σ(quantity × unit_price)` (`actions.ts:47-53` `sumValueNet`), stored on
  `deal_card`; **value_gross** = `net × 1.19` (DEMO_VAT_RATE, `derive.ts`), computed on render, not
  stored. `deal_line_item.line_total` is a generated column (`qty × unit_price`) but is **never read**.
- **OBS-1 (value can read 0):** value_net is *stored*, not recomputed live. A card whose value was
  never written shows "0 €" even with priced lines. Fix: sum from the line totals. (CARD-01)
- **OBS-2 (kg/g bug):** pricelist prices are **per gram**; the form seeds `unit='g', qty=1000,
  unitPrice=price_per_gram`; the unit dropdown lets you switch g->kg WITHOUT converting the price; the
  math is naive `qty × unitPrice` with no normalization (`actions.ts:51`, `DealForm.tsx:117-121`,
  display `ProductList.tsx:53-55`). Fix: normalize units. (CARD-02)
- **Private box** (`deal_party_field`, `field_key='supplier_cost'`, written immediately in
  `proposeDealChange:429-462`) - the label "Buying price (from supplier)" and `party_side='seller'` are
  **hardcoded for both sides**, so the BUYER's value renders under the seller's label (the "56" you
  saw). MRGN-01 replaces this with per-line, per-side, correctly-labelled margin.
- **The form note box is dead on edit** - `EditDealForm` `onSubmit` does NOT pass the note up
  (`EditDealForm.tsx:87-93`); on create it lands in `deal_card_log.change_summary`
  (`create_deal_draft_rpc:138-141`). **No card-note column exists anywhere.** The 5 DB columns with
  "note" in the name (`deal_change_input.note`, `deal_confirmation.note` [unused], `join_request.note`,
  `pending_inbox_item.note`, `relationship_term.response_note`) are none of them the card Note. (NOTE-01
  needs new storage + to be removed from the log.)
- **Incoterms is dormant** - `deal_card.incoterms_code` -> a seeded `incoterms` lookup (11 codes
  EXW..DDP); fetched (`reads.ts:382`) but **never written** (no form field, no RPC param) and **never
  shown**. 0 cards set it. PARKED (future, team discussion).
- **Batches / per-line private / COGS** - all built, all dormant (§4, §5).

**The pattern:** a whole "per-line private + COGS + batches" layer was scaffolded early
(`20260607190000`, the batch tables) and never wired up. So much of this milestone is **wiring
existing tables**, not designing new ones - good news for risk.

---

## 7. The phase breakdown (the build sequence)

| Phase | Delivers (reqs) | Key work | Depends on |
|---|---|---|---|
| **3a** Card display correctness | CARD-01, CARD-02, CARD-03 | value sums lines; kg/g normalize; show payment terms + free delivery. No new storage. Smallest, do first. | Phase 2 |
| **3b** Deal Basket foundation | BSKT-01 | rename DealForm -> Deal Basket; one model fed by create/edit (ready for Sella/shop); add the recipient field (company mandatory, person optional, p2p-chat default). FOUNDATIONAL - the rest build on it. | 3a |
| **3c** Card Note (held) | NOTE-01 | new per-company note storage that versions with the card + rides the held flow; reuse the Basket note box; remove from the log; show on the face | 3b |
| **3d** Margin per product | MRGN-01 | wire `deal_line_item_private` + `product_cost`; per-line cost/resale inputs; margin % per line + deal average; only-you; fix the mislabel | 3b |
| **3e** Form product UX | FORM-01, FORM-02 | increment-not-duplicate; add by name + auto-fill; custom product (all on the Basket) | 3b |
| **3f** Batches end-to-end | BTCH-01 | add `batch_id` to the line; snapshot measured values; batch picker in the Basket; seed demo batches; show batch number + measured THC/CBD on the card | 3e |

Then the old Phase 4 (cross-deal notification), 5 (Sella detection), 6 (Connect/chat UI) follow.
Doing the card/form properly here absorbs much of the card-related UI work, so **re-check Phase 6's
scope after this milestone lands.**

---

## 8. Parked / future (NOT this milestone)

- **Incoterms** on the card - dormant; revisit with the team (likely a relationship-page concern).
- **Clickable product card** (shared entity) with full detail (terpenes, water activity, genetics,
  irradiation, origin) - ~1 week out; reads the deal-time **snapshot**, never live product data.
- **Configurable "pick what shows" display panel** - the flexible-display principle, built later.
- **Per-line vs deal-average margin** display nuance - per-product is in; the exact averaging/rollup
  is a build detail.
- **Visual / "make it feel like Amazon" polish** - the later UI phase (Phase 6 re-scope).
- SIGNALS stay **per-company** for now (per-person later).

---

## 9. Decisions locked this session (for DECISIONS.md / the record)

1. **Note (card) is HELD, not immediate** (reverses the 2026-06-17 plan-phase guess "D-34"). Per-company
   authored; the other side Accepts/Declines a note change but cannot rewrite it; Decline discards.
2. **Margin (T5b) is pulled from out-of-scope into v1**, **per product**, shown as **%**, owner-only,
   wired through the existing `deal_line_item_private` + `product_cost`.
3. **The card shows** batch number + measured THC/CBD (per line), payment terms, free delivery, and the
   per-side margin % (replacing the raw private box).
4. **A deal line belongs to a batch**; measured values snapshotted at deal time.
5. **The edit form is rebuilt properly** (Amazon-style, batch->product, increment, custom product);
   visual polish deferred to the UI phase.
6. **Incoterms parked**; **flexible-display** + **clickable product card** are future.
7. **Build it for real** (backend + data), not a mockup; commit local-first; cloud push deferred +
   coordinated with Muskan (she holds the `product`/`pricelist_item`/`product_image` RLS surface +
   `supabase/migrations/` lock until her own cloud push).

---

## 10. The Deal Basket model (a reusable form, fed by every trigger) - added 2026-06-17 (post-commit)

The deal **form** is promoted to a first-class, reusable concept: the **Deal Basket**. (Decision: ADR-0003.)

**Rename:** "Deal Form" -> **"Deal Basket"** (the existing `DealForm` component + its `DealFormPayload` shape + the two wrapper components). Contained, low-risk refactor inside `src/modules/deals/`. If the rename is inconvenient at build time, keeping "Deal Form" is acceptable - the concept matters more than the name.

**Purpose:** the Deal Basket is the single, reusable "deal-in-assembly" - one model + one form component holding a deal's editable content (products, quantities, prices, delivery conditions, terms, the per-side private price, the Note) plus a **recipient**. When **sent**, a Basket becomes a Deal Card (via the existing propose/held flow). One Basket, many doors into it.

**Form <-> Basket (already half-built):** `DealForm` is already "dumb + fed" (`DealForm.tsx:4-9` - "ONE form, fed two ways... knows nothing about create vs edit (or about Sella, who will feed it the same way later)"). `CreateDealForm` feeds it empty -> `proposeDeal`; `EditDealForm` feeds it the current card -> `proposeDealChange`. So the Basket = the form's payload (`DealFormPayload`), just unnamed. An **empty** Basket -> a new deal; a **deal's content loaded into a Basket** -> an edit (the Basket is "attached to" that deal while editing). Same shape, two uses.

**Option A (chosen now) vs Option B (later):**
- **A (now):** the Basket is a reusable model + component, fed by triggers, materialising into a Deal Card on send. **Transient** - it lives only while the form is open; nothing persisted. The lighter path, mostly already built (name it, add the recipient field, let the other triggers feed it).
- **B (later):** also **persist** the Basket as a saveable/shareable record (start it, leave, come back, hand to a teammate before sending). New table + lifecycle. Deferred until "save a basket and come back" is a real need.

**The recipient field (new on the Basket):**
- A Basket carries **who it goes to**: **company = mandatory**, **person = optional**.
- **No person chosen -> the deal addresses the company** (lands in the company inbox / unassigned queue).
- Defaults by trigger: from a p2p chat -> that chat's person + company (auto-filled); from a panel/shop -> CHOSEN, and only **connected** companies/people are selectable; from a C2C chat (future) -> the company auto, person optional.

**Triggers (the doors into a Basket) + when buildable:**
- **Human in a p2p chat** - NOW; recipient = the chat's other person (auto).
- **Sella detects in a p2p chat** - Phase 5; recipient = the chat's person (auto).
- **Sella's own panel** (Sella asks "who to?") - FUTURE (new surface; rides the Sella/seller work). Confirmed future by Ayush.
- **The shop** - FUTURE (parked Path A).
- **Company-only sending (no person)** - FUTURE; needs the parked **C2C ticketing** (the inbox `assigned_to` primitive). Confirmed future by Ayush.

**Scope for this milestone:** add the Basket name + the recipient field (company mandatory, person optional) and wire the **p2p-chat** default; the panel/shop pickers + company-only sending are FUTURE. New requirement **BSKT-01 = its own Phase 3b** - foundational, done right after the 3a display fix, because 3c (Note), 3d (margin), 3e (form UX), and 3f (batches) all build on the Basket.

**Also flagged (later):** Deal Workspace -> "Deal Room" rename is already tracked as CONN-01 (Phase 6); not part of this milestone.

---

*Resume point: read this file, then `/gsd:plan-phase 3a`. The old `.planning/phases/03-card-note/`
plan is SUPERSEDED (it assumed Note = immediate) - archived under `_superseded/`.*
