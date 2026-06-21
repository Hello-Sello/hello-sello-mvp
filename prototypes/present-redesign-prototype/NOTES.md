# present-redesign-prototype

**Throwaway prototype.** Built 2026-06-21 (Phase 7, plan 07-01, Wave 0). Muskan's
prototype-first rule; UI-SPEC is deliberately skipped (D-15) — **this prototype IS
the visual spec for the React build.** Open `index.html` directly in a browser
(no build step, no server).

**Decides:** the full Present rebuild (DEV-81 products · DEV-80 infos · DEV-79
header) per Marcel's "CARDS" design board + the 2026-06-21 lock.

## What it proves

- **Square 4-up grid (UX-02):** `repeat(4)` at the top breakpoint, each tile
  `aspect-ratio:1/1` + `object-fit:cover`. Responsive down to 2-up.
- **Location tabs (D-06):** Germany | UK | All filter the grid client-side. One
  product sits in one location (default; multi-location deferred).
- **Flippable product card (D-03):** CSS 3D `rotateY(180deg)` +
  `transform-style:preserve-3d` + `backface-visibility:hidden`. Front ↔ back flip
  feels right; the flip control sits top-right.
- **Card FRONT (D-04):** image carousel (arrows + dots) · qty +/− stepper ·
  "Add to basket" · spec table (THC/CBD, cultivar, dominance, origin/region,
  irradiation, pack).
- **Card BACK (D-05, buyer's study view):** COA/Images/Videos/Other-docs dropdown
  + a scrollable "View full Present page" link + the **inert R1 Sella stub**.
- **R1 Sella stub (T-07-01):** a labelled "Marktvergleich" box with **NO number** —
  static copy, identical for every viewer (Sella-neutrality by construction).
- **Per-company basket (UX-03 / D-12):** top-right panel, lines grouped per
  company, transient (clears on reload). Two companies in the seed (GreenLeaf +
  BloomPartner) demo the per-company separation.
- **Banner controls (DEV-79 / D-09):** +Add products, Manage shop, and a
  **Fullscreen** button (`document.documentElement.requestFullscreen()`) that
  hides the left sidebar — the Presentation mode demo.
- **Expandable info cards (DEV-80 / D-10):** HQ/warehouse + links cards expand on
  click (multiple warehouses, more links) and collapse on click-away / ✕.

## What it does NOT prove

- **Real data / RLS / Supabase** — all products are fake seed; no network, no auth.
- **Cross-tenant buyer read** — the `get_discoverable_shop` RPC gate (R3) is not
  exercised; the back is shown as if the buyer already has access.
- **Deal hand-off** — "Build deal →" is inert. The seller→deal seam (`createDeal`,
  connected-only, D-02/D-13) and the buyer-door gap (no `source:"shop"` yet, gated
  on Ayush) are out of scope here.
- **Media upload UX** — COA/doc/video links are static placeholders; the
  client-direct `shop-media` upload + the MIME-allowlist widen (R2) are not built.
- **Download-all** — not mocked (Claude's-discretion; sequential vs zip settled
  in the build, not here).
- **Fullscreen in Teams/Zoom** — the API call is real, but the live-presentation
  feel is a human-UAT item.

## Decisions it settles

- **Grid breakpoints:** 2-up (mobile) → 3-up (≥760px) → 4-up (≥1080px). Square
  tiles throughout.
- **Flip mechanic:** pure CSS 3D flip (no library) — confirms RESEARCH's
  "don't add framer-motion for one card".
- **Square treatment:** `aspect-ratio:1/1` + `object-fit:cover` (crop, not letterbox).
- **Basket placement:** fixed top-right, per-company groups, floating FAB when closed.
- **Sella stub framing:** inert "available on request / coming soon" copy — no
  value rendered (locks the R1 v1 posture visually).
- **Info-card interaction:** click-to-expand, ✕-or-click-away to collapse.

## Open questions for Muskan's review (eyeball vs Marcel's sources)

1. Fidelity to Marcel's DEV-81 mockup image (Linear) + the "CARDS" board + the
   finalized Present design on Google Drive (~28 May) — agents can't see these.
2. Card-back dropdown grouping (COA/Images/Videos/Other) — right buckets?
3. Spec-table field set on the front — enough, too much, reorder?
4. Square crop vs a contained image — does crop lose label detail Marcel wants?
