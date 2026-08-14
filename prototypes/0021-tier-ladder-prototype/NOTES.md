# 0021 · Tier ladder prototype — notes

**Spec:** `docs/PRD/0021-tier-ladder.md` (G1-approved 2026-08-14)
**Gate:** G2 — Muskan picks a buyer-dropdown variant. This file records the verdict.

## What it shows

A faithful replica of the current `ProductCard.tsx` (colors, strip, spec rows, footer)
with the 3-tier ladder added. Fake data: base €4.50/g · 500g→€4.20 · 1000g→€3.90 ·
2000g→€3.50. Packs 10/25/50g; grams = qty × pack.

- **Buyer/seller view** — 3 variants of the dropdown (A beside price · B inline panel ·
  C price-as-trigger). All three demo: pick a rung → quantity pre-fills; stepper crosses
  a threshold → price + green chip re-resolve automatically (spec rule 6).
- **Seller edit** — base price untouched; tier rows styled like the lot rows; ascending
  validation (red row + Save disabled); "+ Add tier" disabled at 3; Save → flips to the
  read view (seller sees what the buyer sees, rule 3a).

## Verdict

- **Variant chosen:** **B — "See all prices" inline panel** (G2, Muskan, 2026-08-14)
- **Changes asked:** none at G2. Variant B as prototyped = the G4 visual contract.
