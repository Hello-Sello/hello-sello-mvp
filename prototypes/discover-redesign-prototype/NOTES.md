# Discover redesign prototype — decision capture (DEV-78)

**Throwaway.** Answers: *what should Marcel's redesigned Discover look like?* before
we touch `src/app/discover/DiscoverDirectory.tsx`. Phase 6 context:
`.planning/phases/06-discover-home-ux/06-CONTEXT.md`.

## Fixed (locked in CONTEXT — all variants honor these)
- 3-zone header band: **left** type-bubbles · **center** title + search · **right** country-bubbles.
- Full-width **unstacked** rows: logo · name · location (City, Country) · tags · request button.
- Bubbles **multi-select** (OR within a group, AND across groups) + name search.
- Closed NON-marketplace; request button is **connect / request-to-enter**, state-aware
  (Request to enter / Requested / Wants to connect / Connected) — NOT pricing.

## Round 1 verdict (2026-06-18)
Muskan: liked **A's structure** but it read **childish**; the two bordered filter
**squares looked weird**; **countries are too many for bubbles** → use a multi-select
dropdown; and a **load-bearing rule surfaced** (see below). Round-1 variants discarded.

## ⚖️ Load-bearing rule — Pharmacy = search-only (Instagram model)
Confirmed against `docs/product/surfaces/DISCOVER.md` (asymmetric visibility lock):
- **Listed = has a public/seller shop** (Cultivator / Wholesaler / Importer).
- **Pharmacies / pure buyers are NOT listed** in the directory and there is **no
  Pharmacy filter**. They are reachable **only by exact name search** ("Found by
  search · not listed" badge). Try searching **"GreenLeaf"** or **"Nordmedis"** in
  the prototype to see a hidden pharmacy surface.
- → This belongs in CONTEXT.md as a Discover decision (D-02 area). Type filter =
  Cultivator · Wholesaler · Importer only.

## Round 2 variants (premium pass — switch with ‹ › or ←/→)
Both keep A's structure (3-zone band, full-width unstacked rows) + research-backed
fixes: no boxes, type **bubbles** (3, no pharmacy), country = **searchable
multi-select dropdown** → removable chips in an **active-filter bar**, real SVG
icons + 2-letter country-code chips (no emoji), restrained pink.

| Key | Name | Difference |
|---|---|---|
| **A** | Editorial (restrained) | Minimal, premium, low-motion. The "less childish" baseline. |
| **B** | Gamified (motion) | Tasteful gamification — bigger bubbles, pop-on-select, live match counter, "N filters on" cue. Marcel's gamification ask, kept premium. |

Research basis: searchable multi-select dropdown + active-filter chip bar are the
2026 standard for >10-option filters (Baymard country-selector; bricxlabs/UXPin
filter patterns); gamification = restraint, not emoji (mockplus guide).

Resize the browser narrow to see the **mobile collapse** (D-04 — still open).

## How to run
Open `index.html` directly in a browser (no server needed — all inline, Tailwind CDN).
```bash
open "prototypes/discover-redesign-prototype/index.html"
```

## ✅ Verdict (2026-06-18)
- **Chosen: Variant A — Editorial**, reskinned to the real app theme (exact
  `globals.css` tokens: pink-glow gradient body + frosted `.glass` cards + brand
  palette). B (gamified) discarded — Muskan wants the restrained look.
- **Country filter:** searchable multi-select dropdown over the **full country
  list** (not just data-present countries); in prod drive from canonical ISO-3166.
- **CTA button:** label is **"Connect"** (not "Request to enter"), premium styling
  (no lock icon, subtle top-highlight + soft brand shadow + ring, arrow). "Connect"
  is also the correct verb — directory CTA creates a `connect` inbox item.
- **Pharmacy rule confirmed:** listed = has a seller-side type; pharmacy-only hidden,
  name-search only ("Found by search · not listed").
- **Mobile collapse (D-04):** the 3-zone band stacks (title+search → type bubbles →
  country dropdown → list); row columns collapse into the name cell. _Confirm on
  final review, but this is the locked direction._
- Next: fold A into `src/app/discover/DiscoverDirectory.tsx` during build; delete this folder.
