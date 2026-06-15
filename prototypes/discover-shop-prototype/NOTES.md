# discover-shop-prototype

**Decides:** how a company's catalogue renders on the in-app Discover profile (`/discover/[companyId]`), for a verified member viewing **before connecting** — slice 4, P5. Open `index.html`, toggle L0/L1/L2 at the top.

## What it shows
- **L0 (locked)** — blurred silhouette cards behind a lock affordance: "12 products. Shares catalogue with connected partners." + Connect CTA. Never a blank/empty void.
- **L1 (price on request)** — full product cards (image, name, specs) with **"Price on request"** in the price slot (grey pill, not alarming) + a sticky shop-level **"Request pricing"** bar (one `pricelist_request`, optional note, "~1 day" reassurance). Per-card "Request pricing →" accelerator feeds the same request.
- **L2 (open)** — same cards, price shown.
- **Tier chip** at the catalogue header names the level + the unlock action in every state (never a dead-end).
- The existing slice-3 Connect block stays above the catalogue.

## Research basis (2026-06-14)
B2B gated-catalogue UX (JOOR connected-only linesheets, Faire/Ankorstore price-gating, Alibaba RFQ, NN/g progressive disclosure): show everything *except* the number; "Price on request" in the price slot; **one** shop-level request (buyers want a list, not per-SKU); tiny form; expectation-setting microcopy; no dead-ends. Full notes in `docs/muskan-build/discover-connect-loop.md` (D6/D7).

## Open design questions for review
1. Grid 2-col vs single-column list?
2. Per-card "Request pricing →" accelerator — keep, or shop-level CTA only (simpler)?
3. L0 — blurred placeholders (current) vs a plain count + lock line (no tease)?
4. Image treatment — cover thumbnail only (current) vs a mini gallery/carousel like Present?
