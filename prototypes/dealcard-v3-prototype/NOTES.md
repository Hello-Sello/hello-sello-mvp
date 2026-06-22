# Deal Card (S2) — v3 prototype

Throwaway HTML to pick the Deal Card look. Open `index.html` directly in a browser. No build step.

## What this is

A single route with **3 toggleable card variations** (V1 / V2 / V3) at the top. Same data, different density. Only one card is visible at a time. **V3 is the chosen direction and loads by default.** The Edit pencil shows on **both sides** — proposing and receiving see the same card, so either party can open it to propose a change.

## The card is a DISPLAY surface — NOT an action surface

There are **NO Accept / Decline / Change buttons anywhere on the card**, by design. Those actions live on the **separate Sella strip** (S1), not on the card. The card only shows the deal; the strip is where you act on it.

The card keeps exactly **three affordances**:

| Affordance | Where | Behaviour |
|---|---|---|
| Flip to history | maroon header, left corner | **cross-fades** the card to a back face with version history (two stacked `position:absolute` panels toggled by `.card.flipped` — no fake-3D `rotateY`, so it never glitches in Chrome/Safari) |
| Edit (pencil) | maroon header, right corner | shown on **both sides** — either party can propose a change |
| Open Deal Room | bottom link | a link/button into the Deal Room route (not a primary action button) |

Because both faces are absolutely positioned, the `.card` carries an explicit `min-height` (640px default, 560px in V3) so it does not collapse.

## The three variations

| | Name | Feel |
|---|---|---|
| V1 | **Calm invoice ledger** | balanced; value-net lives only in the maroon header, then a 3-up term row |
| V2 | **Thumbnail-led under maroon** | bigger 44px cultivar thumbnails, larger product names + headline value |
| V3 (chosen, default) | **Dense glance card** | compact; tighter headline (value-net still shown), one-line note, initials-only assignees, tighter section rhythm |

All three keep: the deep maroon header (`#76002d`), all three affordances, conditional notes, and the read-only assigned THINGS list.

### Value-net shows once

The value-net total appears **only** in the maroon `.headline` (`Value net · 3 products` + `€27.10k`). The old pink `.total` block and the redundant "Products" term cell were removed, so the number is never repeated. The term row is now a clean **3-up**: Delivery / Payment / Free delivery.

### One section primitive (calm ledger)

Below the maroon header, every section (terms, owner margin, notes, THINGS, message, Open Deal Room) uses **one** treatment: a single `1px var(--line)` top divider, a shared horizontal inset (`margin-inline: var(--s-4)`), and a consistent vertical rhythm (`padding-block`). No boxes, no fills, no left-accent bars — the `.sec` class carries it.

### Cultivar thumbs are distinct

Each product thumb bakes its cultivar type into the tile as a bold **IND / SAT / HYB** code (over the per-cultivar gradient), so the three lines read as intentionally different, not placeholder repeats.

### Type weights + spacing

Only standard weights are used (400/500/600/700/800). Spacing runs on `--s-2 / --s-3 / --s-4` tokens for aligned edges. The **Space Grotesk** display font is now actually applied — to the header HS number, the headline value, party company names, product names, and the back-face heading (capped at weight 700, the font's max, to avoid faux-bold).

## Conditional notes rule (proven live)

Both parties CAN leave a note, but a note renders **only if it is non-empty**. An empty note renders **NOTHING** — no dash, no empty box, no label.

In the dummy data, Greenleaf (the counterparty) left a real note ("Certs attached, all batches lab-verified this week.") so its box appears. Stonebridge (the viewer) left `null`, so its box is **absent**. The whole notes region collapses to zero height when both are empty. This is driven by `renderNote()` in JS returning an empty string for blank text, not by hardcoded markup. To test: in the data object, clear `theirNote` to `null` (the visible box disappears) or set `myNote` to a string (a second box appears).

## THINGS list is READ-ONLY

Each task shows an **assignee** (initials chip + name) and a **non-toggleable checkbox**. The checkbox is a styled `div` with `pointer-events:none`, not an `<input>` — you cannot tick it on the card. A small italic caption says **"Things are managed from the Deal Room."** so it is clear where they are edited.

## Wiring later — field map to CardFront.tsx

Every data field is mapped to a likely real field name in HTML comments above the `deal` object in `index.html` (search for `B.7 — CARD DUMMY DATA`). Highlights:

| Prototype field | Likely CardFront.tsx source |
|---|---|
| `deal.hsNumber` | `deal.hs_number` / `dealNumber` |
| `deal.version` | `deal.current_version_no` |
| `deal.proposing` | unused for gating — the Edit pencil shows on both sides |
| `deal.valueNet` | `deal.value_net` (formatted `€27.10k`) |
| `deal.avgMargin` | `deal.owner_avg_margin` — OWNER-ONLY, behind the lock |
| `deal.lines[]` | `deal.line_items[]` (name, cultivar, batch, thc_pct, cbd_pct, unit_price, quantity) |
| `deal.myNote` / `deal.theirNote` | `deal.viewer_note` / `deal.counterpart_note` (render only if non-empty) |
| `deal.things[]` | `deal.things[]` (read-only; assignee from `thing.assignee`) |

## Design system

Shared Section A tokens (palette, type, radii, chips, cultivar gradients) are pasted identically with the companion `dealform-v2-prototype` so both surfaces feel like one product. Maroon is the shared signature: the card header band = the form's dark total/Proceed bar. THC is always violet (`#b5179e`), CBD always teal (`#1b998b`), every number wears `.mono` (tabular figures).
