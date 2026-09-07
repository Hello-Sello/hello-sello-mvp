# 0028 — Landing page refresh

**Slug:** 0028-landing-page-refresh · **Lane:** STANDARD · **Seed:** Marcel, Linear DEV-164
**Amends:** the Phase-9 landing spec (`.planning/phases/09-public-landing-legal-pages/09-CONTEXT.md`)
— D-05's locked section spine and D-15's "copy is interim, restyle/refill friendly". This file is
the tracked WHAT; 09-CONTEXT.md is gitignored and stays as-is.

## Problem

The landing page ships interim placeholder copy (D-15, `Hero.tsx:13`). Marcel supplied the real
positioning: a new headline, a subtitle that leads on EU/Germany data protection, a capability
section, and a dedicated "how your data is protected" section. The page today has no
security/GDPR section at all — D-05's spine goes §7 social proof → §8 B2B-only band.

## In / Out for v1

**In** — hero headline · hero subtitle · §4 recast from "why" to "what you can do" · a new §7a
"How your data is protected" · a stars-and-locks animation inside §7a.

**Out** — a video asset (seed item 3; `HeroDealFlow` already fills the hero's product-visual slot
— Muskan's ruling 2026-09-07) · German translation (D-09: English copy, toggle slot stays
reserved) · any change to the legal pages, cookie banner, or B2B band · restyling.

## Copy claims — grounding

Marcel's subtitle and §7a state four facts. Verified while writing this spec, so §7a's section
content has a factual base rather than marketing filler:

| Claim | Evidence |
|---|---|
| All data hosted in Germany | Prod Supabase `byipusuthdlskdxoexkt` is `eu-central-1` (AWS Frankfurt) |
| EU AI models | `bedrock.ts:26` `REGION = "eu-central-1"`; models are `eu.anthropic.*` EU inference profiles |
| GDPR compliant | Confirmed by Muskan 2026-09-07 |
| Encrypted chat | TLS in transit, encrypted at rest (Supabase Postgres + Storage) |

## Functional requirements

1. The hero `<h1>` reads **ONE SECURE SPACE FOR EVERY B2B DEAL**.
2. ~~The hero subhead carries Marcel's subtitle verbatim (see AC 2).~~
   ⚠️ **SUPERSEDED at G3, 2026-09-07 (ADR 0010 D5).** The subtitle ships **corrected**, not
   verbatim — `platform` (not `plattform`) and an em dash (not a hyphen). See AC 2.
3. §4 is recast from benefit framing ("Why Hello Sello / Built for safe B2B trade") to capability
   framing: creating offers and orders, and sending deals and orders to all your customers and
   suppliers.
4. A new **§7a "How your data is protected"** sits between §7 social proof and §8 B2B-only band,
   naming: GDPR · data encryption · hosted in Germany · EU AI models.
   *§7a, not a renumber — renumbering §8–§11 would invalidate the section references in eleven
   component docstrings for no gain.*
5. §7a carries a European-stars-and-locks animation, built as CSS/SVG.

## I/O

No inputs, no DB reads, no API calls. Static server-rendered markup at `/`. `page.tsx` stays a
server component (its `metadata` export and the D-01 redirect both depend on it); anything needing
JS mounts as a `"use client"` island, as `Reveal` and `CookieBanner` already do.

## Constraints

- **Exactly one `<h1>` on the page.** e2e `landing.spec.ts` case 1 asserts a visible level-1
  heading; the Hero owns it. §7a uses `<h2>`/`<h3>`.
- **Reduced-motion safe by construction**, matching `Reveal.tsx:33` — content is server-rendered in
  its final visible state and motion is added only after mount for motion-OK users.
- Copy is English (D-09). The verbatim German `nicht an Verbraucher` (LAND-02) is untouched.
- No new binary/video assets.

## Edge cases

- `prefers-reduced-motion: reduce` — §7a fully readable, animation static.
- JavaScript disabled — §7a's four claims still render.
- Signed-in visitor never sees any of this (D-01 redirects `/` → `/home`).
- Narrow viewport — the stars/locks motif must not overflow horizontally.

## Acceptance criteria

1. Logged out, open `/` → the page has exactly one `<h1>` and it reads
   "ONE SECURE SPACE FOR EVERY B2B DEAL".
2. ⚠️ **SUPERSEDED at G3, 2026-09-07 (ADR 0010 D5) — walk the corrected string below, not the
   struck one.** Muskan ruled both of Marcel's typos corrected, so this criterion's original
   verbatim quote would fail against a page that is right.

   ~~"Turn daily conversations into structured deals - together. Your fully EU GDPR compliant AI
   plattform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany."~~

   **The string that ships, and the one G4/G5 walk** (note `platform` and the em dash):

   > Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI
   > platform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.

   *(This is also what invariant M2 and `landing.spec.ts` case 14 bind to.)*
3. Scroll to §4 → its heading reads "What you can do on Hello Sello", and its cards name creating
   offers and orders, and sending deals to customers and suppliers.
4. Continue scrolling → a section headed "How your data is protected" appears after the
   testimonials and before the "nicht an Verbraucher" band, showing all four claims: GDPR, data
   encryption, hosted in Germany, EU AI models.
5. That section shows a moving stars-and-locks animation.
6. Re-open `/` with `prefers-reduced-motion: reduce` emulated → all four claims still render, and
   the animated element's computed animation/transition resolves to none. *Assert the computed
   value, not a screenshot (L-025).*
7. Re-run `e2e/landing.spec.ts` → all 12 existing cases still pass.

## Tickets

- **T01** — copy swap on existing components (Hero `<h1>` + subhead, §4 recast). AC 1–3, 7.
- **T02** — new §7a section + stars/locks animation. AC 4–6, 7.
