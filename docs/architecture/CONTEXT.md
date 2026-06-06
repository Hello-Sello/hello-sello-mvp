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
| **Deal Workspace** | The deal container. Spawns at Deal Card birth. Holds chat, artifacts, members, stages, and the Deal Card itself. |
| **Relationship page** | The record of business between two companies. Created at pickup (first human response to a connection). Holds deal history, notes, pricelist, agreed terms. |
| **Sella** | The AI agent. Female-inspired, mediator-style. Multiple specialist variants: Seller-Sella, Buyer-Sella, Deal-Sella, Personal Sella, Company Sella, First-contact Sella. |
| **Big 7** | The 7 pillars of the product: Connect / Buy / Sell / Present / Grow / Discover (6 surfaces) + Sella (always-available AI layer). |
| **Thing** | A clarification ticket inside a Deal Workspace. Used for post-close work or mid-deal questions. |
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

*Maintained by `grill-with-docs` (proposes additions during grilling — humans confirm) and direct edits. Add new terms when they're locked in Layer docs or surface during code review.*
