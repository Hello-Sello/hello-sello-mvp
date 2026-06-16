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
| **Deal Room** | The customer-presentation surface. Opened by expanding a Deal Card. Holds product info, media, optional Loom recording. 1 per Deal Card. |
| **Deal Workspace** | The deal container. **Born at Deal Card Draft** (the workspace + deal chat exist from the moment the card is drafted, so negotiation has somewhere to live). **Company-wide visible by default**; `private` collapses it to invited members only. Reached from the Relationship page or a **⤢ button on the Deal Card**. Holds the Deal Chat, the Deal Card (a pinned flip-card pill in the chat), people, THINGS (grouped by the 5-step **Stage** pipeline — the visible work primitive), deal-level documents, and Deal-Sella. Permanent 1:1 with its Deal Card. Lifecycle **Draft → Confirmed → Done** (Done = delivery note + invoice attached). |
| **Deal owner** | The person accountable for a deal throughout its life (usually the initiating dealmaker). Assigns the stage-responsible people at deal birth; ownership never passes between them. |
| **Relationship page** | The persistent record of business between two companies. Created when a connection is **accepted**; reached from a **P2P or C2C chat** (one page, two doors — **no person-level relationship page**). Holds deal history (filterable → workspace), per-side **team notes** + per-user **personal notes**, agreed terms, custom pricelist, Sella insight, analytics, activity log, and **artifacts**. Relationship-level only (see **Two altitudes**). |
| **Artifacts** | The shared document folder on a Relationship page — **company-wide** files (licenses, contracts, certs). Deal-specific documents (COAs, badges) stay inside the deal, not here. |
| **Team note / Personal note** | The two note types on a Relationship page. A **team note** is per-side business memory, visible to your own company; a **personal note** is private to the individual (relationship upkeep). Different jobs, both kept. |
| **Two altitudes** | The rule splitting **relationship-level** content (on the Relationship page) from **deal-level** content (on the deal card / in the deal). Decides where each piece of info, document, and insight lives. |
| **Sella** | The AI agent. Female-inspired, mediator-style. Multiple specialist variants: Seller-Sella, Buyer-Sella, Deal-Sella, Personal Sella, Company Sella, First-contact Sella. |
| **Big 7** | The 7 pillars of the product: Connect / Buy / Sell / Present / Grow / Discover (6 surfaces) + Sella (always-available AI layer). |
| **Thing** | The visible work primitive inside a Deal Workspace — a unit of work that needs to happen for the deal to execute. Three kinds (one table, a `type` label): **task** (plain to-do), **approval** (an e-signature gate, drives a `deal_confirmation` row), **document_upload** (links to a `deal_artifact`). Grouped by **Stage**; status `open` → `done`. |
| **Stage** | The 5-step deal pipeline shown across the top of the Deal Workspace — `negotiation` → `compliance_quality` → `agreement` → `payment` → `fulfilment_delivery`. The grouping for THINGS ("where are we in the process"). A visible UI element (not invisible scaffolding). Status flips **Draft → Confirmed** at stage 3 (`agreement`); stages 4–5 are post-confirmation execution. |
| **SIGNALS** | The back of the Deal Card. Deal-Sella-generated, **per-viewer** insights about the deal (deal age, expiry risk, repeat patterns, etc.) - each side sees its own. |
| **PO card / SO card** | The two faces of one Deal Card, set by who authored it: a **PO card** = purchase order (buyer→seller), an **SO card** = sales order (seller→buyer). Same entity, distinguished by `doc_type`. |
| **`doc_type`** | The discriminator on a Deal Card = `purchase_order` or `sales_order` - decides whether it renders as a PO card or an SO card. |
| **Deal draft** | A Deal Card sitting inside a P2P chat that has not yet been confirmed. Confirming it ("start a deal") spawns the Deal Workspace. |
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
| **Pricelist / Pricelist item** | A supplier's standard company-wide price list (header) + its per-product price rows (basic + bundle). v0 = one standard list per company; per-customer override deferred. |

## Deal change flow (2026-06-16)

| Term | Definition |
|------|-----------|
| **Pending change** | A single held proposal of new **shared** deal terms, waiting for the other company's Accept or Decline. The Deal Card keeps showing the last agreed version until the pending change commits (both sides yes); a Decline or Withdraw discards it. At most one per deal. |
| **Change proposed / Change detected** | The two sources of a pending change: **proposed** = a person edited the card; **detected** = Sella spotted a change (later work). Same pending change underneath. |
| **Change reason** | The required reason a person gives on every **Accept** or **Decline** of a pending change (a Withdraw needs none). Distinct from a card **Note**. Captured as the per-person **Deal change input** and surfaced in the **Deal card log** + a system message. |
| **Note (card)** | An optional, per-company short content note shown on the Deal Card face for the other side. Optional; distinct from a **Change reason**. |
| **Decision strip** | The shared, deal-bound surface beside the Deal Card (the Sella strip / `DealPin`) that holds the Accept / Decline / Withdraw decision and the pending-change notice. Shown in **both** the p2p chat and the deal chat, synced - the card displays, the strip decides. |

*Maintained by `grill-with-docs` (proposes additions during grilling — humans confirm) and direct edits. Add new terms when they're locked in Layer docs or surface during code review.*
