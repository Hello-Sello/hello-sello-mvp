# Deal Basket prototype — slide-over drawer (Variant A, chosen)

**Question:** What should the persistent, app-wide, cross-company basket look like, and how does turning it into a deal card (per seller) feel?

**Open:** `prototypes/deal-basket-prototype/index.html` in a browser. Tokens mirror `src/app/globals.css` + `present-redesign-prototype` (raspberry `#e30b5d`, damson `#7a1638`, frosted glass). Throwaway — no React, no persistence.

## Decision: Variant A — slide-over drawer
Basket icon (top-right, beside the bell, per DEV-95) opens a right-side drawer. Refined to be **compact**: no chunky boxes, hairline separators, precise spacing.

## How it works
- **Collapsible seller accordions** — click a shop name (e.g. "GreenLeaf Cultivation") to expand/collapse its selected products. Closing keeps the count + subtotal visible.
- **One offer per seller** — each shop group has its own "Offer deal card" button.
- **Real round +/- steppers** (mirror `.pc-stepper` from the app).
- **One slim note line per seller** — a single thin input (you edit yours); the other side's note shows as a small italic line above it.
- **Public price vs "Seller to price"** — Amnesia shows a public €/g; White Widow shows *"Seller to price · request"*.
- **No-batch never blocks** — White Widow carries a small "No batch" badge but is still offerable (HEL-20/17).
- **"Coming soon" pre-sell** — Pink Kush carries the amber "Coming soon" badge (DEV-84).

## Verdict
- **Chosen:** A — slide-over drawer, compact + collapsible.
- **Open tweaks to confirm on view:** _(fill in — spacing, where subtotal sits when collapsed, note width, etc.)_
