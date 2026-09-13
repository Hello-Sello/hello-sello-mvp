# 0028 landing-page-refresh — RESEARCH

> `/spec` ran in `--amend` mode (STANDARD lane), which skips the prior-art sweep. This file
> therefore starts at `/design`'s approaches sweep.

## Approaches (design)

*Researcher sweep, 2026-09-07. Every `file:line` below was re-checked by the orchestrator before
being folded into ADR 0010 — checker and researcher findings are claims, not facts.*

### 1. Marketing copy as data vs. as JSX

**Options**

- **(a) Keep copy inline per component** (today's pattern) — `Hero.tsx:28-54` inlines strings
  directly in JSX; `ValueProps.tsx:10-31` uses a module-level `PROPS` array of literals,
  co-located in the same file as the component that renders it. Zero abstraction cost now. Cost
  later: when D-09's reserved German toggle lands, every landing component needs its own
  copy-extraction refactor, one file at a time.
- **(b) A shared `copy.ts` content module** — one file exporting typed copy objects per section.
  Cost now: one new file + import wiring in every touched component. Cost later: a second locale
  is a data swap, not a per-component restructure.
- **(c) Full i18n resource (`next-intl`)** — `[locale]` routing segment, message catalogs,
  `getTranslations()`. next-intl's own docs call this "the default pick… covers routing,
  translations, TypeScript autocompletion, and RSC support" for App Router projects starting
  fresh. Cost now: new routing structure, middleware, message files — for a page that ships
  **English only** with a *reserved* slot (D-09). Cost later: none, it is already the end state.

**What the industry does** — next-intl frames full i18n libraries as the default for App Router
apps that need routing + RSC-aware translation *now*, not as a placeholder for "someday"
(next-intl.dev, App Router getting-started). App Router guidance for static marketing pages
favours keeping structure simple and SSG-first. Neither source recommends standing up an i18n
framework before a second locale actually ships.

**Researcher's recommendation** — (b), a shared landing `copy.ts`.

**⚠️ Orchestrator overrode this — see ADR 0010 §2, D1.** (b) is a speculative abstraction for one
caller: it pays off only when a second locale exists, and when one does, (c) is the real
destination — (b) gets thrown away too. `ValueProps.tsx:10-31`'s co-located `PROPS` array is
already the local idiom; §7a should follow it rather than introduce a second convention.

**Cost to undo in six months** — (a)→(b): mechanical but touches 10+ landing files at once.
(b)→(c): low, since keyed copy objects map onto next-intl message catalogs.

---

### 2. A decorative-but-animated SVG motif in a Server Component tree

**Options**

- **(a) Pure CSS `@keyframes` on server-rendered SVG, no client component.** The repo already
  ships this exact pattern for a comparably decorative auto-looping marketing motif:
  `ProductFlipCard.tsx` has **no `"use client"` directive** and its loop is driven entirely by
  `globals.css:519-538` (`.pcard-inner { animation: pcard-flip 10s … infinite; }`), disabled by a
  `@media (prefers-reduced-motion: reduce)` block at `globals.css:536-538`. Same shape for the
  Aurora blobs (`AuroraBackground.tsx:1-20`, `globals.css:82-104`).
- **(b) A `"use client"` island** — matches `HeroDealFlow.tsx:1` and `Reveal.tsx:1`, both used
  where JS drives the animation's *timeline*. A constant-speed rotation needs none of that.
- **(c) A Lottie / animation library** — no such dependency in `package.json`. PRD FR5 requires
  "built as CSS/SVG" (`docs/PRD/0028-landing-page-refresh.md:47`), so this is ruled out by the
  approved spec, not merely by preference.

**Accessibility obligations** — `aria-hidden="true"` is standard for purely decorative animation
with no semantic content; the repo already does this for `AuroraBackground.tsx:12` and the
prototype's icons (`index.html:249,343`). Separately, **WCAG 2.2.2 (Pause/Stop/Hide, Level A)**
applies to auto-starting motion lasting >5s for *all* users, not only reduced-motion ones. A
decorative, `aria-hidden`, ignorable loop is generally treated as exempt in practice, but this is
a real Level-A criterion. Named as an ADR invariant.

**What W3C / MDN say about `prefers-reduced-motion`** — the query's stated purpose is to minimise
"non-essential" motion (MDN). W3C technique **C39** ("Using the CSS prefers-reduced-motion query
to prevent motion") explicitly endorses reducing to *none* as conforming for non-essential motion
— it does **not** mandate "reduce, never remove". This repo's own convention already picks `none`
for every decorative loop (`.hs-blob-*`, `.pcard-inner`, `.hdf-*`), and PRD AC 6 requires exactly
that computed outcome.

**Recommendation** — (a), pure CSS on server-rendered SVG under a scoped class prefix matching the
`.pcard-` / `.hdf-` / `.hs-blob-` convention. **Not a novel decision — an existing local pattern
applied a fourth time.**

**Cost to undo in six months** — near zero; it converts to a client island the way `Reveal`
already coexists beside server-rendered siblings.

---

### 3. Where `prefers-reduced-motion` should be enforced

**Options**

- **(a) A CSS `@media (prefers-reduced-motion: reduce)` block** targeting the animation class —
  the pattern used everywhere motion is actually shut off here: `globals.css:101-104` (Aurora),
  `:278-282` (deal-card buttons), `:499-503` (HeroDealFlow), `:536-538` (ProductFlipCard).
- **(b) Tailwind's `motion-reduce:` variant** — available (Tailwind v4, `package.json:28,35`, no
  `tailwind.config.*`; v4 is CSS-first). Used **extensively but only for `transition`**:
  `IconRail.tsx:49,70,75,155,257,283,295,400,427,459,532,550` · `TopBar.tsx:54,69` ·
  `ChatView.tsx:287` · `ConversationList.tsx:104,137` · `SettingsNav.tsx:106`. There is **no
  existing `motion-reduce:` precedent applied to a `@keyframes` animation** anywhere in `src/`.
- **(c) JS `matchMedia`** — used in `Reveal.tsx:33` and `HeroDealFlow.tsx:91`, but only where JS
  already drives the timeline. Gating a pure-CSS loop this way adds a client component to answer a
  media query CSS answers natively — a pass-through that hides no complexity.

**Which makes AC 6 reliably true, and what silently cancels it** — L-025
(`docs/agents/LEARNINGS.md:736-770`) documents a *different* mechanism: Chromium drops
`::-webkit-scrollbar` rules when `scrollbar-width`/`scrollbar-color` is set on the same element.
The direct analogue for animation is **selector specificity and cascade order**: the reduce block
must target the element actually carrying the `animation` shorthand, and must not be beaten by a
later or more-specific rule re-declaring `animation` (a hover state, for instance). (a) and (b)
compile to the same computed CSS — the risk is never the mechanism, it is the selector. **This is
why AC 6's "assert the computed value, not a screenshot" is doing the real work.**

**Recommendation** — (a), matching the CSS-keyframe convention already used for every comparable
motif; (b) would be the first use of `motion-reduce:` for `animation` rather than `transition`,
adding a second convention where one already works.

---

### 4. The seam between two stacked bands

**Repo fact, stated exactly — and it corrects the prototype.** `B2BOnlyBand` is **not**
full-bleed. `B2BOnlyBand.tsx:12` wraps the pink gradient in `<section className="px-6 py-6">`;
the gradient lives on an inner `<div className="overflow-hidden rounded-3xl …">`
(`B2BOnlyBand.tsx:14`) inside a `max-w-6xl` `Reveal` (`:13`). **The landing page today has no
full-bleed *band*** — no section paints a full-width block of colour behind its own content, and
both existing "bands" (`B2BOnlyBand.tsx:14`, `FinalCTA.tsx:15`) are `rounded-3xl` cards floating
inside the page's normal horizontal padding.

⚠️ **Corrected after `adr-checker` round 1.** An earlier draft of this line said "every section is
`mx-auto max-w-6xl px-6`". That is an overstatement: `FAQ.tsx:32` is `max-w-3xl`, `page.tsx:64` is
`max-w-5xl`, and `Hero.tsx:17` / `FinalCTA.tsx:12` are full-width sections carrying
`<AuroraBackground />`, which paints `absolute inset-0` (`AuroraBackground.tsx:11-14`) — so a
full-bleed *backdrop* idiom does exist. What is uniform is that every block of **content** sits
inside the page's horizontal padding. The load-bearing half is verified true regardless.

The component's own docstring calls it "the page's signature **full-bleed** gradient band"
(`B2BOnlyBand.tsx:4`) — that phrase is wrong about its own markup, and is the most likely source
of the prototype's mis-modelling (`prototypes/landing-refresh-prototype/index.html:133`, `.band`
is genuinely full-bleed there).

