# PLAN — T02 · New §7a "How your data is protected" + the EU star ring

**Slug:** `0028-landing-page-refresh` · **Linear:** DEV-179 · **Size:** M · **depends on:** T01
**Covers:** PRD AC 4, 5, 6, 7 · **ADR invariants:** M4, M4b, M5, M6, M8, M9

---

## 0. What this ticket is

One new server component, one appended CSS block, one line in `page.tsx`, one docstring word.
**No client island, no dependency, no new layout idiom** (ADR D2, D3).

The whole risk surface is **a new CSS class**, which is the exact thing L-025
(`LEARNINGS.md:759-763`) records as being made silently invisible by a stale `.next`.

---

## 1. Files, in runnable order

### 1.1 `src/app/_landing/DataProtection.tsx` — **NEW**. Server component, no `"use client"`.

**Shape (ADR D3): mirror `B2BOnlyBand.tsx:12-14` exactly** —
`<section className="px-6 py-6">` → `<Reveal className="mx-auto max-w-6xl">` →
`<div className="… overflow-hidden rounded-3xl px-8 py-14 text-center">`.
**Contained, not full-bleed.** The prototype draws it full-bleed and **is superseded on this point**.

```
section#data-protection.px-6.py-6
└ Reveal.mx-auto.max-w-6xl                ← reused as-is; reduced-motion + no-JS safe
  └ div.dpb-card.overflow-hidden.rounded-3xl.px-8.py-14.text-center
    ├ div.dpb-ring[aria-hidden]           ← decorative; 12 × span.dpb-star + span.dpb-core
    │                                        core holds the pulsing lock (svg.dpb-lock)
    ├ p   eyebrow  "Security & compliance"       (hand-rolled — NOT SectionHeading)
    ├ h2           "How your data is protected"
    ├ p   sub      one framing line
    └ div grid-cols-1 sm:grid-cols-2 lg:grid-cols-4   ← D4's four-up grid
      └ ×4  icon + <h3> label + <p> supporting sentence
```

**The four claims, character-exact from ADR D4 (§2). Not the prototype's strings** — the prototype
appends clauses (`"end to end of our stack"`, `"It never leaves the EU"`, `"No transatlantic hop"`)
that the ADR dropped. `"end to end of our stack"` in particular re-raises the end-to-end-encryption
reading that `/spec` already had to adjudicate. **Use the ADR's four, not `index.html:354-359`'s.**

| icon | label | supporting sentence |
|---|---|---|
| `Globe` | `GDPR` | `Built to the EU General Data Protection Regulation.` |
| `Lock` | `Data encryption` | `Encrypted in transit and at rest.` |
| `Server` | `Hosted in Germany` | `Every record lives in a German data centre.` |
| `Cpu` | `EU AI models` | `Sella runs on AI models served inside the EU.` |

All four verified to resolve in the installed `lucide-react`. `Globe` matches the prototype's
`#i-flag` sprite (a circle + inner path, i.e. a globe), so this is faithful, not a substitution.

**Copy stays inline in a module-level `CLAIMS` array** — the `PROPS` idiom `ValueProps.tsx:10-31`
already uses (ADR D1). **No `copy.ts`.**

**Why the heading is hand-rolled, not `SectionHeading`** (ADR §2, last subsection):
`SectionHeading` hard-codes `text-brand`/`text-ink` (`:26,29`), neither of which reads on a dark
card, and it wraps **its own `Reveal`** (`:22-24`) — which would nest a `Reveal` inside §7a's.
Adding an `onDark` flag to a shared component to serve one caller is the option-flag smell the ADR
rejects. ~12 lines of local markup instead.

**Stars:** 12 spans, `--dpb-a: {i*30}deg` inline (equal 30° spacing = EU flag correct), each holding
the prototype's one-path star SVG (`index.html` `#i-star`) inlined. `aria-hidden` on the ring.
Inlining the path beats 12 `lucide` component instances and matches the locked geometry exactly.

⚠️ **`<h2>` here, never `<h1>`** — M1 (T01) asserts exactly one `<h1]` page-wide. Labels are `<h3>`.

### 1.2 `src/app/globals.css` — **APPEND ONLY**, one delimited `dpb-` block at EOF

The file is **577 lines**; the block goes after `.speclist-scroll` (`:540-577`).
⚠️ **`.speclist-scroll` is the block L-025 was written about and is deliberately fragile** — the
append must not touch, reorder or reformat a single line of it, nor of `hs-blob-`/`dc-`/`hdf-`/
`pcard-`. Diff must show **pure addition**.

Geometry, ported from `index.html:145-165` with the `dpb-` prefix:

