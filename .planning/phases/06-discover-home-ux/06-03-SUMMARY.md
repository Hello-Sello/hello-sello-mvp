---
plan: 06-03
phase: 06-discover-home-ux
status: complete
completed: "2026-06-18"
requirements: [UX-08]
decisions_covered: [D-10]
---

# Plan 06-03 Summary: Hello Sello Brand Logo Wordmark

## What Was Built

Swapped the app-shell wordmark from rendered text (`He//o se//o`) to the real Hello Sello brand logo PNG (D-10).

## Key Files

### Created / Modified
- `public/hello-sello-logo.png` — Brand PNG (73.4 KB, transparent background) copied from `docs/Images/hellosello Vertical No background.png` with a clean, space-free filename.
- `src/shared/ui/Wordmark.tsx` — Rewritten to render an `<img>` via `next/image`. Stacked variant: 44×44 px. Inline variant: 120×40 px. Both use `priority` to avoid LCP warnings in the nav rail. The `stacked` prop signature is preserved — `IconRail.tsx` line 34 (`<Wordmark stacked />`) requires no change.

## Commits

- `a1a73c2` — feat(06-03): swap Wordmark text → real Hello Sello brand logo (D-10)

## Decisions Honored

| Decision | What was done |
|----------|---------------|
| D-10 | Brand PNG copied to `/public` with clean name; Wordmark renders it as `<img>` |

## Self-Check: PASSED

- [x] `public/hello-sello-logo.png` exists on disk (73.4 KB)
- [x] `Wordmark.tsx` contains `hello-sello-logo.png` and preserves `stacked` prop
- [x] `IconRail.tsx` unchanged — still uses `<Wordmark stacked />`
- [x] `npm run build` passes clean
- [ ] Visual UAT (nav rail shows PNG brand mark, not text) — deferred to 06-HUMAN-UAT.md
