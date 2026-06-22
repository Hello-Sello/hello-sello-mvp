# 04C UI touch — prototype notes

**STATUS: PORTED to the real app on 2026-06-21** (card visuals + form one-tap pick + card-as-leaflet positioning + Damson recolor, all gate-green). Kept for reference only.

**Throwaway.** Answers: how should the 4 quick 04C UI changes LOOK, on the **real app theme** (light pink / dark pink / glass — `src/app/globals.css`), NOT the old `newchat-prototype` palette.

Open `index.html` in a browser. Top bar = a live **deep-pink (maroon) swatch switch** + a **Card / Form** toggle.

## The 4 changes shown

| # | Change | What the prototype shows |
|---|--------|--------------------------|
| 1 | **Maroon too bright** | Live swatch: Current `#76002d` vs **Damson `#7a1638`** (recommended) vs Black Cherry `#631029` vs Mulberry `#8a1742`. One token `--color-brand-deep` drives everything incl. the glass shadow (via `color-mix`). |
| 2 | **Card opens in the chat → disturbing** | Card now renders as a **leaflet over the conversation rail** (`inset:4px 8px 8px`, `glass-strong`) — same place/shape as New chat. Click the `HS-2026-0042` pin in the thread to toggle. |
| 3 | **Header too tall / unprofessional** | Slim ~64px header: calm ink value hero + deep-pink hairline underline + tiny status pill. See **Before/After** strip (old ~118px maroon band vs new). |
| 4 | **Form product pick clunky** | **One-tap batch rail**: each result shows its batches as tap-to-add chips (with that batch's THC/CBD). No modal. Tap → pulse → drops into basket. |

## How it was made
Parallel design workflow (8 agents): maroon recolor + 3 card variants + 3 form variants + 1 design critique. Winners synthesized here.

## Verdict (from critique) — what to PORT
- **Maroon:** `#7a1638` (Damson). Same depth as `#76002d` (AAA white-text) but saturation 100%→~69%, hue nudged toward raspberry. Fallback if it ever looks not-deep-enough: Black Cherry `#631029`. Avoid Mulberry (too close to raspberry).
- **Card:** "Floating glass" header + shell, "Ledger" product lines (single-gradient THC→CBD split bar, right-aligned tabular qty/value), dashed-lock owner-margin strip.
- **Form:** "One-tap batch rail" (Form 2). Lowest friction, single gesture, all batches visible, batch THC/CBD on the tap target.

## Critique fixes already applied here (carry into the real port)
1. `--glass-shadow` derives from the token via `color-mix(... var(--color-brand-deep) 18% ...)` — single source of truth ([globals.css:37](../../src/app/globals.css#L37) is currently a hardcoded `rgba(118,0,45,...)`).
2. No hardcoded brand/maroon `rgba()` — all deep-pink via `var(--color-brand-deep)` / `color-mix`.
3. **Periwinkle (`--color-info`) reserved for CBD only.** Cultivar coding (thumbnails + dots) uses green/violet/teal, not periwinkle. (Old form used purple `#b5179e` / teal `#1b998b` for THC/CBD — replaced with deep-pink THC + periwinkle CBD; **confirm with Ayush**.)
4. Money is calm ink + hairline underline, never on a saturated fill.

## Resolved (and shipped to the app)
- Maroon shade: **Damson `#7a1638`** (live-switchable token; Black Cherry `#631029` is the fallback if it ever reads not-deep-enough).
- THC = deep-pink, CBD = periwinkle (was off-theme purple/teal). **Approved.**
- Conversation rail widened `w-64` → **`w-72`** so the card leaflet breathes.
- The header got a **soft deep-pink glass shade** (Ayush wanted shade, not a plain box) — that's the one change made beyond the prototype.
