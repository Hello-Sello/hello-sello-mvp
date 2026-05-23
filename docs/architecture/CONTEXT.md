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
| **Big 7** | The 7 pillars of the product: Connect / Buy / Sell / Present / Trade / Discover (6 surfaces) + Sella (always-available AI layer). |
| **Thing** | A clarification ticket inside a Deal Workspace. Used for post-close work or mid-deal questions. |
| **SIGNALS** | The back of the Deal Card. Deal-Sella-generated insights about the deal (deal age, expiry risk, repeat patterns, etc.). |

## Companies and users

| Term | Definition |
|------|-----------|
| **CoA / CoB** | Company A and Company B — the two sides of any deal. Seller side and Buyer side. |
| **P↔C** | Person-to-Company chat. First contact before a Relationship is established. |
| **P↔P** | Person-to-Person chat. The live deal conversation after a Relationship is created. |
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
