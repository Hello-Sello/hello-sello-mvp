# 0021 — Tier ladder (volume price tiers per product)

**Status:** APPROVED at G1 — 2026-08-14 (Muskan), after 2 rounds of questions
(dropdown-as-order-tool amendment + ascending/migration clarifications)
**Source:** Marcel's ask, verbatim: *"Create 3 price tiers per product with dropdown."*
**Scope home:** August MVP items 3–7 (`docs/muskan-build/august-mvp.md`)
**Spec rules:** per `docs/agents/PIPELINE.md` §5 this file names no tables, no file
paths, no components — the *what*, not the *how*. The *how* lands in the ADR at `/design`.

---

## 1. What

A seller can put up to **3 volume price tiers** on any product, on top of its base
price: *"from 500 g → €4.20/g, from 1000 g → €3.90/g, from 2000 g → €3.50/g."*
A buyer browsing a connected company's catalogue sees the base price and can open a
**dropdown** showing the full ladder. The dropdown is an **order tool, not a label**:
selecting a rung shows that rung's price and, on add, **pre-fills that quantity into the
basket**. From there the basket quantity is the truth: whenever it reaches a rung, that
rung's price is applied — automatically — and the deal draft is created with that
resolved price. Change the basket quantity and the price honestly re-resolves, up or
down. **Once the draft exists, prices belong to the negotiation** (G3 decision B,
2026-08-14): the deal card never re-prices silently — when an edited quantity qualifies
for a different rung, the card shows a hint and a human applies it with a click.

This is a **public sales offer**: the same ladder for every buyer. It is the
"buy more, pay less" mechanic a salesperson gives — not customer-specific pricing.

## 2. Decided in the spec interview (2026-08-14, Muskan)

| Decision | Call |
|---|---|
| Ladder shape | Repeatable rows, **UI capped at 3** — not a fixed 3-column shape. A 4th tier later is a row, not a migration (same reasoning `DECISIONS.md` already applied to terpenes and buyer codes) |
| Old single bundle bracket | **Replaced.** Each product's existing bracket migrates in as its first rung; the old two-column form is retired. One place expresses quantity pricing (locked decision: *"prices: one source of truth"*, `DECISIONS.md:747`) |
| Base price | **Stays put** — required, unchanged, not a rung. The ladder holds only the discounts above it; a product with zero tiers stays valid by construction |

## 3. Rules

1. A rung reads *"from N grams → price per gram."* **N qualifies** (`>=` — buying
   exactly 500 g gets the 500 g price).
2. Rungs are **ascending**: each rung's minimum is strictly greater than the previous,
   and its price must make sense as a discount ladder (validation detail → ADR).
3. **Every buyer sees the whole ladder.** Showing it is the sales pitch. The existing
   per-product price-visibility switch keeps working: a product whose price is hidden
   hides its ladder too.
3a. **The seller sees what the buyer sees.** After editing and saving, the seller's own
   read view of the product card shows the same dropdown with the 3 offers — the editor
   is for changing the ladder, the dropdown is how everyone (both sides) reads it.
4. **The applied rung's price is snapshotted onto the deal at strike time.** A seller
   editing or deleting a rung never changes any existing deal — the system-wide
   *standing agreement vs frozen snapshot* rule (`CONTEXT.md:92`, regulatory).
5. Basket and deal card must resolve the **same rung** for the same quantity — one
   resolver, one owner (the locked one-source-of-truth decision applies to the logic,
   not just the storage).
6. **Dropdown selection pre-fills quantity; basket quantity decides price.** Picking
   "from 1000 g" and adding puts 1000 g in the basket at that rung. If the buyer then
   edits the quantity, the price re-resolves from quantity alone — the earlier dropdown
   choice carries no weight. The two can never disagree because both read the same
   ladder.

## 4. Out of scope

- **Per-customer pricing** — a separate system (per-customer lists / account-passport),
  deferred post-v0 per Marcel (`DECISIONS.md:750`). Nothing here may depend on it or
  block it.
- **Cross-product bundles** — "1000 g X + 500 g Y together" (Marcel's screenshot);
  September list.
- **CSV import of multiple tiers** — the import keeps accepting the single bracket it
  accepts today (landing it as rung 1); a multi-tier import column-set is a follow-up.

## 5. Acceptance criteria (walked live at G5, on production)

1. Seller opens a product's edit view, adds 3 tiers, saves. Reopening shows all 3.
2. A 4th "+ Add tier" is not offered (UI cap).
3. Buyer on the connected company's catalogue sees the base price and opens the
   dropdown: base + 3 rungs, formatted as *"from N g — €X.XX/g."*
4. Buyer with price-hidden product sees no prices and no dropdown (visibility switch
   still honoured).
5. Basket at 600 g prices every gram at the 500 g rung; at 499 g, at base price;
   at exactly 500 g, at the 500 g rung.
5a. Buyer selects the 1000 g rung in the dropdown and adds → basket holds 1000 g at
    that rung's price. Buyer edits the basket down to 700 g → line re-prices to the
    500 g rung without any further action.
6. The deal card shows the applied rung's price; Marcel receives and signs.
6a. Changing quantity on the draft deal card does NOT silently re-price the line; a
    hint appears when the new quantity qualifies for a different rung, and clicking it
    **proposes** that rung as a held change the other side accepts — the deal card's
    existing two-sided change flow, never a direct write (decision B + ADR-0001/0002;
    the hint is disabled while another change is already pending).
7. Seller then edits the 500 g rung's price → the signed deal's numbers do not move.
8. A product that had the old single bundle bracket shows it as its first rung —
   no seller re-entry needed.
