# Domain Language — Hello Sello

This file is the canonical glossary for the Hello Sello domain — **ubiquitous language only**. Agents read this to understand product-specific terminology before writing code, architecture docs, or tests.

**Distinct from `ARCHITECTURE-NOTES.md`**: this file holds **term definitions** (what a Deal Workspace IS). `ARCHITECTURE-NOTES.md` holds **engineering implications** (how a Deal Workspace is stored, which tables it spans, what state transitions it undergoes). They reference the same terms but answer different questions.

Consumed by Matt Pocock's `grill-with-docs` and `improve-codebase-architecture` skills — they may propose updates to this file during grilling sessions (always preview before writing per project convention).

---

## Core entities

| Term | Definition |
|------|-----------|
| **Superspace** | Hello Sello's category claim - an intelligent layer above existing ERP/email/fax systems. Not a CRM, not a marketplace, not an ERP. |
| **Deal Card** | The core deal object. Starts as a cart-style basket while the seller assembles products; transitions to a card-style record once the deal forms. Carries products, volumes, prices, discounts, terms, notes. |
| **Presentation mode** | The customer-presentation surface. Opened by expanding a Deal Card. Holds product info, media, optional Loom recording. 1 per Deal Card. *(Renamed from "Deal Room" 2026-06-19, DEV-66 - aligns with the DEV-18 "Presentation Mode" concept. "Deal Room" now names the deal container below.)* |
| **Deal Room** *(RETIRED 2026-07-07, D-15/D-17 - Ayush's Phase 7, PR #139)* | ~~The deal container~~, Stages, and stage-grouped Things are all gone. **The Deal Card itself is now the container**: chat, a flat Things list, people, and documents render directly on/beside the card (see `DealCardPanelHost` / `AllocateDealCardHost` - a right-side panel opened via the `hs:open-deal-card` window event), not inside a separate room. The `deal_workspace` DB table/type still exists (workspace metadata: members, viewer company) but no longer means "the container" - see **Stage** and **Thing** below, also retired. |
| **Deal owner** | The person accountable for a deal throughout its life (usually the initiating dealmaker). Assigns the stage-responsible people at deal birth; ownership never passes between them. |
| **Relationship page** | The persistent record of business between two companies. Created when a connection is **accepted**; reached from a **P2P or C2C chat** (one page, two doors — **no person-level relationship page**). Holds deal history (filterable → workspace), per-side **team notes** + per-user **personal notes**, agreed terms, custom pricelist, Sella insight, analytics, activity log, and **artifacts**. Relationship-level only (see **Two altitudes**). |
| **Artifacts** | The shared document folder on a Relationship page — **company-wide** files (licenses, contracts, certs). Deal-specific documents (COAs, badges) stay inside the deal, not here. |
| **Team note / Personal note** | The two note types on a Relationship page. A **team note** is per-side business memory, visible to your own company; a **personal note** is private to the individual (relationship upkeep). Different jobs, both kept. |
| **Two altitudes** | The rule splitting **relationship-level** content (on the Relationship page) from **deal-level** content (on the deal card / in the deal). Decides where each piece of info, document, and insight lives. |
| **Sella** | The AI agent. Female-inspired, mediator-style. Multiple specialist variants: Seller-Sella, Buyer-Sella, Deal-Sella, Personal Sella, Company Sella, First-contact Sella. |
| **Big 7** | The 7 pillars of the product: Connect / Buy / Sell / Present / Grow / Discover (6 surfaces) + Sella (always-available AI layer). |
| **Thing** | The visible work primitive on a Deal Card — a unit of work that needs to happen for the deal to execute. Three kinds (one table, a `type` label): **task** (plain to-do), **approval** (an e-signature gate, drives a `deal_confirmation` row), **document_upload** (links to a `deal_artifact`). *(RETIRED 2026-07-07, D-15: no longer grouped by Stage — a flat "Things to do" list on the card. Status `open` → `done` unchanged.)* |
| **Stage** *(RETIRED 2026-07-07, D-15 - Ayush's Phase 7)* | ~~The 5-step deal pipeline shown across the top of the Deal Workspace~~ — `negotiation` → `compliance_quality` → `agreement` → `payment` → `fulfilment_delivery`. Stages backend is retired; Things are flat now. The deal now finalizes via the seller's invoice instead (`canFinalizeByInvoice`, FIN-01). |
| **SIGNALS** | The back of the Deal Card. Deal-Sella-generated, **per-company** insights about the deal (deal age, expiry risk, repeat patterns, etc.; everyone in a company sees the same signals, per-person is a future refinement, 2026-06-17) - each side sees its own. |
| **PO card / SO card** | The two faces of one Deal Card, set by who authored it: a **PO card** = purchase order (buyer→seller), an **SO card** = sales order (seller→buyer). Same entity, distinguished by `doc_type`. |
| **`doc_type`** | The discriminator on a Deal Card = `purchase_order` or `sales_order` - decides whether it renders as a PO card or an SO card. |
| **Deal draft** | A Deal Card sitting inside a chat that has not yet been confirmed. *(Widened from "a P2P chat" 2026-08-25, ADR 0006 §8.4: a company-addressed draft lands in the **c2c** company chat, so the definition may not name one thread type.)* Confirming it ("start a deal") spawns the Deal Workspace. |
| **Deal selector** | The chat control "Talking about: [current deal]" that picks which deal the conversation is about; defaults to the current deal. |
| **Half-card** | The collapsed Deal Card shown only in the Inbox as a pre-connection gate. In a chat the card is always full. |

## Companies and users

| Term | Definition |
|------|-----------|
| **CoA / CoB** | Company A and Company B — the two sides of any deal. Seller side and Buyer side. |
| **P2P** | Person-to-Person chat. The live working conversation between two people (formerly written P↔P). |
| **C2C** | Company-to-Company chat. A company-level channel - you message on behalf of your company and the whole company can see it. Created on every accepted connect request. (Replaces the old P↔C first-contact chat - that case is folded into C2C.) |
| **Deal Chat** | The chat that lives inside a Deal Workspace, scoped to one deal. |
| **P↔C** *(retired)* | Old person-to-company first-contact chat. Folded into **C2C** as of 2026-06-06; kept here only to read older docs. |
| **Superadmin** | Platform-fixed role. At least one per company. Holds system-level powers (accept connections, manage billing, assign Superadmins). |
| **Groups** | Custom company-defined roles (not platform-fixed). Each company defines its own Groups with a permission matrix. A person can be in N Groups simultaneously. |

## Deal lifecycle

| State | Meaning |
|------|---------|
| **Draft** | Deal forming. Sella has prompted, at least one side has responded. |
| **Confirmed** | Both sides accepted the deal. |
| **Done** | Delivery note + invoice both attached. Sella OCR extracts and auto-amends the deal card. |

## Pricelist cascade (seller → buyer)

1. Customer-specific pricelist (if one exists for this buyer on the Relationship page)
2. STANDARD pricelist (seller's default public pricelist)
3. Manual prompt (Sella asks seller to enter prices before the offer goes out)

---

## Connect chat & deal sync (2026-06-06)

| Term | Definition |
|------|-----------|
| **C2C chat** | Company-to-company chat. **Created at connection** (not deal-scoped) — the company-level notice board / audit record between two companies. *(Supersedes LAYER-1 §3's older "C↔C only inside a deal workspace" definition.)* |
| **P2P chat** | Person-to-person chat between people at two connected companies. Private — content is never company-visible. Where people actually talk (mixed chatter + the occasional deal-affecting line). |
| **Deal chat** | The chat thread inside a Deal Workspace. The deal's **ground truth / official record**, visible to deal participants. |
| **Deal detection** | Sella spotting a deal-forming (or deal-changing) signal and asking **both** parties to confirm before acting (`deal_detected`). The deal is born — or changed — only on a two-party Yes. |
| **Deal card log** | The append-only version history of a Deal Card (what changed, by whom, when, why). Lives on the **card back** behind a filter; feeds the audit log. |
| **Deal change input** | Each party's **own note** captured when a deal changes (Sella takes input, does not author). Per-user evidence — "individual for individual user". |
| **Audit log** | The running record of every system/Sella action. System messages in chat are **projections** of audit/log entries, not independent facts. |

## Deal card — commercial terms (2026-06-07)

| Term | Definition |
|------|-----------|
| **Offer** | A Deal Card initiated by the **seller**. Maps to a Sales Order (SO). |
| **Order** | A Deal Card initiated by the **buyer**. Maps to a Purchase Order (PO). Distinct from the older `doc_type` discriminator — `deal_type` is a first-class column on `deal_card`. |
| **Incoterms** | International Commercial Terms (ICC standard — EXW, DAP, DDP, etc.). Determine who pays for shipping and insurance in a cross-border cannabis trade. Stored as `incoterms_code` on `deal_card`. |
| **Payment terms** | The agreed payment window (NET30, NET60, COD, etc.). Cannabis pharma typically uses 40–90 day windows. Stored as `payment_terms_code` lookup on `deal_card`. |
| **Offer expiry** | The date after which a deal offer lapses. Stored as `offer_expires_at` on `deal_card`; Sella monitors and flags approaching expiry. |
| **Deal line item** | One product row on a Deal Card — product name, quantity, unit, unit price, line total, potency (THC/CBD for cannabis). Versioned: each `deal_card` version has its own complete set of line items (snapshot, not diff). |
| **Deal delivery** | The physical execution of a deal — batch numbers, Certificate of Analysis (COA) file, actual delivered quantities, delivery note + invoice. Separate from line items ("what was agreed") and deferred to Phase 3 (DEV-36). |
| **THC / CBD percent** | Potency fields on `deal_line_item` for cannabis products. Regulatory-grade — Sella validates these against license thresholds. Nullable (non-cannabis products carry neither). |

## Schema patterns (2026-06-07)

| Term | Definition |
|------|-----------|
| **Standing agreement vs frozen snapshot** | A system-wide pattern: the *current* value of something (a price, a payment term, a product detail) lives in **one source-of-truth table** that is mutable; any deal struck against it **copies (snapshots)** the value at strike time into its own row. Changes to the standing value never rewrite past deals. Examples on the platform: `pricelist` → `deal_line_item.unit_price` (price snapshot); `relationship_term` (standing payment terms) → `deal_card.payment_terms_code` (deal snapshot); `product.name` → `deal_line_item.product_name` (denormalized snapshot). *Why it matters:* regulated industry — past deals must remain auditable in their original form even after upstream values evolve. *Spotting the pattern:* if two columns look "redundant," ask *"would changing one rewrite history on the other?"* — if yes, they're not redundant; they're a snapshot pair. |

## Product catalog (2026-06-07 session 10)

| Term | Definition |
|------|-----------|
| **Product** | A supplier's marketable catalog entry — stable identity (name, cultivar, genetics, packaging, codes) + **label/advertised** cannabinoids. Distinct from a batch. Owned by one supplier company. |
| **Product batch (Lot)** | One physical lot of a product, carrying the **measured** Certificate-of-Analysis values. One product → **many batches**. |
| **Label vs measured cannabinoids** | The advertised THC/CBD on the **Product** (the "28" in "STR 28/1") vs the lab-tested value on each **Batch**. They legitimately differ — cannabis is a plant; lab results deviate lot to lot. |
| **Cultivar** | The strain / genetic variety ("Strawberry Meltshake"). A product property, not a batch one. |
| **Terpene** | Aromatic compound; a batch's terpene profile is part of its CoA. Stored as a controlled-vocabulary lookup + per-batch rows. |
| **Certificate of Analysis (CoA)** | Lab report of a batch's cannabinoids, terpenes, moisture, contaminants. *(Note: distinct from "CoA = Company A" above; the cert is also the `co_a` deal-artifact category.)* |
| **COGS** | Cost of goods sold — the seller's private per-product cost. **Seller-only**, never shown to the buyer. |
| **RRP / UVP** | Recommended retail price (reference), per gram. |
| **PZN (Pharmazentralnummer)** | German national pharmacy product number — the `local_code_pzn`. |
| **Irradiation** | Sterilisation treatment of cannabis flower (beta / gamma / un-irradiated). |
| **Buyer product code** | The buyer's *own* internal code for a supplier's product — **per-buyer** (relationship-scoped), not shared on the product master. |
| **Pricelist / Pricelist item** | A supplier's standard company-wide price list (header) + its per-product price rows (base price + tier ladder). v0 = one standard list per company; per-customer override deferred. |

## Deal change flow (2026-06-16)

| Term | Definition |
|------|-----------|
| **Pending change** | A single held proposal of new **shared** deal terms, waiting for the other company's Accept or Decline. The Deal Card keeps showing the last agreed version until the pending change commits (both sides yes); a Decline or Withdraw discards it. At most one per deal. |
| **Change proposed / Change detected** | The two sources of a pending change: **proposed** = a person edited the card; **detected** = Sella spotted a change (later work). Same pending change underneath. |
| **Change reason** | The required reason a person gives on every **Accept** or **Decline** of a pending change (a Withdraw needs none). Distinct from a card **Note**. Captured as the per-person **Deal change input** and surfaced in the **Deal card log** + a system message. |
| **Note (card)** | An optional, per-company content note shown on the Deal Card face for the other side. **Held**: a change to it goes through Accept/Decline like a shared term (each side authors its own; the other can accept or decline but cannot rewrite it; a Decline discards it). Optional; distinct from a **Change reason**. (Held locked 2026-06-17, ADR-0002.) |
| **Decision strip** | The shared, deal-bound surface beside the Deal Card (the Sella strip / `DealPin`) that holds the Accept / Decline / Withdraw decision and the pending-change notice. Shown in **both** the p2p chat and the deal chat, synced - the card displays, the strip decides. |
| **Deal Finalization** | The deal's **last-stage seal** that closes the whole deal (the dormant `confirmDeal` action + `deal_confirmation` table). **Distinct from the everyday pending-change Accept/Decline** (`confirm_deal_change`): Finalization fires only at the LAST stage, not on every term change. The golden Seal was removed from the early flow and deferred to this final stage; the full design (move the panel into the deal workspace + a last-stage auto-trigger) is parked to the Stages discussion. (Vocabulary locked 2026-06-17.) |

## Deal card data model (2026-06-17)

| Term | Definition |
|------|-----------|
| **Shared vs private (the card rule)** | The dividing rule for every card field: anything shown on the shared card to both sides is **held** (a change needs both to confirm); anything private to its owner is **immediate** (own-side). Derived totals follow their inputs. (ADR-0002.) |
| **Card margin** | A per-product, per-side, private figure shown on the card as a **percentage**, computed from that side's own price against the shared price (seller: shared price vs cost; buyer: resale vs shared price). Owner-only; never shown to the other side. |
| **Private price (per side)** | Each side's own price input behind its margin: the seller's **cost** (COGS), the buyer's **resale** (price to patient). Owner-only, immediate. |
| **Batch (deal line)** | The specific lab-tested lot (`product_batch`) a deal line is for, carrying the **measured** cannabinoids. Its measured THC/CBD + batch number are frozen onto the line at deal time and shown on the card. |
| **Product Basket** | The real, persistent, global cart (2026-06-29, DECISIONS.md — supersedes ADR-0003's "Option A" clause below). Colloquially "the cart" in conversation — same thing, one canonical name in docs/code. Both a seller (own shop) and a buyer (another connected company's shop) add products into it; grouped by seller company; survives refresh/logout (owned by the person, not a browser tab or an animation flourish). Exists **before** any recipient is chosen. On Send (per seller-group), its lines feed a Deal Basket, which becomes a Deal Card. |
| **Deal Basket** | The internal, transient content package built the instant you hit Send on one seller-group of the Product Basket: that group's lines + a chosen recipient (company mandatory, person optional) + note/terms. Not a separate screen or a persisted row — it's the shape `createDeal` is called with. Becomes a Deal Card immediately. The current `DealForm` is the Basket, unnamed. (2026-06-17, ADR-0003 — still accurate for this layer; "transient" was never wrong, it just used to describe the whole basket before Product Basket split off as its own persistent layer, 2026-06-29.) |
| **Deal Form** | The UI of a Deal Basket - the form you fill to create (an empty Basket) or edit (a Basket loaded from a deal) a deal. The Basket's editor; may be renamed "Deal Basket". |
| **Pack (basket quantity)** | A product is sold in packs of `product.pack_size_grams` grams (e.g. a 10 g pack or a 1 kg pack). The basket counts **packs** - the +/- stepper steps one pack and the form shows "N packs" - but a line still **stores grams** and is **priced per gram**, so the card money math is unchanged. Re-adding a product adds one pack to its line (never a duplicate row). (2026-06-18, Phase 3e / FORM-01.) |
| **Custom product (deal line)** | An off-catalogue line typed by hand (FORM-02): `productId` is null, so it never merges with a catalogue line and is skipped by the per-product margin carry-forward (a known, accepted limit). The user types its name, unit, and optional price. |
| **Recipient / assignee (To)** | Who a Basket is addressed to: **company mandatory, person optional**. In a p2p chat it is auto-resolved from the relationship and **locked** (shown as a "To" row on create and edit). Elsewhere (Sella panel / shop) the same field becomes an editable **dropdown of connected companies → their people**; no person → send to the company via C2C chat. The dropdown + connected-contacts read + C2C routing are FUTURE (not built); only p2p auto-assign exists today. (2026-06-18, ADR-0003 / Phase 3e.) |

## Sales / Purchase calendar (2026-07-08)

| Term | Definition |
|------|-----------|
| **Deal calendar** | The shared timeline surface showing a company's deals over time, one row per counterparty, deals drawn as pills on the day they land. One component (`DealCalendar`), rendered on two surfaces with a side-specific title: **Sales calendar** on Sell (rows = the seller's **Customers**), **Purchase calendar** on Buy (rows = the buyer's **Suppliers**). Same object, side supplied as a prop. |
| **Counterparty** | The neutral term for the other company in a deal calendar row — a Customer when I'm selling, a Supplier when I'm buying. One `counterparty` per row. |
| **Pill** | One deal on the deal calendar, drawn on the counterparty's row from the moment the deal is **birthed** (an offer/order exists — a grey Product-Basket draft is not yet a pill). Its colour = the deal's current **display stage**. Click → opens that deal's Deal Room. |
| **Deal display stage** | The human-facing lifecycle stage of a deal ([DEV-151](https://linear.app/hellosello/issue/DEV-151)), a richer display vocabulary than the DB `deal_card_status` enum (draft/withdrawn/confirmed/amended/done/cancelled) and shared by the Orders table and the calendar pills. Canonical colour encoding: **Draft** grey (pre-send, in the Product Basket — not a pill) · **Sales offer / Purchase order** pink (deal birthed) · **Deal accepted** yellow (both sides agreed) · **Deal executed** green (invoice + delivery note uploaded) · **Deal update** orange (invoice differs from deal / split / cancellation — *Marcel left this colour unset, orange is our placeholder*) · **Ticket created** blue (a clarification issue was raised — distinct from Deal update) · **Ticket closed** dark green. |

## Buy page (2026-07-08)

| Term | Definition |
|------|-----------|
| **Partner (Buy)** | A supplier a buyer has purchase history with — real deals and/or CSV-imported history. **Connection to the platform is optional** — a connected partner's row links to a real Relationship page; an unconnected one (history-only) doesn't. Distinct from **CoA/CoB** (which assumes an active deal). |
| **Deals timeline / Sales calendar** | **One shared component**, built once and adopted by both **Buy** (timeline) and **Sell/Allocate** (its "Sales calendar" section, replacing `src/app/sell/SalesCalendarStub.tsx`). Renders **real Deal Card data** — not a separate CSV record — so its pill status vocabulary is the same locked 7-state vocab as Sell's Orders & Offers (Sales offer / Purchase order / Deal accepted / Deal executed / Deal update / Ticket created / Ticket closed), not an ad-hoc one. |
| **Weighted average purchase price (wap)** | Buy-page metric — a buyer's actual paid price per gram for a product, averaged across a period's purchases (real deals + CSV-imported history, layered). |
| **DB1** | *Deckungsbeitrag 1* / contribution margin 1 — the Buy-page's buyer-side economics metric, mirroring the seller's COGS-margin concept. `DB1 total = (net − wap) × qty`; `DB1/unit = net − wap`; `margin % = DB1 / revenue`. |
| **Buyer resale price (net / gross)** | The buyer's own price to the end customer/patient, entered per (partner, product) on the Buy Analytics sheet. **v0: fully independent** of the existing per-deal **Private price (per side)** field on `deal_line_item` — no auto-fill or snapshot link between them yet (may unify later via the **Standing agreement vs frozen snapshot** pattern above). |

## Volume pricing — tier ladder (2026-08-14)

| Term | Definition |
|------|-----------|
| **Volume tier / rung** | One child row of a price row (`pricelist_item_tier` under `pricelist_item`): *from N g → €/g*. Buying at least `min_grams` unlocks that per-gram price. |
| **Tier ladder** | A product's ordered set of rungs — prices strictly descend below the base price as `min_grams` rises (DB-enforced by the ladder-shape trigger; up to 3 rungs in the UI, unbounded in schema). The ladder **REPLACES** the old single bundle bracket (`bundle_threshold_grams` / `bundle_price_per_gram`); base price stays on `pricelist_item`. (ADR-0004.) |

## Buyer shop view (2026-08-18)

| Term | Definition |
|------|-----------|
| **Buyer Shop View** | The seller's Present shop as a **buyer** sees it, rendered at `/discover/[companyId]`. Same shop, same product cards, **no edit affordances**; adds the buyer-only controls — quantity, pack size, the tier-ladder reveal, and add-to-basket. Not a separate shop: one catalogue, two viewers. Serves **connected and non-connected verified buyers alike** — connection changes *how much of the catalogue* is visible, never whether the surface exists. (*Corrected 2026-08-19 at 0022's G1: this entry originally read "as a connected buyer sees it", which the spec interview disproved.*) (Slug `0022-buyer-shop-view`.) |
| **Catalogue openness (L0 / L1 / L2)** | Not one dial — a **level that emerges from two per-product booleans**, `product.profile_visible` (does it appear off-profile at all) × `product.price_public` (is its price shown). **L0** = no visible products → catalogue locked, "connect to view". **L1** = visible products whose price is hidden → card renders with "Price on request" + a **per-product** Request-pricing CTA (the ask names the product; the answer happens in chat). **L2** = visible products with a public price → card renders the price. Levels are **per product**, so one shop routinely mixes L1 and L2 rows; the shop-level chip reports the mix. (2026-06-14, `discover-connect-loop.md`; per-product CTA locked 2026-08-19, 0022 G1.) |
| **Connection override (visibility only)** | An **accepted company relationship overrides `product.profile_visible`**: a connected buyer sees the seller's whole catalogue, hidden products included. So `profile_visible` means *"visible to companies I am **not** connected to"*, not *"visible to anyone"*. The override stops at visibility — **`price_public` is never overridden**, so a connected buyer looking at a price-hidden product still gets "Price on request". Per-buyer pricing is Phase 15's job, not this. (Locked 2026-08-19 at 0022's G1; amends the 2026-06-14 soft-openness lock, `DECISIONS.md`.) |
| **Accept gate** | The rule that a send to someone you're not yet connected to — a connect ask or a pricing ask — needs an explicit accept from the receiver before a chat thread exists; it does not auto-connect on send. Reaffirms Marcel's 2026-06-10 closed/consent directive. **A deal can never trigger this gate** — every `deal_card` is created inside an already-existing relationship, by construction (`send_deal` and Sella's `confirm_detected_deal` both operate on a `relationship_id` that already exists). (2026-08-31 decision, amended 2026-09-01, `DECISIONS.md`; slug `0027-retire-connect-inbox`.) |

*Maintained by `grill-with-docs` (proposes additions during grilling — humans confirm) and direct edits. Add new terms when they're locked in Layer docs or surface during code review.*
