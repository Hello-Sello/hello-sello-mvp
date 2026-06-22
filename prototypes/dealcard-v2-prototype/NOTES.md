# Deal Card v2 - prototype notes

**Status:** throwaway exploration. Pure HTML/CSS, not wired to the app. Open `index.html` in a browser.
**Date:** 2026-06-19
**Source:** Connect/Chat UI overhaul build plan, slice **S2 "The Card"** - see
`_workshop/build-plans/2026-06-19-chat-ui-overhaul.html` (rows V1.15 and SS.3).
**Why:** the current card "looks unprofessional, boxes too big, too much info". This explores a
clean, professional, compact replacement so Ayush can pick a direction before we build the real one.

## The three variations

| Variation | Idea | Shows by default | Hides |
|---|---|---|---|
| **A - Compact ledger** | Reads like a clean invoice. Calm white surface, one face, no tabs | Parties, all product lines, terms grid, total, your margin, Things checklist | Nothing (Signals/Logs stay on the flip side) |
| **B - Thumbnail-led** | Products are the hero: big thumbnails, THC/CBD as coloured tags | Story line, all products, bold pink total bar, Things chips, actions | Delivery / payment / margin behind a "Deal terms" disclosure |
| **C - Sectioned / tabbed** | Deep-pink header + 3 segments (Products / Terms / Things), one open at a time. Shortest card | id, story, headline value + status pill, Message, actions | Two of the three detail sections (one tap each) |

The real difference is **information density**: A shows everything, B hides the dry terms, C hides two of
three sections. That maps to deal size - A suits short deals (2-4 lines); B and C stay short as lines grow.

## What all three carry (from screenshot SS.3)

- Header like **"DEAL - HS-PO-2041"**.
- A story line: **"On 18 Jun 2026, Greenleaf offered Stonebridge this deal."**
- Product lines, each with a **tiny per-cultivar thumbnail** on the left.
- Actions: **Decline / Change / Accept** (Accept is the green primary, slightly wider).
- A **Message** box and a small **Things** checklist (1/3 done).
- **Edit + flip** kept as the two top-corner round buttons (same idiom as today's `DealCard.tsx`); in C
  they sit in the dark header as white buttons.

## Decisions baked in (for Ayush to judge)

- **Colour now means something:** pink = brand / action only, green = Accept, amber is reserved for the
  existing Confirmed / golden state. The owner-only margin keeps the "only you" lock idiom from `CardFront`.
- B's terms disclosure and C's tabs are wired with tiny inline JS, so they are clickable in the browser.
- Every dummy field maps to a real one (`hs_deal_number`, `deal_type`, seller/buyer names,
  `delivery_date_target`, `payment_terms_code`, `free_delivery`, line
  `productName/cultivar/batchNumber/thcPercent/cbdPercent/quantity/unitPrice`, `marginPercent`, `thing` rows).

## Next step

Ayush picks A, B, or C (or a mix). Then we build the real `CardFront` / `CardBack` from the chosen
direction. Later: fold the Deal Room entry into the card.