**Consequence** — the open question recorded as "two full-bleed bands stack"
(`STATE.md:69-71`, `NOTES.md:68-70`) rests on a false premise. The real decision is different and
is stated in ADR 0010 §2, D3.

---

### 5. Trust / compliance sections on B2B SaaS landing pages

**What the industry does** — a small badge/pill row (SOC 2, GDPR, ISO 27001) near the CTA as an
"objection-killer" is conventional (SaaS landing-page trust-signal guidance, saashero.net). That
same guidance favours *specific, verifiable* claims over vague generic badges — cutting against a
label-only pill with no supporting detail. Locked variant C is labels-only
(`prototypes/landing-refresh-prototype/index.html:213-219,424` — pills render `ico(i,18)${k}`, the
`v` sentence is dropped), whereas A and B carried a one-line claim each (`:394-395`, `:410-411`).
This was a trade-off Muskan accepted knowingly, and is still flagged open (`STATE.md:73-74`).

**Legal / advertising risk of a bare "GDPR compliant" label** — two frameworks, neither previously
in this repo's docs:

1. **EU UCPD** — trader claims must be "clear, accurate and substantiated"; Art. 12 obliges
   evidence on request. An unsubstantiated compliance claim can itself be unfair *even when the
   underlying practice is genuinely compliant*. UCPD is nominally consumer-facing, and this page is
   explicitly B2B-only (`B2BOnlyBand.tsx:16`).