```css
.dpb-card  { background: linear-gradient(120deg,#1a0a2e,var(--color-brand-deep) 55%,#3d0f26); }
.dpb-ring  { --dpb-size: 220px; position: relative; width: var(--dpb-size);
             height: var(--dpb-size); margin: 0 auto;
             animation: dpb-spin 44s linear infinite; }
.dpb-star  { position: absolute; top: 50%; left: 50%; width: 22px; height: 22px;
             margin: -11px 0 0 -11px; color: #ffcc00;
             transform: rotate(var(--dpb-a))
                        translateY(calc(var(--dpb-size) / -2 + 14px))
                        rotate(calc(-1 * var(--dpb-a)));
             animation: dpb-counter 44s linear infinite; }
@keyframes dpb-spin    { to { transform: rotate(360deg); } }
@keyframes dpb-counter { to { transform: rotate(var(--dpb-a))
                                         translateY(calc(var(--dpb-size) / -2 + 14px))
                                         rotate(calc(-1 * var(--dpb-a) - 360deg)); } }
.dpb-core  { /* centred disc, radial brand gradient */ }
.dpb-lock  { animation: dpb-pulse 3.4s ease-in-out infinite; }
@keyframes dpb-pulse   { 0%,100% { transform: scale(1); } 50% { transform: scale(1.09); } }

@media (prefers-reduced-motion: reduce) {
  .dpb-ring, .dpb-star, .dpb-lock { animation: none; }
}
@media (max-width: 480px) { .dpb-ring { --dpb-size: 168px; } }
```

**Three things here are load-bearing and easy to get wrong:**

1. **The reduce rule must name all three selectors.** Ring only ⇒ twelve stars keep turning a full
   360° for a user who asked for no motion. This is what M4's enumeration exists to catch, and it
   is why the prototype's AC-6 evidence **does not transfer** — the prototype used a blunt
   `* { animation: none !important }` kill-switch (`index.html:224-226`) that D2 rejects.
2. **`dpb-counter` must restate the star's whole base transform.** `transform` is one property, so
   the keyframe cannot "add" a rotation — it re-declares `rotate → translateY → rotate` with the
   extra `-360deg`. Any drift between `.dpb-star`'s base transform and the keyframe's makes the
   stars wobble along the ring instead of holding their radius.
3. **`--dpb-size` is set on `.dpb-ring` and *inherited* by `.dpb-star`.** That is why the 480px
   media query can shrink the whole ring by overriding one property on one selector — and why
   `.dpb-star` must **not** carry its own fallback value, which would silently ignore the override.

**Why not `motion-reduce:animate-none`** (ADR §2, written out): `globals.css:1` is
`@import "tailwindcss"` — Tailwind v4, utilities in `@layer utilities`. The appended `dpb-` block is
**unlayered**, and unlayered declarations outrank *every* cascade layer, so the variant would lose
silently. **The option that looks safer is the one that fails silently here.**

### 1.3 `src/app/page.tsx` — one import + one element

`import { DataProtection } from "./_landing/DataProtection";` beside the other `_landing` imports,
and `<DataProtection />` between `:77` (`<SocialProof />`) and `:79` (`<B2BOnlyBand />`).
**Both line numbers verified in the repo at plan time.**

