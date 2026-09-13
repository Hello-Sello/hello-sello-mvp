# 0028 landing-page-refresh — TICKETS

**ADR:** `docs/architecture/adr/0010-landing-trust-band.md` · **Spec:**
`docs/PRD/0028-landing-page-refresh.md`
**Status:** ✅ **G3 approved 2026-09-07.** Both issues live in Linear:
**[DEV-178](https://linear.app/hellosello/issue/DEV-178) = T01** ·
**[DEV-179](https://linear.app/hellosello/issue/DEV-179) = T02** (blocked by DEV-178).

---

## Sequencing

```
T01 (DEV-178) ──▶ T02 (DEV-179)
```

**`depends on:` T02 depends on T01.** Not a logical dependency — a file one.

**L-004 three-pass check, stated rather than assumed:**

1. **Intersect the declared Files as sets.** `e2e/landing.spec.ts` is in both. → collision.
2. **Add generated/derived artifacts.** No `database.types.ts`, no migration, no seed — L-004's
   classic generated-file trap does not apply. But **`.next` is one**: both tickets' e2e runs read
   it, and it is the exact artifact L-025 (`LEARNINGS.md:759-763`) records as making a new CSS
   class silently invisible. T02's whole risk surface is a new CSS class. **`rm -rf .next` before
   trusting a red result on T02's AC 4.**
3. **Shared resources.** ⚠️ **Corrected — an earlier draft of this file said "no database", and
   that was false.** `landing.spec.ts` case 2 signs in as the seeded `alice@greenleaf.test`
   (`:30-31`, helper `:36-56`, case `:80-89`). AC 7 requires all twelve cases to pass in **both**
   tickets, so **both need the local Supabase stack seeded and running** — 0022's binding
   constraint (one Docker stack per machine) is present, not absent. Separately, both e2e runs
   bind the dev server on the same port.

**Verdict: not worktree-parallel.** Two S/M tickets do not need to be.

---

## T01 — Hero headline + subhead, and §4 recast to three capability cards

**Covers:** AC 1, 2, 3, 7 · **Size: S** · **depends on:** — (none)

### ✅ Unblocked — D5 closed at G3, 2026-09-07
The subtitle ships **corrected**, not verbatim. Copy this string exactly:

> Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI
> platform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.

Note `platform` (not `plattform`) and the **em dash** (not a hyphen). This supersedes PRD AC 2's
verbatim quote.

### Files
| File | Change |
|---|---|
| `src/app/_landing/Hero.tsx` | `<h1>` text (`:30`) + subhead text (`:37-39`). Structure, gradient span, CTAs, `Reveal` delays: unchanged |
| `src/app/page.tsx` | **`:26` `metadata.description` only.** It currently paraphrases the subhead this ticket retires and reuses two retired card titles. Do **not** touch the `export const metadata` declaration itself or the D-01 redirect |
| `src/app/_landing/ValueProps.tsx` | `SectionHeading` props (`:37-39`); `PROPS` 4 → 3 entries (`:10-31`); grid `lg:grid-cols-4` → `lg:grid-cols-3` (`:42`); docstring reframed from "buyer-outcome"; **`id="what-you-can-do"` on the section** (`:35`) — the card-count assertion has no anchor without it |
| `e2e/landing.spec.ts` | **APPEND ONLY.** New cases below. Cases 1-12 untouched |

### EARS acceptance criteria
1. **When** a logged-out visitor loads `/`, **the system shall** render **exactly one** `<h1>`
   element, whose text is `ONE SECURE SPACE FOR EVERY B2B DEAL`.
2. **When** a logged-out visitor loads `/`, **the system shall** render, in the **first `<p>`
   following that `<h1>` in document order**, the subtitle string exactly as approved at G3
   (ADR D5). ⚠️ **Not a CSS sibling** — the `<h1>` and the subhead sit in two *separate* `Reveal`
   wrappers (`Hero.tsx:27-33`, `:35-41`), so `h1 + p` and `h1 ~ p` both match nothing.
3. **When** a logged-out visitor scrolls to §4, **the system shall** present a heading reading
   `What you can do on Hello Sello` and, within `#what-you-can-do`, **exactly three** capability
   cards, naming creating offers and orders, sending deals to customers and suppliers, and trading
   with verified partners.
4. **When** a logged-out visitor loads `/`, **the system shall** serve a
   `<meta name="description">` matching T01's rewritten string, containing **neither**
   `no cross-company leaks` **nor** `documented deals`. *(ADR M10.)*
5. **When** `e2e/landing.spec.ts` runs, **the system shall** pass all **twelve** pre-existing
   cases unchanged.

### Notes for the builder
- **Assert the count, not the presence.** AC 1's contract is `count() === 1` (ADR M1) — name it
  explicitly rather than leaning on Playwright's strict-mode resolution. ⚠️ An earlier draft of
  this note claimed existing case 1 "passes with two `<h1>`s". **That is false** — Playwright
  locator assertions are strict, so `landing.spec.ts:71` already fails on a second h1. M1 is still
  worth writing; the reason given for it was wrong.
- `SectionHeading` emits `<h2>` only and must stay that way (`SectionHeading.tsx:7-8`).
- **The kept card's real title is `Verified partners only`** (`ValueProps.tsx:13`). The prototype
  notes paraphrase it as "Trade with verified partners" — that string does not exist in the repo.
- The three retired card **titles** are referenced by no test, screenshot or fixture. But two of
  their *phrases* survive elsewhere and are **deliberately out of scope**: `page.tsx:26` contains
  both "no cross-company leaks" and "documented deals", and `HowItWorks.tsx:20` uses the former in
  a different sentence. A grep-based cleanup sweep will hit both. Leave them.
- **Copy stays inline** (ADR D1). Do not extract a `copy.ts`.

### INVEST
**I** — no dependency · **N** — the copy string is the negotiable part (D5) · **V** — the page
states the real positioning · **E** — two files, both read · **S** — S · **T** — four assertions,
all mechanical.

---

## T02 — New §7a "How your data is protected" + the EU star ring

**Covers:** AC 4, 5, 6, 7 · **Size: M** · **depends on:** T01

### ✅ Unblocked — D4 closed at G3, 2026-09-07
**Four-up grid of label + one supporting sentence, not a pill row.** Copy these four exactly —
they are the PRD's verified grounding text (`docs/PRD/0028-landing-page-refresh.md:29-34`):

| Claim | Supporting line |
|---|---|
| GDPR | Built to the EU General Data Protection Regulation. |
| Data encryption | Encrypted in transit and at rest. |
| Hosted in Germany | Every record lives in a German data centre. |
| EU AI models | Sella runs on AI models served inside the EU. |

⚠️ **This is the SECOND departure from prototype variant C** (the first is containment, D3). The
claim treatment is now variant **A**'s grid, rendered on **C**'s dark card. §7a is taller than
`variant-C.png`.

### Files
| File | Change |
|---|---|
| `src/app/_landing/DataProtection.tsx` | **NEW.** Server component. No `"use client"` |
| `src/app/_landing/B2BOnlyBand.tsx` | **`:4` docstring ONLY** — drop the word "full-bleed", which is false about its own markup. ⚠️ **If the diff touches one line of its JSX, that is out of scope** |
| `src/app/globals.css` | **APPEND ONLY.** One delimited `dpb-` block. Must not reformat the `hs-blob-` / `dc-` / `hdf-` / `pcard-` blocks it sits beside |
| `src/app/page.tsx` | One import + `<DataProtection />` between `:77` and `:79` |
| `e2e/landing.spec.ts` | **APPEND ONLY** |

### EARS acceptance criteria
1. **When** a logged-out visitor scrolls past the testimonials, **the system shall** present a
   section headed `How your data is protected`, positioned after `SocialProof` and before the
   `nicht an Verbraucher` band.
2. **When** that section renders, **the system shall** display all four claims — GDPR, data
   encryption, hosted in Germany, EU AI models — **each with its supporting sentence** (D4).
3. **When** that section renders and motion is permitted, **the system shall** resolve the
   computed `animationName` of the ring, **all twelve stars**, and the lock to their `dpb-*`
   keyframe names — i.e. **not** `none`. *(ADR M4b. This is the assertion that proves the
   animation exists at all; without it, criterion 4 passes on a section that never animated.)*
4. **When** `prefers-reduced-motion: reduce` is set, **the system shall** resolve the computed
   `animationName` of **all of those elements** to `none`, and **shall** keep all four claim
   labels visible.
5. **When** JavaScript is disabled, **the system shall** still render all four claim labels **and
   their four supporting sentences** visibly (`toBeVisible`, not mere presence).
6. **When** the viewport is 375px wide, **the system shall not** produce horizontal document
   overflow (`scrollWidth <= clientWidth`). ⚠️ **If this goes red, check it against a stashed
   tree first** — it asserts a whole-document property that no in-scope file may be able to fix.
   Red without 0028's diff = pre-existing bug: file it, do not fix it inside T02.
7. **When** `e2e/landing.spec.ts` runs, **the system shall** pass all twelve pre-existing cases.

### Notes for the builder
- **Copy `ProductFlipCard`'s shape, not `HeroDealFlow`'s.** Server component + scoped keyframes in
  `globals.css` + a `@media (prefers-reduced-motion: reduce)` block (`globals.css:519-538` is the
  template). No client island (ADR D2).
- **Contained rounded card, NOT full-bleed** (ADR D3 — Muskan, 2026-09-07). Mirror
  `B2BOnlyBand.tsx:12-14`'s wrapper shape. ⚠️ The prototype draws this full-bleed; **the prototype
  is superseded on this point**.
- **There are THREE animations, and the reduce rule must name all three:** ring rotation, per-star
  counter-rotation, lock pulse. A rule that stops only the ring leaves twelve stars turning
  through a full 360° for a reduced-motion user.
- ⚠️ **The prototype's AC-6 evidence does not transfer.** It passed using a blunt universal
  kill-switch (`index.html:224-226`, `* { animation: none !important }`). ADR D2 mandates a
  **scoped** `dpb-` block instead, matching `globals.css:101-104`. Different mechanism, different
  failure mode.
- **`none` is `animation-name`'s initial value.** An element with no animation rule returns
  `"none"`, so criterion 4 alone passes when the CSS never loaded. Criterion 3 (M4b) is what makes
  criterion 4 mean something. `rm -rf .next` before believing either (L-025's second trap,
  `LEARNINGS.md:759-763`).
- **Query the ring, star and lock — never the `Reveal` wrapper.** `Reveal.tsx:59` carries a
  permanent `transition-all duration-700`; measuring the wrapper reads `0.7s` and fails for a
  reason unrelated to §7a.
- Ring geometry: 12 stars, equal 30° spacing (EU flag correct). `aria-hidden` on the decorative
  SVG.
- Wrap the card in `Reveal` — it is already reduced-motion- and no-JS-safe (`Reveal.tsx:13-17`),
  and its `translate-y-4` is vertical so it cannot feed criterion 6's horizontal overflow.
- Carry `id="data-protection"` on the section — criterion 1's DOM-order anchor. **Anchor the order
  assertion on `B2BOnlyBand`'s `<h2>`, not on the text `nicht an Verbraucher`**, which renders
  twice (`landing.spec.ts:134-139`).
- Do **not** reuse `SectionHeading` — it hard-codes `text-brand`/`text-ink` (unreadable on dark)
  and wraps its own `Reveal` (ADR §2). Hand-roll the eyebrow + `<h2>`.

### INVEST
**I** — depends only on T01's spec-file edit landing first · **N** — D4 is the negotiable part ·
**V** — the page's first factually-grounded compliance content · **E** — one new file, one CSS
append, one line in `page.tsx` · **S** — M · **T** — six assertions, all mechanical.

---

## Not tickets

| Raised | Why it is not a ticket here |
|---|---|
| ✅ **Done at `/design`, not build work:** ADR 0010's row in `ADR-INDEX.md`; the full-bleed amendment banner in the prototype's `NOTES.md`; `STATE.md`'s `Locked` correction | Documentation the checker caught being *claimed* done while undone. Listed here so it is carried by something, not just asserted |
| `docs/product/PITCH.md:17` still says `AI FOR DEALMAKERS` | ✅ **Ruled at G3: leave it stale.** Written pitch doc, not code; nothing a visitor sees depends on it |
| `prototypes/landing-prototype/` still shows the old §4 | Superseded-prototype bookkeeping, not build work |
| Deleting variants A/B, `.check.mjs`, and the PNGs from the refresh prototype | Cleanup owed at `/ship`, per `NOTES.md:75-77` |
| WCAG 2.2.2 Pause/Stop/Hide exposure | Pre-existing across Aurora + ProductFlipCard; 0028 neither worsens nor fixes it (ADR §6) |
| A video asset (Marcel's seed item 3) | Deferred at `/spec` — `HeroDealFlow` already fills the slot |
