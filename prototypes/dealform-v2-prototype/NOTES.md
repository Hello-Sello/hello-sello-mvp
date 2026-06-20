# Deal Form (S3) — v2 prototype

Throwaway design prototype. Open `index.html` directly in a browser (no build step). Self-contained HTML + CSS + tiny inline JS.

## What this is

A redesign exploration for the **Deal Form** (the edit/propose-change modal in `DealForm.tsx`). Three toggleable variations share one design system (the same maroon/raspberry palette as the Deal Card). Pick a variation, then port it into the real shell.

> **DECISION: V2 (Shopping-bag tiles) is THE pick** and is now the default on load. V1/V3 are kept working for reference but V2 is the one to port and polish.

## Three variations

| Toggle | Name | Idea |
|---|---|---|
| **V1** | Searchable line ledger | A spreadsheet-style ledger: one grid row per product line. Batch dropdown, pack stepper, quiet private cost capsule, and line total all align in columns. Densest information, calmest scan. |
| **V2** | Shopping-bag tiles | **DEFAULT / THE PICK.** Each line is a rounded card (64px thumbnail, stacked controls) like a Shopping-Bag item, with a potency split-bar under each batch. Friendliest, most touch-forward. |
| **V3** | Dense order-sheet | Same ledger as V1 but with tight padding and mono-heavy text. For power users editing many lines fast. |

All three keep: required batch dropdown, quiet private cost capsule + prominent visible sell price, pack stepper + grams, THC/CBD chips, Subtotal/Shipping/Total, **one deal-level Avg. margin**, a deal note, an editable things-to-do list, and the dark maroon Proceed pill.

## Three-band scrollable modal (all variants)

The modal is a fixed-height flex column (`max-height ~82vh`), split into three bands so it never overflows the screen:

| Band | Class | Behaviour | Holds |
|---|---|---|---|
| TOP | `.m-top` | Pinned | Title + bag-count + recipient + product search |
| MIDDLE | `.m-scroll` | Scrolls (`flex:1; min-height:0; overflow-y:auto`) | Product tiles/rows, deal terms, the note, the things-to-do |
| BOTTOM | `.m-foot` | Pinned (sticky) | Subtotal / Shipping / Total + Avg. margin + Proceed pill |

This matches the Shopping-Bag screenshot: totals and Proceed are always visible while the line list scrolls. Verified at 920px desktop and ~390px phone (footer stacks figures over actions; Proceed stays in view).

## Pricing model change: one deal-level margin, no per-line margin

- **Per-line margin % is removed.** No margin chip on any individual product line anymore.
- **Each line keeps a quiet, private "your cost" input** (dashed capsule with a lock + "only you"). It is de-emphasised; the buyer-visible **Sell** price and the line total are the prominent numbers.
- **One deal-level Avg. margin** sits in the pinned footer: `Σ(sellTotal − costTotal) / Σ(sellTotal)` across priced lines, shown as a single `NN%  🔒 only you`. It is the ONLY margin shown anywhere, colour-coded by health (green ≥25% / amber <25% / red ≤0), recomputes live, and shows `—` when no line is priced. Example with the seeded data: +28% (green); drop a sell price and it falls to +22% (amber).

## Deal-level note + things-to-do (all variants)

- **Note** — an optional editable textarea ("Note to Stonebridge (optional)"), pre-filled in the deal's voice ("Certs attached, all batches lab-verified — happy to adjust counts if you need more."). Maps to `deal.note` / `deal_change.change_note`. Edits mirror across variants.
- **Things to do** — an editable list seeded with 3 tasks, each a checkbox + title + assignee chip (initials + name), matching the card's THINGS styling. Below it an "+ Add a task" composer (task input + assignee picker + Add button); typing a task and choosing an assignee appends a row. Checkbox toggles strike-through done. Maps to `deal_task[]`.

## Hard requirements met

1. **Variation toggle bar** fixed at the very top (V1/V2/V3), only one visible at a time, with a caption naming the active one.
2. **Batch dropdown after product selection** — a real `<select>` (not a thumbnail strip, because a product can have ~20 batches). 2-3 batches per product, each option formatted `CODE · stock packs · THC x / CBD y · exp mm/yy`. Default option is a disabled "Pick a batch…".
3. **Must-pick-a-batch flow is obvious** — the Wedding Cake line ships unbatched: its stepper, pricing, and total are greyed/disabled with a pink "pick a batch to price this line" hint. Choosing a batch un-greys the row, reveals the THC/CBD chips, and pulls it into the totals.
4. **Pack-count stepper + grams** — circular `−  N  +` stepper that also prints the gram equivalent (`2 packs · 2 kg`), derived from `packGrams`, read-only. At qty 1 the `−` is **disabled** (min qty stays 1, packs never drop to 0). Removing a line is a separate trash button (see below).
5. **Private cost + prominent sell, ONE deal-level margin** — each line keeps a quiet dashed "only you" cost capsule (owner-only/private); the Sell price + line total are the prominent buyer-visible numbers. There is **no per-line margin** — instead a single deal-level **Avg. margin** in the footer, colour-coded by health: green (`--ok`) healthy, amber (`--warn`) thin (<25%), red (`--danger`) at zero or loss. Live math wired in JS: editing any cost/sell/qty/batch recomputes the footer Avg. margin, the line total, and the summary instantly.
6. **THC% / CBD% chips** — THC violet (`--thc #b5179e`), CBD teal (`--cbd #1b998b`), echoing the chosen batch's measured potency.
7. **Subtotal / Shipping / Total + dark Proceed pill** — Shopping-Bag-style summary; Total is the loudest element; Proceed pill uses the shared maroon `#76002d`. Unpriced state shows `—`, not `€0`.

