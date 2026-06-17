---
status: accepted
---

# The deal card has two visibility classes: shared/held and private/immediate

## Context

The deal card mixes two very different kinds of data on one surface: SHARED terms both companies must
agree on (products, quantities, prices, delivery, payment), and PER-COMPANY private numbers each side
keeps to itself (its cost, its resale price, its margin). During the 2026-06-17 card/form review we
found this was confused in three concrete ways: the card "Note" had no agreed behaviour (held vs
immediate) and no storage; the per-company private box was hardcoded to the seller's label so the
buyer's number rendered mislabeled; and a whole per-line private + COGS + batch layer existed in the
schema but was dormant and disconnected. We need one rule that decides, for every field, whether a
change is held for two-party confirmation or applied immediately to one side.

## Decision

**One rule governs the card:** a field that is **shown on the shared card (both sides see it)** is part
of the shared truth, so a change to it is **HELD** and requires the other side's Accept/Decline; a field
that is **private to its owner (only that side sees it)** is **IMMEDIATE** (own-side, ungated).

Applying the rule:

- **Held (both see; confirm a change):** line items, terms (delivery, payment, free delivery), and the
  card **Note**. The Note is per-company content shown to both - each side authors its own, the other
  side can Accept or Decline a note change but cannot rewrite it, and a Decline discards it.
- **Immediate (owner only):** each side's private price input (seller cost / buyer resale). From it we
  **compute a margin %** shown only to that side. Margin is **per product**, wired through the existing
  `deal_line_item_private` (per-line, owner-only) + `product_cost` (COGS) tables - not new ones, and not
  the public `deal_line_item`.
- **Derived (follow their inputs):** value net/gross recompute from the line items; they are not
  separately confirmed.
- **Batch:** a deal line belongs to a specific `product_batch`; its measured THC/CBD + batch number are
  **snapshotted** onto the line at deal time (frozen, so a later catalogue/batch edit never rewrites a
  past deal) and shown on the card.

## Considered options

- **Note as immediate / own-side (like the private box)** - rejected: the Note sits on the *shared* card
  for the other side to read, so any change must be something the other side knows about and confirms.
  ("If a note changes, the other company should know" - it acts like the regular Accept/Decline.)
- **A single deal-level margin box** - rejected: pharmacies and wholesalers buy from and sell to
  different parties per product, so margin is meaningful **per product**, then averaged - not one number.
- **New tables for margin / COGS / batches** - rejected: `deal_line_item_private`, `product_cost`,
  `product_batch` (+ `batch_terpene`) already exist with owner-only RLS; this is wiring, not new schema.
- **Show incoterms on the card** - rejected for now: the column is dormant (never written, never shown);
  parked for a team discussion (likely a relationship-page concern).

## Consequences

- The edit form is rebuilt properly (Amazon-style: a product browser, batch->product selection, quantity
  that increments instead of duplicating rows, custom products, per-line private price + margin %). The
  *visual* polish is deferred to the later UI phase; this milestone gets the data + behaviour right.
- The card Note needs **new storage that versions with the card** and rides the held-change flow; it is
  removed from the history log (`deal_card_log.change_summary`), where the create-time note lands today.
- `deal_line_item` gains a `batch_id`; demo batches must be seeded.
- Two existing value bugs are fixed in the same area: the card value must **sum the line totals**
  (OBS-1) and the unit/price math must **normalize kg vs g** (OBS-2).
- Builds on ADR-0001 (held two-sided change). The Note now travels through that same held machinery.
- Built local-first; the cloud `supabase db push` is deferred and coordinated with Muskan, who holds the
  `product`/`pricelist_item`/`product_image` RLS surface + a `supabase/migrations/` lock until her push.
- Supersedes the 2026-06-17 plan-phase working assumption that the card Note was immediate ("D-34").
