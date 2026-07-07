---
status: accepted (Option-A "transient" clause superseded 2026-06-29)
---

> **Update 2026-06-29:** the **Option-A "transient basket" clause below is superseded** — the basket is now **persistent** (Option B), shared, and built by both buyers and sellers. The rest of this ADR (one reusable Deal Basket model + form, fed by every trigger) still stands. See `docs/decisions/DECISIONS.md` → "2026-06-29 — Persistent shared basket + seller-owned deal pricing".

# The deal form is a reusable "Deal Basket", fed by every trigger

## Context

A deal can be created from several places - a human in a p2p chat, Sella, and (future) the shop - and
edited from the card. Today the human path already uses one shared, "dumb + fed" form component
(`DealForm`): `CreateDealForm` feeds it empty, `EditDealForm` feeds it the current card, and each decides
what happens on submit. But the "bag of fields" has no name, Sella does not use it (it has its own
extraction schema + RPC), the shop path is parked, and the form does not record WHO the deal is for - the
recipient is implied by the p2p chat it is created in.

## Decision

Promote the form's payload to a first-class, reusable concept: the **Deal Basket** - one model + one form
component holding a deal's editable content (products, quantities, prices, delivery, terms, the per-side
private price, the Note) plus a **recipient**. Every trigger fills the same Basket; on send it becomes a
Deal Card via the existing propose/held flow. An empty Basket creates a new deal; a Basket loaded from a
deal edits it (the Basket is "attached to" that deal while editing).

**Option A (now):** the Basket is **transient** - a reusable model + component that materialises into a
Deal Card on send; nothing persisted. **Option B (later):** also persist the Basket as a saveable /
shareable record. We choose **A** now; B is deferred until "save a basket and come back" is a real need.

**Recipient:** **company mandatory, person optional**; if no person, the deal addresses the company.
Defaults come from the trigger (p2p chat -> that person + company; C2C -> that company); from a panel or
the shop the recipient is chosen, and only **connected** companies/people are selectable.

## Considered options

- **Keep three separate creation paths** (human form, Sella schema, shop) - rejected: the deal's field
  definition is then written three times and drifts.
- **Persist the Basket now (Option B)** - rejected for now: nothing yet needs a saved/shareable pre-deal;
  the transient model already gives the reuse win at far lower cost.
- **Leave the recipient implicit** (p2p-chat-only) - rejected: it blocks creating from a panel/shop and
  sending to a company.

## Consequences

- Rename `DealForm` -> Deal Basket (contained, low-risk; keeping "Deal Form" is acceptable if the rename
  is inconvenient - the concept matters more than the name).
- The Basket gains a recipient field; the **p2p-chat default is buildable now**.
- Creating from **Sella's panel** / **the shop**, and **sending to a company with no person**, are FUTURE
  - the last needs the parked C2C ticketing (the inbox `assigned_to` primitive). Confirmed future by Ayush.
- Builds on ADR-0002 (card data model) and ADR-0001 (held change): a sent Basket becomes a Deal Card
  through the held/propose flow.
- New requirement BSKT-01; foundational to the form work (3b-3e all touch the Basket), so do it early.
