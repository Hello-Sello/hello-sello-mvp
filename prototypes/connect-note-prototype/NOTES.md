# Prototype — Connect with a note (note-capture UI)

**Question:** When sending a connect request from a company's Discover profile, how should the optional LinkedIn-style note be captured?

**Run:** open `index.html` in a browser (no server).

## Explored (then collapsed to the winner — Unified)
- **A — Inline expand:** two buttons (Connect / Connect with a note); the note button expands a textarea inline under the buttons.
- **B — Modal dialog:** two buttons; the note button opens a centered modal with the textarea.
- **C — Unified compose:** one card with an always-visible optional note + a single "Send request" (empty → plain `connect`, filled → `connect_message`).

Each simulates the flow: default → compose → sending → "Request sent". The "Other states" row shows the connected / incoming CTA styles for reference.

## Context
- For slice 3 of the Discover→Connect loop (`docs/muskan-build/discover-connect-loop.md`).
- The winner gets folded into the real `src/app/discover/[companyId]/ConnectActions.tsx`, where the send becomes a real `INSERT` into `pending_inbox_item` (type `connect` / `connect_message`).
- Tokens approximate the app's glass/pink system (raspberry brand, glass surfaces, rounded-2xl).

## Verdict
**Unified (C) chosen, simplified (2026-06-14):** one **Connect** button + a *little* optional note textbox, always visible (empty → plain `connect`, filled → `connect_message`). No separate "with a note" button, no modal. **Built** into `src/app/discover/[companyId]/ConnectActions.tsx` + the profile header in slice 3 (2026-06-14). Kept here as design reference.