## Interactions wired (post-review fixes)

- **Delete a line** — one trash button per row/tile (`.rm`) removes the whole line (`order.lines.splice` → re-render). The stepper `−` no longer deletes; it just disables at qty 1.
- **Search picker** — the product dropdown is hidden by default, opens on focus/typing, and **filters the catalogue as you type** (clicking outside closes it). The same picker template renders for all three variants, so V2/V3 also have the add-product affordance. A "custom product" option is always offered (echoing whatever you typed).
- **Reactive shipping** — flipping **Free delivery** off reveals a `€` shipping-fee input; the Shipping row then shows that amount and the Total becomes `Subtotal + fee`. Three honest states: `—` (no priced line) / `Free` / `€amount`. Toggle + fee stay in sync across all three variants.
- **Icons** — all icons (🛍 bag, 🗑 trash, 🔒 lock, ⌕ search, ＋ add, ✓ checkbox) are inline `currentColor` SVGs in the same style as the lock icon, so they inherit colour and stay crisp. No emoji in rendered markup.
- **Things-to-do** — checkbox toggles done (strike-through); the "+ Add a task" composer appends a row from the task input + assignee picker (Enter or the Add button). All wired to `order.todos`, re-rendered to keep variants in sync.

## Live math (JS)

- `lineTotal = packs × packGrams(in kg) × 1000 × sell` (€/g, buyer-visible). Only **batched + qty>0** lines are priced.
- `lineCostTotal` = same but × cost (PRIVATE) — feeds the avg margin only.
- **Avg. margin (deal-level)** = `Σ(lineTotal − lineCostTotal) / Σ(lineTotal)` over priced lines → signed `%`, colour-coded green/amber/red, `—` when nothing priced. This is the ONLY margin shown.
- `Subtotal = Σ priced lines`; `Total = Subtotal + shippingFee` (fee is 0 when Free delivery is on). No priced line → `—`.
- Wedding Cake (no batch) is excluded → demonstrates the "locked until batch" state. Example totals with the seeded data: Northern Lights 2kg×€7.20 = €14,400; Sour Diesel 3kg×€8.10 = €24,300; **Subtotal/Total = €38,700**; **Avg. margin = +28%** (costs 5.50 / 5.60 €/g).

## Field map → DealForm.tsx

Mapped in an HTML comment block inside `index.html`. Summary:

| Prototype field | Real field |
|---|---|
| `order.dealNo` | `deal.deal_number` |
| `order.recipient` | counterparty (`deal.seller_org` / `buyer_org`) |
| `line.name` / `line.cultivar` / `line.packGrams` | `catalog_product.*` |
| `line.batches[]` | `batch[]` (`batch_code`, `available_packs`, `thc_pct`, `cbd_pct`, `expiry`) |
| `line.chosen` | `deal_line_item.batch_id` (REQUIRED) |
| `line.packs` | `deal_line_item.quantity_packs` |
| `line.cost` | `deal_line_item.unit_cost` (PRIVATE, quiet per-line capsule — feeds avg margin only) |
| `line.sell` | `deal_line_item.unit_price` (buyer-visible, prominent per line) |
| avg margin | derived deal-level `Σ(sellTotal−costTotal)/Σ(sellTotal)` (PRIVATE, footer only) |
| `order.freeDelivery` | `deal.free_delivery` (bool) |
| `order.shippingFee` | `deal.shipping_fee` (0 when free, else € amount) |
| `order.note` | `deal.note` / `deal_change.change_note` |
| `order.todos[]` | `deal_task[]` (`title`, `assigned_to`, `completed`) |

## Responsiveness

Works at desktop (920px modal) and collapses cleanly at ~390px: the three-band scroll layout holds (top + footer pinned, middle scrolls), ledger columns stack, tiles go single-column, the footer stacks figures over actions so Proceed stays in view, and the terms grid + add-task composer stack. Tested via the `@media (max-width:760px)` block and a headless 390px pass.

## Status

Prototype only. Not wired to data or actions. Commit local-only on `claude/ayush/work`; do not push unless asked.