⚠️ **T01 also edits this file** (`:26`'s description). T02 runs after T01 is committed, so this is a
sequential edit to a settled file, not a merge.

**Inserted, never renumbered** (ADR D7): a §-shift would falsify four docstrings (§8-§11) and buy
nothing.

### 1.4 `src/app/_landing/B2BOnlyBand.tsx` — **`:4` docstring, one word, zero JSX**

`"The page's signature full-bleed gradient band"` → drop `full-bleed`. Its own markup (`:12-14`) is
a contained `rounded-3xl` card, so the sentence is false about the file it sits in — and it is the
sentence that mis-led the prototype into drawing two full-bleed bands and manufacturing a "stacking
seam" problem that never existed (ADR §5b ruling 1).

⚠️ **If the diff touches ONE line of this file's JSX, that is out of scope.**

### 1.5 `e2e/landing.spec.ts` — **APPEND ONLY**, cases 17-22 (T01 added 13-16)

| Case | Invariant | Assertion |
|---|---|---|
| 17 | **M6** | `#data-protection` `<h2>` reads `How your data is protected`; in **document order** it sits after `SocialProof`'s `What dealmakers say` heading and **before `B2BOnlyBand`'s `<h2>`** |
| 18 | **M4b** | Default media. Computed `animationName` of `.dpb-ring`, **all 12** `.dpb-star`, and `.dpb-lock` each **≠ `"none"`** and matches `dpb-*` |
| 19 | **M4** | `emulateMedia({ reducedMotion: 'reduce' })`. Same elements → `animationName === "none"`, **and** all four claim labels still visible |
| 20 | **M5** | Fresh context with `javaScriptEnabled: false`. All four labels **and** all four supporting sentences `toBeVisible()` |
| 21 | **M8** | 375×812 viewport → `document.documentElement.scrollWidth <= clientWidth` |
| 22 | **M9** | (covered by running the whole file — 12 pre-existing + 4 from T01 + these) |

**Four traps these tests must dodge:**
- **M6 must NOT anchor on `nicht an Verbraucher`.** It renders **twice** — §8 and the footer
  (`landing.spec.ts:134-139` documents this). Anchored on the text, M6 is satisfied by §7a placed
  anywhere before the *footer*, including **after** `B2BOnlyBand` — the exact thing it exists to
  prevent — and a bare `getByText` throws a strict-mode violation. Anchor on the **`<h2>`**.
  (The footer's German line is a `<p>` at `Footer.tsx:91`, so a heading-role locator is unique.)
- **Never query the `Reveal` wrapper.** `Reveal.tsx:59` carries a permanent
  `transition-all duration-700`; measuring it reads `0.7s` and fails for a reason unrelated to §7a.
  Query `.dpb-ring` / `.dpb-star` / `.dpb-lock` directly.
- **M4 alone is vacuous.** `none` is `animation-name`'s **initial value**, so a §7a that shipped
  completely static passes case 19. Case 18 (M4b) is what makes case 19 mean anything. Both, always.
- **M4b must enumerate all twelve stars, not sample one.** A reduce rule matching
  `.dpb-star:first-child` would pass a sample. One `$$eval` over the whole NodeList.

---

## 2. Runnable order

1. `test-writer` appends cases 17-22 → **confirm all RED** (§7a does not exist).
2. `builder`: `DataProtection.tsx` → `globals.css` → `page.tsx` → `B2BOnlyBand.tsx` docstring.
3. **`rm -rf .next` and restart the dev server** — mandatory here, not hygiene. A stale cache makes
   the new `dpb-` class **absent from `document.styleSheets`**, which fails case 18 and *passes*
   case 19, i.e. it looks like a correct reduced-motion implementation. That is L-025 exactly.
4. `tsc` + `eslint` + `next build`.
5. `test-runner`: the whole `landing.spec.ts` — 12 + 4 (T01) + 6 = **22 green**.

---

## 3. Fence check — must NOT touch

`SocialProof` (no `id` needed — M6 anchors on headings) · `SectionHeading` · `Reveal` ·
`AuroraBackground` · `HeroDealFlow` · `B2BOnlyBand`'s **JSX** · `FAQ`, `FinalCTA`, `Footer`,
`TrustedBy`, `CookieBanner`, `LandingNav` · `HowItWorks` · every existing `globals.css` block ·
`landing.spec.ts` cases 1-16 · T01's `Hero.tsx` / `ValueProps.tsx` edits.

**No migration, no RLS, no RPC, no auth, no server action** → ADR §7b: security S1-S8 **genuinely
N/A**, confirmed by `adr-checker` round 2. The `security` agent is **not** routed for this diff.

---

## 4. Risks

| Risk | Handling |
|---|---|
| Stale `.next` hides the new class → 18 red / 19 falsely green | `rm -rf .next` + restart before believing either (L-025) |
| Reduce rule names the ring only | Case 19 enumerates ring + 12 stars + lock |
| Keyframe/base-transform drift → stars wobble off the ring | Both restate the identical `rotate/translateY/rotate` chain |
| **M8 (case 21) red for a pre-existing reason** | ⚠️ **`git stash` and re-run.** Red *without* 0028's diff = pre-existing bug: **file it, do not fix it inside T02** (ADR §5). Nothing looks likely to trip it, but 375px has never been executed |
| `--dpb-size` fallback duplicated onto `.dpb-star` | Would silently defeat the 480px override; set it once on `.dpb-ring` and let it inherit |
| The dark card hard-codes `#1a0a2e` / `#3d0f26` | Not tokens — the prototype's aubergine/plum gradient ends. Scoped to the `dpb-` block; flagged at G4, not invented |

---

## 5. Open, carried to G4

1. **WCAG 2.2.2 (Pause/Stop/Hide)** — the 44s loop auto-starts with no pause control, for *all*
   users, not only reduced-motion ones. §7a inherits the same unaddressed exposure the Aurora blobs
   and `ProductFlipCard` already carry. **0028 neither worsens nor fixes it** (ADR §6). Named so it
   is a known gap, not an oversight.
2. **J2 / J3 / J5 are Muskan's at G4:** does the dark card read as deliberate emphasis (J2); does
   the ring read as the EU flag rather than a loading spinner (J3); do the dark card and the pink
   band below read as a pair rather than a collision (J5).