2. **German UWG § 5** — governs misleading claims about a product's advantages in **both** B2C and
   B2B trade. BGH case law requires substantiation for compliance-type claims; an unsubstantiated
   one is actionable by *Abmahnung from a competitor*, independent of UCPD's consumer scope.
   **This is the framework that actually bites here**, given the B2B exemption locked by
   D-11/D-12/LAND-02.

The PRD already grounds all four claims with real evidence
(`docs/PRD/0028-landing-page-refresh.md:29-34`). The risk is not that the claims are false — it is
that the **shipped page carries no visible substantiation**, only a label. Evidence need not be
on-page, but a bare unqualified badge with nothing adjacent is the weaker posture.

**Note on scope** — this is a *distinct* risk from the one Muskan already overruled at `/spec`
(`STATE.md:77-80`, the legal-pages' "rechtlich noch nicht geprüft" notice vs. platform
compliance). That overrule does not cover this one. Raised in ADR 0010 §2, D4 — **not silently
"improved" during `/design`**, since PRD AC 4 requires only that the four labels appear.

---

### Repo facts

| Fact | Evidence |
|---|---|
| Section spine | `page.tsx:44-86` — `LandingNav` → `Hero`(§2) → §3 logos → `ValueProps`(§4) → `HowItWorks`(§5) → §6 `ProductFlipCard` → `SocialProof`(§7) → `B2BOnlyBand`(§8) → `FAQ`(§9) → `FinalCTA`(§10) → `Footer`(§11) → `CookieBanner` |
| §7a insertion point | between `page.tsx:77` (`<SocialProof />`) and `page.tsx:79` (`<B2BOnlyBand />`) |
| `landing.spec.ts` copy dependencies | **none.** Case 1 asserts a visible `<h1>` without pinning its text (`:71`) — note it is **not** count-blind: Playwright locator assertions are strict, so it already fails on a second `<h1>`. Case 5 asserts `"nicht an Verbraucher"` (`:139`, renders **twice** — `B2BOnlyBand` *and* `Footer`, worked around with `.first()` at `:134-139`); cases 3, 6-12 are chrome / cookie / legal pages. No case asserts Hero headline text, `ValueProps` card copy, or any §-numbered heading. PRD AC 7's claim holds. |
| ⚠️ `landing.spec.ts` is **not** database-free | Case 2 (`:80-89`) signs in as the seeded `alice@greenleaf.test` (`:30-31`, helper `:36-56`). Any ticket bound by AC 7 needs the seeded local Supabase stack — L-004 pass (c) applies after all. |
| Eleven docstrings cite §-numbers | `LandingNav.tsx:8` · `Hero.tsx:7` · `TrustedBy.tsx:4` · `ValueProps.tsx:6` · `HowItWorks.tsx:6` · `ProductFlipCard.tsx:6` · `SocialProof.tsx:6` · `B2BOnlyBand.tsx:4` · `FAQ.tsx:6` · `FinalCTA.tsx:6` · `Footer.tsx:6`. Confirms PRD FR4's "eleven component docstrings" exactly — and confirms `§7a`-not-a-renumber is the cheap move. |
| `ValueProps`' 4 cards referenced nowhere else | grep for card titles hits only `ValueProps.tsx`, `page.tsx`'s import, and docs/prototypes. No test or screenshot asset depends on the count. |
| Tailwind | v4 (`package.json:28,35`), no `tailwind.config.*` (CSS-first). `motion-reduce:` precedent exists **only for `transition`**, never `animation`. |
| Existing CSS-keyframe precedent | `ProductFlipCard.tsx` — server component, no `"use client"` — driven by `globals.css:519-538`, killed by `:536-538`. **The direct precedent for §7a.** |
| Stale headline outside the PRD's scope | `docs/product/PITCH.md:17` still leads `## AI FOR DEALMAKERS` — the headline T01 retires. Flagged, not touched. |
| D-15 premise may be stale | `09-CONTEXT.md:45` names D-15 as "Ayush will redo the final UI". No doc formally retires D-15; per this project's current ownership that premise looks dead. One-line confirmation owed at G3, not assumed. |
