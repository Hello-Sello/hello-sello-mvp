# present-redesign-prototype

**Throwaway prototype.** Phase 7 / plan 07-01 / Wave 0. Muskan's prototype-first
rule; UI-SPEC skipped (D-15) — **this prototype IS the visual spec for the React
build.** Open `index.html` directly in a browser (no build, no server).

> **Status: design exploration — 3 variations, pick a direction.** Switch with the
> dark bar at the very top: **A · Editorial** · **B · Wholesale Pro** · **C ·
> Collectible** (default). Everything below re-renders. All three share the real
> app theme (tokens copied from `src/app/globals.css`), the light-glass IconRail,
> the banner, the basket, and the filter bar — they differ in card style + density.

## The three directions (from the web-inspiration brief)

| Variant | Feel | Grid | Card | Best for |
|---|---|---|---|---|
| **A · Editorial Boutique** | airy, brand-forward, image-led | 3-up | big image, hover-reveals qty/add, minimal spec | premium/curated lines, first impression |
| **B · Wholesale Pro** | dense, solid, fast to scan | 5-up (+ List view) | compact, tabular specs, always-visible add | repeat buyers scanning many SKUs |
| **C · Collectible Showcase** *(rec.)* | graded-card identity | 4-up | sheen + grade badge + tilt, flip→COA | differentiated storefront; quality is the pitch |

Recommended: a hybrid of **B + C** — dense & scannable, but each tile carries the
graded-card identity (grade badge always on, subtle sheen, flip-to-COA on demand).

## Muskan's 2026-06-21 feedback — incorporated

- **Compact search** — starts as a 42px icon, expands to ~280px on focus/hover (CSS `:focus-within`, no JS). No more giant search bar.
- **Dropped** the "Present · your shop" title label.
- **`Manage shop ▾`** moved into the top bar; **Add products lives inside it** (with Edit products/media, Import CSV, Edit branding, Manage locations, Share link). Banner is now clean.
- **Animated basket** — count badge **bumps** on add, a product **flies to the cart**, slide-over eases in (`cubic-bezier(.67,.17,.32,.95)`). All gated by `prefers-reduced-motion`.
- **Info chips** — compact glass chips that **expand to the bottom** (`grid-template-rows 0fr→1fr`, staggered row reveal), **transient**: collapse on click-away or ✕ — exactly Marcel's PRESENT-INFOS note.
- **Filters = location AND products** — Location (All/DE/UK) + Category (Flowers/Extracts) + Strain (Indica/Sativa/Hybrid/CBD). ⚠️ **open to discuss** (see below).
- **"Fancy shop, all info"** — drives the whole visual pass.

## Marcel's "PRESENT INFOS" screenshot — decoded

- Both info fields need **more background space for more data**.
- Make them **expand to the bottom** to show more video links, more pages, **3 different warehouse addresses**.
- A **temporary** open link that **collapses on click-away or X**.
→ Implemented as the compact-chip → expand-to-bottom interaction above (3 warehouses, socials, catalogue PDF, etc.).

## What every variant proves

- **Square 4-up grid (UX-02):** `aspect-ratio:1/1` tiles (16:10 in Pro for density).
- **Location + product filters (D-06):** client-side, location × category × strain.
- **Flip card (D-03/04/05):** CSS 3D `rotateY(180deg)` + `backface-visibility`. Front = image + qty stepper + Add + specs; **back (buyer's study view)** = COA/Images/Videos/Other-docs dropdown + **inert R1 Sella "Marktvergleich" (NO number)** + "View full Present page".
- **Per-company basket (UX-03 / D-12):** top-right slide-over, grouped per company, transient, est. total. Store keyed by company so multi-company carts stay separate.
- **Presentation mode (DEV-79 / D-09):** Fullscreen button (`requestFullscreen()`) → hides the left rail.

## What it does NOT prove
- Real data / RLS / Supabase (all fake seed); cross-tenant buyer read (`get_discoverable_shop`, R3); the deal hand-off (`createDeal`, connected-only, D-02/13) + the gated buyer door; media upload UX (R2); download-all; live fullscreen-in-Teams feel.

## Open questions for review
1. **Pick a direction** (A / B / C, or a blend) — the biggest decision.
2. **Filters:** is location + category + strain right, or too many chips? Left filter rail vs top bar?
3. Fidelity to Marcel's DEV-81 mockup + the CARDS board + the ~28-May Drive design (agents can't see these).
4. Should Fullscreen sit in the top bar (current) or back on the banner top-right (Marcel's DEV-54 wording)?
5. Card-back doc buckets (COA/Images/Videos/Other) — right grouping?
