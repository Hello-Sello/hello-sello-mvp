# Strip (S1) + Sella mark (B3) — PROTOTYPE DONE

> **STATUS: prototype LOCKED (2026-06-20).** This folder is the canonical source for
> **S1 (the Strip)** and **B3 (the Sella `//` mark)**. "Good enough" by Ayush's call —
> not pixel-perfect; he will narrate the finer points with a screenshot at GSD build time.
> Build = port this shape into the real `src/modules/deals/components/DealPin.tsx`.

## What it is

The Strip is the thin header that wraps the top of an open chat thread — the deal's
home inside the conversation. It is a **two-tier header**.

### Top tier
- Rounded-square grey **avatar** (with a green presence dot) + the person **name** (bold).
  No "P2P" label, no company line under the name.
- Right side, pink pills:
  - **Relationship** pill = a relationship icon + the **other company's name**; a button
    (no arrow) → the relationship page.
  - **Deals** dropdown pill = shows the **selected deal number** (`HS-2041 ▾`); the menu
    lists the latest 3 deals (latest selected by default) + "See all".
  - **Three-dot** overflow menu (placeholder).

### Bottom tier
- **Left:** a segmented box **[⌂ Deal Room | ▭ Deal Card]** — two buttons, icon + label,
  opening two different things. (Deal Room is UI-only in the prototype.)
- **Middle — Sella (B3):** the `//` mark as CSS-drawn **parallel bars** (not a glyph, not
  the old AI-sparkle pill, no "Review" wording). When something is pending a **dot**
  appears on the bars; clicking drops a **curtain** (animated) with the change inside
  (the change card + Accept/Decline + notifications). Clicking again closes it.
- **Right:** a **translator** icon (placeholder, no behaviour) — this took the old
  "Workspace" slot. Workspace itself is renamed **Deal Room** and moved into the left box.

## How we got here
- Round 1 (A/B/C): Ayush picked **A — two-tier header**.
- Round 2 (A1–A4): explored the bottom tier (built by 4 parallel design agents).
- Round 3: Ayush gave a hand sketch + two screenshots and locked this one faithful build.

## Notes for the build
- The `//` parallel-bars idea was carried over from `prototypes/sella-mark-prototype/`
  (whose 3 logo variants are NOT chosen — that folder is superseded).
- Two wording details Ayush will finalise at build time (left as-is here): the Deals pill
  shows the deal number vs. the literal word "Deals"; and whether the Relationship pill
  keeps its small icon.
- `//` is the He//o Se//o brand mark — correct for Sella, never for the relationship mark.

**How to run:** open `index.html`. Use the State toggle (Quiet / Something pending) to see
the dot + curtain. Animations are indicative, not the real ones.
