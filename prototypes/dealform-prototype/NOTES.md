# Deal Form / product list - prototype notes

**Status:** throwaway exploration. Pure HTML/CSS, not wired to the app. Open `index.html` in a browser.
**Date:** 2026-06-19
**Source:** Connect/Chat UI overhaul build plan, slice **S3 "The Form"** - see
`_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` (rows V1.16, V1.17, V1.18, V2.3).
**Why:** the deal basket / form changes completely, and the product list today is "a bad, unclear
representation". This explores a clean, user-friendly product picker (image thumbnail + plus/minus
stepper, the V2.3 research target) so Ayush can pick a direction before we build the real one.

## The three variations

| Variation | Idea |
|---|---|
| **A - Catalogue grid + slide-in basket** | Browsing-first. Left = catalogue as real product cards (image, THC/CBD chips, price/g, one-tap add, inline batch chooser); right = a live basket that fills as you add. Best when the seller scans a shelf and assembles a deal. |
| **B - Searchable line ledger** | Editing-first. One dense, aligned order-sheet column: thumbnail, product+cultivar, batch dropdown, potency, stepper+price, line total, plus a private margin column. Best for reviewing / tuning many lines fast. |
| **C - Stepper tiles + sticky total** | The cleanest "image thumbnail + plus/minus stepper" match (V2.3). Rich tiles with a square thumbnail, a dual-colour THC-vs-CBD potency bar, batch chip, a big +/- pack stepper, price-each + line total, and a dark sticky total bar. Scales straight down to phone width. |

Every row across all three carries: thumbnail, batch, measured THC/CBD, a +/- pack stepper, price/g, line
total, and a running basket total - matching the real `DealForm` field shape (product + batch is ONE
entity, packs as the step, measured potency from the batch, per-line private margin).

## V1.18 brainstorm - what the form should carry

Fields split into three tiers by how often the user needs them.

**Show prominently (every line, always visible):**

| Field | Why |
|---|---|
| Product thumbnail | recognition at a glance |
| Product name + cultivar / strain | e.g. "Northern Lights - Indica" |
| Batch / lot number | the one entity tied to the product (e.g. B-2407) |
| Measured THC% and CBD% | the deal truth, from the batch, not the label |
| Quantity as a +/- pack stepper | show the gram equivalent too (e.g. "2 packs - 2 kg") |
| Unit price (price/g) and line total | the money |
| Running basket total + line count | the running picture |

**Tuck away (present but quiet - one tap, or a locked / dashed row):**

- Per-line private margin / your-cost input (lock icon, "only you" - never shown to the counterparty)
- Custom-product affordance and the "Custom - no batch" tag
- Unit selector (g / kg / unit) - only matters for custom lines
- Pack size label ("1 kg pack")
- PZN / cultivar metadata for pharma lines

**Deal-level, below the lines (one section, not per-line):**

- Recipient "To" (locked chip in p2p chat)
- Free delivery toggle, due date, payment terms (Net 30)
- The change note (required on edit)

## Insight (IMPORTANT)

The biggest clarity win is treating **potency and batch as data chips, not body text**. Today they read as
a run-on string. Give THC a violet chip and CBD a teal chip - and in Variation C a single dual-colour bar -
so the eye sorts high-THC vs high-CBD lines instantly. That is exactly what a wholesale buyer scans for,
and it is the cheapest fix that makes the "bad, unclear" list (V1.17) read like a real product picker.

## Next step

Ayush picks A, B, or C (or a mix). Then we build the real `DealForm` from the chosen direction.
