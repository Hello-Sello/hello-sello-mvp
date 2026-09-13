# ADR 0010 — The trust band is a claim, not a graphic: §7a reuses the page's card idiom and the repo's existing CSS-motion pattern, adding no new mechanism

**Status:** Proposed (G3, 2026-09-07) · **Slug:** `0028-landing-page-refresh`
**Spec:** `docs/PRD/0028-landing-page-refresh.md` · **Research:**
`docs/muskan-build/0028-landing-page-refresh/RESEARCH.md`
**Revision:** rev 4 — checker rounds 1 + 2 folded in (32 findings, 3 blocking), then G3's rulings
on D4, D5 and the two doc fixes. See §7.
**Amends:** the Phase-9 landing spec (D-05 section spine, D-15 "copy is interim") · **PRD
constraint 2** (§2, D2 — motion mechanism) · **PRD AC 2** (§2, D5 — the subtitle's two typos
corrected, so AC 2's verbatim quote is superseded) · **PRD AC 4** in effect (§2, D4 — the four
claims now carry supporting sentences; AC 4's floor of "the four claims appear" is unchanged)
**Walks away from:** `prototypes/landing-refresh-prototype/` variant C's **full-bleed** treatment
(locked 2026-09-07, unlocked the same day at G3-prep — see §2, D3). Variant C's dark palette, EU
star ring and 3-card §4 all stand.

---

## 1. In plain English — read this part first

### What this slug actually is

Marcel wrote new words for the front page and asked for one new block on it. That is the whole
job. There is no database, no login, no API — a logged-out visitor loads `/` and reads text.

So the interesting question is **not** "how do we build it." It is **"how much new machinery are
we allowed to introduce for a text change?"** The answer this ADR gives is: **none.** Every piece
of §7a already has a working precedent in this repo, and this ADR's job is to name which one, so
the builder copies rather than invents.

### The one thing everybody got wrong, including the prototype

The prototype drew §7a as a **full-bleed** dark band — edge to edge, no margins — and drew the
pink "B2B only" band underneath it the same way. Two full-bleed bands stacking with a hard seam
between them was recorded as an open problem for this gate.

**The pink band is not full-bleed.** It is a rounded card sitting inside the page's normal
margins (`B2BOnlyBand.tsx:12-14`). The prototype inherited the error from the component's own
comment, which describes itself as *"the page's signature full-bleed gradient band"*
(`B2BOnlyBand.tsx:4`) while its markup says the opposite.

**Stated precisely, because a looser version of this sentence is wrong:** the landing page has no
edge-to-edge *band* — no section paints a full-width block of colour behind its own content. It
does have a full-bleed *backdrop* idiom: `Hero.tsx:17` and `FinalCTA.tsx:12` are full-width
sections carrying `<AuroraBackground />`, which renders `absolute inset-0`
(`AuroraBackground.tsx:11-14`). Section widths also vary — `FAQ.tsx:32` is `max-w-3xl`,
`page.tsx:64` is `max-w-5xl`. What is uniform is that **every block of *content* sits inside the
page's horizontal padding**, and both existing coloured bands (`B2BOnlyBand.tsx:14`,
`FinalCTA.tsx:15`) are `rounded-3xl` cards.

This is L-006 in miniature: **a comment is not a contract.** The prototype trusted the prose and
mis-drew the page it was supposed to be judged against.

### What each option means for the product

| | What the visitor sees | What it costs later |
|---|---|---|
| **Full-bleed dark band** (prototype C) | The loudest block on the page, and the only one whose *content* touches the screen edges | Introduces a layout idiom used nowhere else. Every future band has to decide whether to match it. Mobile overflow becomes a permanent test surface. |
| **Contained dark card** ✅ | A dark card the same shape as the pink band below it — still the only dark block on a light page, so it still reads as a statement | Nothing. It is the idiom the page already has, applied a third time. |

**Muskan ruled for the contained card, 2026-09-07.** It removes the seam problem by deleting the
premise rather than patching it, and costs the design almost nothing: on a page that is white
from top to bottom, *dark* is the contrast that carries the emphasis, not *width*.

### What breaks if we pick wrong

- **If we invent a copy-management layer** (a shared `copy.ts`) we pay for a German toggle that
  does not exist and has no date, and we throw that layer away anyway the day a real second
  locale lands — because at that point `next-intl` is the destination, not a hand-rolled object.
- **If we make §7a a client component** we put JavaScript in the way of four compliance claims.
  A visitor with JS blocked would read nothing, and PRD AC 4 would be false in exactly the case
  that matters most (a security-conscious visitor).
- **If we get reduced-motion wrong** the failure is silent — the rule looks correct in the diff
  and does nothing in the browser. This is L-025's exact shape, which is why AC 6 asserts a
  **computed value** rather than a screenshot.
- **If we ship four compliance labels with nothing behind them**, the exposure is not GDPR — it
  is **UWG § 5** (German unfair-competition law), which reaches B2B trade and is enforced by
  competitor *Abmahnung*. See §2, D4.

### How the industry does this

- **Decorative looping motif in a React Server Component tree** — pure CSS `@keyframes` on
  server-rendered markup, no client island. W3C technique **C39** confirms that reducing motion
  to `none` under `prefers-reduced-motion` is conforming for non-essential motion; MDN frames the
  query as minimising "non-essential" motion. Both the standard and this repo already agree.
- **Copy for a single-locale marketing page** — `next-intl`'s own docs position a full i18n
  framework as the pick for apps that need routing + RSC translation *now*, not as a placeholder.
- **Trust/compliance sections** — a badge or pill row near the CTA is the convention; the same
  guidance prefers *specific, verifiable* claims over bare badges.

### Recommendation, in one sentence

**Build §7a the way `ProductFlipCard` is already built** — a server component whose motion lives
in scoped `@keyframes` in `globals.css` with a `prefers-reduced-motion` block beside it — and put
it in the same rounded-card wrapper the page already uses twice, so 0028 adds one component and
one CSS block and no new ideas at all.

---

## 2. The decisions

### D1 — Copy stays where it renders. No `copy.ts`, no i18n framework.

Hero's strings stay inline (`Hero.tsx:28-54`). §4's strings stay in `ValueProps.tsx`'s
module-level `PROPS` array (`ValueProps.tsx:10-31`). §7a's four claims use **the same co-located
array idiom**, in its own file.

**This overrides the researcher's recommendation**, which was a shared `copy.ts`. The reason: a
copy module is a *thin* module — it hides no complexity, it only moves strings further from the
markup that uses them, and it serves exactly one caller-class that does not exist yet. When a
second locale genuinely arrives, `next-intl` replaces it wholesale, so the extraction work is
paid twice. Deferring costs a mechanical multi-file edit *once*, at a moment when we will be
editing every landing file anyway.

**One correction to how this ADR first justified itself.** Round 1 dismissed D-09 as "a nav
affordance, not a copy architecture." That misdescribes it. D-09 is a **copy** decision with a nav
affordance attached — `LandingNav.tsx:44-46` states it in code: *"German toggle mounts here. D-09 —
reserved slot… **A content swap, not a route restructure.**"*

So D-09 does bear on this decision, and the honest form of D1's argument is narrower: a content
swap is what a `copy.ts` would make cheap, and deferring it costs a mechanical multi-file edit
once, on the day the swap happens. That cost is stated at the top of this section and accepted —
it is not argued away by claiming D-09 is about something else.

### D2 — §7a is a Server Component. Its motion is CSS keyframes in `globals.css`, scoped `dpb-`.

No `"use client"`. No animation library (PRD FR5 forbids it anyway). The precedent is exact:
`ProductFlipCard.tsx` is a server component running an infinite pure-CSS 3D flip from
`globals.css:519-538`. `AuroraBackground.tsx` is the same shape. `HeroDealFlow` and `Reveal` are
client components **because JS drives their timelines** — a constant-speed rotation does not
qualify.

Class prefix `dpb-` ("data-protection band"), matching the existing `hs-blob-` / `pcard-` /
`hdf-` scoping convention so nothing leaks.

**The reduce rule must name all three animated selectors** — the rotating ring, the
counter-rotating stars, and the lock pulse. A rule that stops only the ring leaves twelve stars
spinning through a full 360° for a reduced-motion user. The prototype never hit this because it
used a blunt universal kill-switch (`index.html:224-226`, `* { animation: none !important }`),
which D2 deliberately does **not** adopt — so **the prototype's AC-6 evidence does not transfer**.
M4/M4b below are what make the desync detectable.

### One spec amendment this ADR makes — Muskan's to approve at G3

PRD constraint 2 (`docs/PRD/0028-landing-page-refresh.md:59-60`) reads: *"Reduced-motion safe by
construction, matching `Reveal.tsx:33` — content is server-rendered in its final visible state and
**motion is added only after mount** for motion-OK users."*

D2 keeps the first half exactly (content server-rendered in its final visible state — that is what
M5 asserts) and **departs from the second**: CSS keyframes start at first paint for everyone and
are switched off by a media query, rather than being added after mount by JS. The safety outcome
AC 6 specifies is unchanged; the mechanism named in the constraint is not the one used.

The alternative — a `matchMedia` gate — is the mechanism `Reveal.tsx:33` uses, and this ADR
rejects it (§2, Rejected) because it would add a client component whose only job is answering a
query CSS answers natively. **Recording the departure rather than reading the constraint loosely**
(L-017: an exception added to a criterion is a deviation, never a "correct reading").

### D3 — §7a is a contained `rounded-3xl` dark card, not a full-bleed band. **Muskan, 2026-09-07.**

Wrapper shape mirrors `B2BOnlyBand.tsx:12-14`: a `<section className="px-6 py-6">` holding a
`Reveal` at `max-w-6xl` holding an `overflow-hidden rounded-3xl` dark gradient div.

**This departs from the locked prototype**, which drew C full-bleed (`index.html:199-202`,
`.vC .bleed`). Recorded at the top of this ADR.

**Two departures from `?variant=C` in total** — both ruled by Muskan on 2026-09-07, both after the
prototype was locked the same day:

| # | C as drawn | What ships |
|---|---|---|
| D3 | Full-bleed dark band, edge to edge | Contained `rounded-3xl` dark card, `B2BOnlyBand`'s shape |
| D4 | Four pills, label only | Four-up grid, label **+ one supporting sentence** (variant **A**'s claim treatment on C's dark card) |

**What survives from C unchanged:** the dark gradient palette, the EU circle of twelve gold stars
around a lock, and §4 landing on 3 cards.

⚠️ **Consequence for G4, and where the instruction actually lives.** The visual gate compares the
live page against the *approved* design. Pointed at `?variant=C` or at `variant-C.png`,
`visual-verifier` would report a false failure on containment.

An instruction nothing carries is a wish, so the amendment is written into the artifacts a visual
gate actually reaches for, not just into this ADR:

| Artifact | What it said | State |
|---|---|---|
| `prototypes/landing-refresh-prototype/NOTES.md` | `:26` "Full-bleed dark band"; `:68-70` the now-dissolved "two full-bleed bands stack" item | ✅ **done** — amendment banner at the top of the file |
| `STATE.md` `Locked` | "§7a is a **full-bleed** dark band… Rendered spec: `?variant=C`" | ✅ **done** — corrected in place, with the visual-verifier instruction |
| `variant-C.png` (843 KB) | the full-bleed render — **the thing a visual gate is most likely to grab** | superseded on containment only; `NOTES.md` now says so beside it. Still accurate for palette, ring geometry and type |

Bookkeeping found in the same sweep: `NOTES.md:43` records variant C's Playwright check as
`stars=9`, while `:54-61` and `index.html:346-351` (`Array.from({length:12})`) both say twelve.
The recorded run predates C's EU-circle amendment. Corrected in `NOTES.md`.

### D4 — ✅ CLOSED (Muskan, 2026-09-07): each claim ships with one supporting sentence.

Variant C renders pills with the label only (`index.html:424` drops the `v` sentence). Variants A
and B both carried a one-line supporting claim (`index.html:394-395`, `:410-411`).

PRD AC 4 requires only that the four claims *appear*, so labels-only passes as specced. The
question is whether it *should*.

**Why the sentences won.** Three reasons:
1. **UWG § 5 substantiation.** German unfair-competition law reaches B2B trade and requires
   compliance-type claims to be substantiable; an unqualified badge with nothing adjacent is the
   weaker posture, and the enforcement route is a competitor *Abmahnung*, not a regulator.
   ⚠️ This is a **different** risk from the one already overruled at `/spec` (`STATE.md:77-80`,
   the legal pages' pending-review notice). That ruling does not cover this one.
2. **The text already exists and is already verified.** PRD lines 29-34 ground all four claims
   against real evidence (`eu-central-1`, `bedrock.ts:26`, TLS + at-rest).
3. **The only reason C dropped the sentences was the full-bleed pill row** — and D3 just walked
   away from that. A rounded card has room for a 4-up grid, which is what variant A already
   proved works.

**Ruling.** §7a renders the four claims as a **4-up grid of label + one supporting line**, not a
pill row. The four sentences are the PRD's own verified grounding text
(`docs/PRD/0028-landing-page-refresh.md:29-34`):

| Claim | Supporting line |
|---|---|
| GDPR | Built to the EU General Data Protection Regulation. |
| Data encryption | Encrypted in transit and at rest. |
| Hosted in Germany | Every record lives in a German data centre. |
| EU AI models | Sella runs on AI models served inside the EU. |

**Consequence:** §7a is taller than the locked prototype's variant C, and its claim treatment is
now variant **A**'s (a grid of tiles with supporting copy), rendered on **C**'s dark card. Added to
the list of ways the shipped design departs from `?variant=C` — see D3's table.

### D5 — ✅ CLOSED (Muskan, 2026-09-07): both typos corrected.

The subtitle ships as:

> Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI
> **platform** for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.

`plattform` → `platform`, and the hyphen in `deals - together` → an em dash. **This amends PRD
AC 2**, which quotes Marcel's string verbatim (`:75-77`); the amended string above is now the one
M2 binds to and the one G4 walks. Rationale: D-09 ships this page in English, and `plattform`
reads as an error rather than a style choice.

### D6 — §4 lands on 3 cards. Locked at prototype, unchanged.

Marcel's two capabilities plus the **`Verified partners only`** card kept from today's
`ValueProps` (`ValueProps.tsx:13` — that is the exact title; `NOTES.md:63-64` paraphrases it as
"Trade with verified partners", which is the string a builder would grep for and not find).

Today's other three cards — `No cross-company leaks` (`:18`), `One place, end to end` (`:23`),
`Documented deals` (`:28`) — are retired from §4. **No test, screenshot, or fixture depends on
them.** But two of the three *phrases* survive elsewhere and are deliberately left alone:
`page.tsx:26`'s meta description contains both "no cross-company leaks" and "documented deals"
(see §4's flag), and `HowItWorks.tsx:20` uses "no cross-company leaks" in a different sentence.
**A grep-based cleanup sweep will hit both. Neither is in scope.**

### D7 — §7a is inserted, never renumbered.

New `<DataProtection />` between `page.tsx:77` (`<SocialProof />`) and `:79` (`<B2BOnlyBand />`).

Eleven component docstrings cite §-numbers — census verified one by one: `LandingNav.tsx:8` §1 ·
`Hero.tsx:7` §2 · `TrustedBy.tsx:4` §3 · `ValueProps.tsx:6` §4 · `HowItWorks.tsx:6` §5 ·
`ProductFlipCard.tsx:6` §6 · `SocialProof.tsx:6` §7 · `B2BOnlyBand.tsx:4` §8 · `FAQ.tsx:6` §9 ·
`FinalCTA.tsx:6` §10 · `Footer.tsx:6` §11.

⚠️ **Corrected arithmetic.** A shift starting at §8 falsifies **four** of those eleven (§8-§11),
not all eleven — §1-§7 are untouched by it. PRD FR4 (`:44-46`) carries the same overstatement.
The conclusion is unaffected: four gratuitous docstring edits still buy nothing, and inserting
§7a costs zero.

### D8 — New e2e cases extend `e2e/landing.spec.ts`. T01 → T02 is sequential; no parallel claim.

One landing contract file, one owner for "what the landing page must show." Both tickets add
cases to it, which makes them **not** worktree-parallel — stated per L-004 rather than left to be
discovered at `/build`. Two S tickets do not need parallelism.

### Rejected, with reasons

| Rejected | Why |
|---|---|
| Shared `copy.ts` content module | Thin module, one caller-class, thrown away when real i18n lands (D1) |
| `next-intl` now | Pays full routing + catalog cost for a locale that does not exist; PRD "Out" excludes German |
| `"use client"` island for §7a | Puts JS in front of four compliance claims; no timeline for JS to drive |
| Lottie / animation library | New dependency; PRD FR5 requires CSS/SVG |
| Tailwind `motion-reduce:animate-none` | See the expanded reasoning directly below — this row alone was not an adequate answer |
| JS `matchMedia` gate for §7a | A client component whose only job is answering a query CSS answers natively |
| Renumbering §8-§11 | Falsifies eleven docstrings, buys nothing |
| Full-bleed §7a | D3 — would be the only block whose content touches the screen edges; permanent mobile-overflow surface |

### Why `motion-reduce:` loses, written out — because the one-line rejection was not honest enough

`motion-reduce:animate-none` has an apparent safety argument this ADR's first draft did not weigh:
the reduce rule lives on the element, so it looks like it cannot desync from the markup — which is
exactly the failure mode of the media-query approach. RESEARCH.md's own conclusion is *"the risk
is never the mechanism, it is the selector."* The simplification bias points the same way: it
would remove a `globals.css` block rather than add one.

**⚠️ That safety argument does not actually hold in this codebase, and getting it backwards is
worth recording.** `globals.css:1` is `@import "tailwindcss"` — Tailwind v4, CSS-first, no
`tailwind.config.*`. Tailwind's utilities live in `@layer utilities`; the appended `dpb-` block is
**unlayered**. Unlayered normal declarations outrank *every* cascade layer, so an unlayered
`.dpb-ring { animation: … }` would beat `motion-reduce:animate-none` — the variant would silently
do nothing rather than win. **The option that looked safer is the one that fails silently here.**

A second, smaller reason: the ring's twelve stars each need a per-star `--a` rotation offset, so
they carry inline styles regardless, and their counter-rotation keyframe *reads* `var(--a)` inside
its `transform` (`index.html:156` — it reads the custom property, it does not animate it). The
keyframe must therefore sit beside the per-star style, and splitting the motion across a Tailwind
variant and a `@keyframes` rule gives one animation two homes.

**What detects a desync is M4's three-element enumeration** — a reduce rule that names the ring
but not the stars fails M4, whichever mechanism wrote it. M4b closes a *different* hole
(vacuity: proving the CSS loaded at all). Both are needed and they are not interchangeable. **If
M4's enumeration is ever collapsed back to a single element, this rejection stops being valid.**

### Why §7a hand-rolls its heading instead of reusing `SectionHeading`

Same criterion as above — "don't add a second convention" — reaching the opposite answer, so it is
reconciled here rather than left as an inconsistency. `SectionHeading` hard-codes `text-brand` and
`text-ink` (`SectionHeading.tsx:26,29`), neither of which reads on a dark card, and it wraps its
own `Reveal` (`:22-24`), which would nest a `Reveal` inside §7a's `Reveal`. Reusing it would mean
adding a `variant`/`onDark` flag to a shared component to serve one caller — an option flag that
exposes the caller's background to a component that should not know about it. §7a emits its own
eyebrow + `<h2>`, twelve lines of markup, touching nothing shared.

---

## 3. Reused — already built, we feed it, we do not touch it

This is the builder's fence. **Editing anything in this list is out of scope for 0028.**

| Reused | Where | How 0028 uses it |
|---|---|---|
| `Reveal` | `_landing/Reveal.tsx` | Wrap §7a's card. Already reduced-motion- and no-JS-safe by construction (`:33`, `:13-17`) |
| `SectionHeading` | `_landing/SectionHeading.tsx` | §4's new eyebrow/title/sub. **Emits `<h2>` only** — never an h1 (`:7-8`) |
| `B2BOnlyBand` | `_landing/B2BOnlyBand.tsx` | **Read for its wrapper shape.** Its markup, its German string, its position: untouched. ⚠️ **One exception**, ruled 2026-09-07: `:4`'s docstring loses the word "full-bleed". Comment only — if the diff touches a single line of its JSX, that is out of scope |
| `SocialProof`, `HowItWorks`, `FAQ`, `FinalCTA`, `Footer`, `TrustedBy`, `CookieBanner`, `LandingNav` | `_landing/` | Untouched |
| `HeroDealFlow` | `_landing/HeroDealFlow.tsx` | Untouched — it already fills the hero's product-visual slot; the "video animation" seed item is deferred against it |
| `AuroraBackground` | `_landing/AuroraBackground.tsx` | Untouched |
| `globals.css` existing blocks | `:82-104`, `:278-282`, `:499-503`, `:512-538` | **Read as the pattern to copy.** 0028 appends a new `dpb-` block; it edits none of these |
| `lucide-react` icons | `package.json:20` | §4's and §7a's icons. No new icon dependency |
| `e2e/landing.spec.ts` cases 1-12 | `e2e/landing.spec.ts` | **Appended to, never edited.** All 12 must still pass (AC 7) |
| `page.tsx`'s server-component contract | `page.tsx:19-24` | The **`export const metadata` declaration and the D-01 redirect must survive as mechanisms**. ⚠️ Its `description` **string** is not fenced — T01 rewrites it (Muskan, 2026-09-07). Round 1 of this ADR fenced the whole export, which would have instructed the builder to preserve copy T01 retires |

### One fence line worth stating out loud

`globals.css` is a **shared file** across the app, not a landing file. 0028 appends one clearly
delimited `dpb-` section. It must not reformat, reorder, or "tidy" any existing block.

Appended at EOF, the `dpb-` block's actual neighbour is **`.speclist-scroll`**
(`globals.css:540-577`, the file currently ends at 577) — not the `hs-blob-` / `pcard-` / `hdf-` /
`dc-` blocks named as the pattern to copy. Worth knowing before a diff review: `.speclist-scroll`
is the block L-025 was written about, and it is deliberately fragile.

---

## 4. Blast radius

### Application

| File | Change | Ticket |
|---|---|---|
| `src/app/_landing/Hero.tsx` | `<h1>` text + subhead text. Structure, gradient, CTAs, `Reveal` delays all unchanged | T01 |
| `src/app/_landing/ValueProps.tsx` | `SectionHeading` props recast; `PROPS` array goes 4 → 3 entries; grid `lg:grid-cols-4` → `lg:grid-cols-3`; docstring's "buyer-outcome" framing updated; **`id="what-you-can-do"` added to the section** (M3's anchor) | T01 |
| `src/app/_landing/DataProtection.tsx` | **NEW.** Server component. §7a's card, the EU star ring SVG, the four claims. Carries `id="data-protection"` (M6's anchor) | T02 |
| `src/app/globals.css` | **APPEND ONLY.** A `dpb-` block: ring rotation + per-star counter-rotation keyframes, the lock pulse, and one `@media (prefers-reduced-motion: reduce)` rule | T02 |
| `src/app/page.tsx` | **`:26` `metadata.description` rewritten** to match the new positioning — it currently paraphrases the subhead T01 retires and reuses two card titles D6 retires (Muskan, 2026-09-07) | T01 |
| `src/app/page.tsx` | One import + `<DataProtection />` between `:77` and `:79` | T02 |
| `src/app/_landing/B2BOnlyBand.tsx` | **`:4` docstring only** — drop "full-bleed", which is false about its own markup and is what mis-led the prototype (Muskan, 2026-09-07). **No markup change** | T02 |

### Tests

| File | Change | Ticket |
|---|---|---|
| `e2e/landing.spec.ts` | **APPEND ONLY.** New cases for AC 1-3 (T01) and AC 4-6 (T02). Cases 1-12 untouched | T01, T02 |

### Cross-surface dependencies this work does not write

- **No migration, no RLS, no RPC, no auth, no server action.** `security` agent is not triggered
  by this diff.
- **No `src/types/database.types.ts` regeneration** — so L-004's classic generated-file collision
  does not apply here. The sequencing in D8 is about the spec file, not the types.
- ⚠️ **But this slug is NOT database-free, and an earlier draft of D8 said it was.**
  `landing.spec.ts` case 2 signs in as the seeded `alice@greenleaf.test`
  (`landing.spec.ts:30-31`, helper `:36-56`, case at `:80-89`). M9 and PRD AC 7 require all twelve
  cases to pass in **both** tickets, so **both need the seeded local Supabase stack running** —
  which is 0022's binding shared resource (one Docker stack per machine, L-004 pass (c)). The
  sequencing verdict is unchanged, but a builder told "no database" would misread case 2 failing
  as their own regression.
- **`.next` is a shared generated artifact** both tickets' e2e runs read, and it is the exact
  artifact L-025 records as making a new CSS class silently invisible
  (`LEARNINGS.md:759-763`). T02's entire risk surface *is* a new CSS class. `rm -rf .next` before
  trusting a red M4b.
- **`/impressum`, `/datenschutz`, `/agb`, the cookie banner** — untouched. PRD "Out" is explicit.
- **The signed-in app** — `/` redirects signed-in visitors to `/home` (D-01) before any of this
  renders. No signed-in surface can observe 0028.

### Not touched, deliberately — but flagged

- **`docs/product/PITCH.md:17`** still leads `## AI FOR DEALMAKERS`, the exact headline T01
  retires. **Raised at G3 and deliberately left stale** (Muskan, 2026-09-07) — it is a written
  pitch document, not a code artifact, and nothing a visitor sees depends on it.
- **`page.tsx:26`'s "B2B marketplace" phrasing** contradicts `.claude/rules/project.md`'s "not a
  marketplace". T01 rewrites this string anyway, so the contradiction dies as a side effect — but
  fixing it was not the reason the line is in scope, and no invariant asserts the word's absence.
- **`prototypes/landing-prototype/`** (the Phase-9 locked landing screens) still shows the old §4.
  Superseded in part by this slug. The project rule "the locked screens are the spec" now points
  at two prototypes for one page.
- **D-15** ("copy is interim; Ayush will redo the final UI", `09-CONTEXT.md:45`) — the premise
  looks stale under current ownership, but no doc formally retires it. **Confirmation owed at G3;
  not assumed.**
*(`B2BOnlyBand.tsx:4`'s wrong "full-bleed" docstring moved INTO scope at G3 — see the blast-radius
table above. It is the sentence that mis-led the prototype, so leaving it would mis-lead the next
reader the same way.)*

---

## 5. Invariants

### [M] — machine-checkable. These leave this document and become tests.

| # | Invariant | Where it is checked |
|---|---|---|
| M1 | `/` renders **exactly one** `<h1>`, and its text is `ONE SECURE SPACE FOR EVERY B2B DEAL` | T01 e2e — an explicit `count() === 1`. See the note below on why this is kept even though case 1 already catches a second h1 |
| M2 | The **first `<p>` following the `<h1>` in document order** matches the **D5-approved** subtitle: `Turn daily conversations into structured deals — together. Your fully EU GDPR compliant AI platform for buyers and sellers to trade with encrypted chat. All data is hosted in Germany.` | T01 e2e. ⚠️ **Not a CSS sibling** — see note. Note the em dash and `platform`; PRD AC 2's verbatim string is superseded |
| M3 | §4's heading reads `What you can do on Hello Sello`; the section renders **exactly 3** cards; and their titles name **creating offers and orders**, **sending to customers and suppliers**, and **verified partners** | T01 e2e, scoped by `#what-you-can-do`. The naming clause is PRD AC 3 and was previously carried only by `TICKETS.md` |
| M4 | Under `prefers-reduced-motion: reduce`: **every** animated element — the ring, **all twelve stars**, the lock — resolves computed `animationName === "none"`; **and all four claim labels are still visible** | T02 e2e, `emulateMedia({ reducedMotion: 'reduce' })`. **Computed value, never a screenshot** (L-025). The claims clause is the second half of PRD AC 6 |
| **M4b** | With motion permitted, those **same elements** resolve `animationName` to their `dpb-*` keyframe names — i.e. **not** `"none"` | T02 e2e, default media (Playwright's context default is `reducedMotion: 'no-preference'`, so this is deterministic). See the notes below — this is what makes M4 mean anything |
| M5 | All four claim labels **and their four supporting sentences** (D4) are **visible** in the server-rendered HTML — asserted with JavaScript disabled | T02 e2e, separate JS-off context. `toBeVisible`, not presence: PRD constraint 2 says *final visible state*, and presence is not visibility |
| **M10** | `/`'s `<meta name="description">` matches T01's rewritten string, and contains **neither** `no cross-company leaks` **nor** `documented deals` — the retired card titles | T01 e2e. Guards the defect round 1 of this ADR would have instructed the builder to preserve |
| M6 | §7a renders an `<h2>` reading `How your data is protected`, and `#data-protection` appears after the `What dealmakers say` heading and **before `B2BOnlyBand`'s `<h2>`** in document order | T02 e2e — anchored on the neighbouring **headings**, **not** on the text `nicht an Verbraucher` (see note). Needs no `id` on `SocialProof`, which stays fenced. The heading-text clause is PRD AC 4 |
| M8 | At a 375px viewport, `document.documentElement.scrollWidth <= clientWidth` on `/` | T02 e2e — PRD edge case, currently uncovered by anything |
| M9 | All 12 existing `landing.spec.ts` cases still pass | T01 and T02 — `test-runner` on the whole file |

**Why M4b exists, and why M4 alone was a trap.** `none` is the **initial value** of
`animation-name`. An element carrying no animation rule at all returns `"none"` — so M4 on its own
cannot tell "the reduce rule worked" from "the `dpb-` block never loaded", and a §7a that ships
completely static passes it. That is not a hypothetical: L-025's second trap
(`LEARNINGS.md:759-763`) is a CSS class that was **absent from `document.styleSheets`** because of
a stale `.next` cache, where the styling looked broken and had simply never loaded. This ADR cited
L-025's headline three times and dropped its operational half. **M4b also closes PRD AC 5**
("that section shows a moving animation"), which previously had no machine invariant at all — only
`J3`, which is judgment and goes to `critic`, not to a test.

**Why M4 enumerates rather than samples.** The `dpb-` block carries three animations (ring
rotation, per-star counter-rotation, lock pulse). An invariant phrased "the animated element",
singular, is satisfied by a reduce rule that names only the ring — leaving twelve stars turning
for the user who asked for no motion. **Sampling one star reintroduces a smaller copy of the same
hole**: a rule matching `.dpb-star:first-child` would pass. M4 therefore asserts across **all
twelve**, which is one `evaluateAll` and no harder to write than sampling.

**M4 deliberately narrows PRD AC 6.** AC 6 (`:86`) says "the animated element's computed
animation/transition resolves to none". M4 asserts `animationName` only, and only on the ring,
star and lock. Reason: `Reveal.tsx:59` puts a permanent `transition-all duration-700` on its
wrapper `<div>`, so a builder reading AC 6 literally and querying the `Reveal` would measure
`0.7s` and fail for a reason that has nothing to do with §7a. **The query targets the ring, star
and lock — never the `Reveal` wrapper.**

**M3 and M6 need DOM anchors that do not exist yet.** `ValueProps.tsx:35` has no `id` and no
`data-testid`; `data-testid` appears nowhere in `src/app/_landing/`. Two `id`s are therefore
authorised in §4's blast radius — `#what-you-can-do` on `ValueProps`' section and
`#data-protection` on §7a — reusing the idiom `HowItWorks.tsx:31` (`id="how"`) and `FAQ.tsx:32`
(`id="faq"`) already establish. ⚠️ **This is a fix that adds something; flagged to Muskan at G3.**

**M6 must not anchor on `nicht an Verbraucher`.** That phrase renders **twice** — in §8 and in the
footer (`landing.spec.ts:134-139` documents this and works around it with `.first()`). Anchored on
the text, M6 would be satisfied by §7a inserted anywhere before the *footer*, including after
`B2BOnlyBand` — the exact thing it exists to prevent — and a naive `getByText` would throw a
strict-mode violation.

**M2 is not a CSS adjacency, and PRD AC 2's wording invites the wrong locator.** AC 2 says "the
paragraph **directly below** that `<h1>`". In the DOM there is no `h1 + p` and no `h1 ~ p`: the
`<h1>` is inside `<Reveal delayMs={60}>` (`Hero.tsx:27-33`) and the subhead is inside a
**separate** `<Reveal delayMs={120}>` (`Hero.tsx:35-41`). This is the same `Reveal`-interposition
trap flagged for M4 below. M2 is a **document-order** assertion — the first `<p>` after the `<h1>`
— not a sibling selector.

**M8 can go red for a reason 0028 did not cause.** It asserts a whole-document property while §3
fences every other landing component as untouched, so a pre-existing overflow would fail T02 with
no in-scope fix. Nothing today looks likely to trip it (`globals.css:326` puts `overflow: hidden`
on `.hdf-stage` and `:505` collapses it to `minmax(0,1fr)` at ≤720px; `CookieBanner.tsx:84` is
`fixed inset-x-4 … max-w-xl`), but it has not been executed at 375px. **If M8 goes red and
`git stash` shows it red without 0028's diff, it is a pre-existing bug: file it, do not fix it
inside T02.**

**M7 is deleted, not moved.** It read "`DataProtection.tsx` contains no `"use client"`… grep
assertion or a lint rule". It was two invariants joined by "or" with neither chosen, a filesystem
grep inside a browser e2e suite, and — decisively — **unfalsifiable from outside**: a stray
`"use client"` changes no observable that any other invariant reads. The property that actually
matters is already M5 (the claims render with JS off). D2's no-client-island rule is enforced by
review, and this ADR now says so instead of pretending a test covers it.

**A correction to this ADR's own justification for M1.** Round 1 of this ADR claimed existing case
1 "cannot catch a second `<h1>`" because it only asserts *any* h1. **That is false** — Playwright's
locator assertions are strict, and `expect(page.getByRole('heading', { level: 1 })).toBeVisible()`
(`landing.spec.ts:71`) fails with a strict-mode violation when two match. M1 is kept anyway,
because naming the contract explicitly beats relying on a side effect of Playwright's resolution
rules, but the reason given for it was wrong. Same error in `RESEARCH.md` and `TICKETS.md`, both
corrected.

### [J] — judgment only. These stay in prose and go to `critic`'s brief.

| # | Invariant | Why a machine cannot check it |
|---|---|---|
| J1 | The subtitle reads as Marcel approved it, typos and all (pending D5) | Only the product owner knows the intended string |
| J2 | The dark card reads as a deliberate emphasis against the light page, not as an unstyled block | Aesthetic judgment; G4's job |
| J3 | The star ring reads as the EU flag, not as a loading spinner | A 44s rotation is slow enough to read as ambient; only a human can confirm |
| J4 | Four compliance labels are an acceptable substantiation posture under UWG § 5 (pending D4) | A legal-risk trade-off, not a code property |
| J5 | The dark card and the pink band below it read as a pair, not as a collision | G4 |

---

## 5b. Product rulings — closed at G3, 2026-09-07

Four decisions this ADR could not make for itself. All four are Muskan's, all four are now closed.

| # | Question | Ruling | What it changed |
|---|---|---|---|
| 1 | Should §7a be full-bleed or contained? | **Contained `rounded-3xl` dark card** | D3. Departs from the locked prototype; the amendment is routed into `NOTES.md` and `STATE.md` |
| 2 | Bare claim labels, or label + a supporting sentence? | **Supporting sentence on each** | D4. §7a becomes a 4-up grid, taller than variant C; second departure from the prototype |
| 3 | Marcel's two apparent typos | **Correct both** — `platform`, em dash | D5. **Amends PRD AC 2.** M2 binds to the corrected string |
| 4 | Three stale-copy leftovers | **Fix two, leave one** | `page.tsx:26`'s meta description → T01 (+ new invariant M10); `B2BOnlyBand.tsx:4`'s docstring → T02. `PITCH.md:17` left stale on purpose |

**Ruling 1's premise was corrected before it was ruled on.** The question reached G3 as "two
full-bleed bands stack, how do we separate them" — and the pink band is not full-bleed. The
seam never existed. Recording this because the *shape* of the mistake is reusable: a component's
docstring described its own markup wrongly (`B2BOnlyBand.tsx:4`), the prototype trusted the prose
over the DOM, and a design question got asked about a page that does not exist. Ruling 4 fixes
that docstring so the next reader does not repeat it.

---

## 6. Consequences

**Good**

- 0028 adds **one component, one CSS block, one line in `page.tsx`**. No new dependency, no new
  convention, no new layout idiom, no client-side JavaScript.
- The page keeps its "everything is server-rendered, motion is additive" property intact. A
  visitor with JS off reads every compliance claim.
- The four claims become the first content on the landing page that is **factually grounded** —
  PRD lines 29-34 traced each to real infrastructure rather than marketing prose.

**Costs, accepted**

- **The locked prototype no longer matches what ships** (D3). Recorded here and at the top; G4's
  comparison target is the amendment, not `?variant=C`.
- **`globals.css` grows again.** It is now the single owner of four separate animation vocabularies
  (`hs-blob-`, `dc-`, `hdf-`, `pcard-`) plus `dpb-`. Each is scoped and none leak, but the file is
  becoming a landing-motion dumping ground. **Not fixed here** — extraction is its own slug.
- **WCAG 2.2.2 (Pause/Stop/Hide, Level A)** technically applies to any auto-starting motion over
  five seconds, for all users, not only reduced-motion ones. §7a's 44s rotation inherits the same
  unaddressed exposure the Aurora blobs and `ProductFlipCard` already carry. **0028 does not make
  this worse and does not fix it.** Naming it so it is a known gap rather than an oversight.
- **Two prototypes now describe one page.** `prototypes/landing-prototype/` (Phase 9) and
  `prototypes/landing-refresh-prototype/` (0028) disagree about §4. The refresh one wins for the
  blocks it covers; nothing records that fact outside this ADR.

**Reversibility** — high. Every change is text or one self-contained component. Reverting 0028 is
a revert of two commits with no data migration, no schema change, and nothing to back-fill.

---

## 7. What changed after the checker rounds

*Two rounds, the locked budget (PIPELINE §10). Round 2 raised one new rung-3 finding, which
spends the budget — a third round would be Muskan's explicit call, not the default.*

### Round 2 — one blocking finding, and it was mine

**Rung 3 · the ADR reported three remediations as done that were not in the repo.** §7's round-1
table said ADR 0010 had been added to `ADR-INDEX.md` (it had not — the index ended at 0009), and
D3's table said the full-bleed amendment was "written into" `NOTES.md` and `STATE.md` (it was
not). The ADR invoked *"an instruction nothing carries is a wish"* in the same paragraph where it
left the instruction uncarried. **All three are now actually done** — index row added, amendment
banner at the top of `NOTES.md`, `STATE.md`'s `Locked` corrected in place.

**Two rung-5 findings changed what the document argues, not just how it reads:**

- **The `motion-reduce:` rejection was right for a backwards reason.** §2 credited the rejected
  option with "the reduce rule lives on the element, so it cannot desync." In Tailwind v4
  (`globals.css:1` is `@import "tailwindcss"`, no config file) utilities sit in `@layer
  utilities`, and the appended `dpb-` block is unlayered — **unlayered declarations outrank every
  layer**, so the variant would have lost silently. The option that looked safer fails silently
  here. Rewritten.
- **The desync closure was attributed to the wrong invariant.** §2 said the rejection "depends on
  M4b existing." It depends on **M4's three-element enumeration**; M4b closes vacuity, a different
  hole. Stated correctly, and the conditional now names M4.

**Also folded in:** M3, M4 and M6 were narrower than `TICKETS.md`, leaving PRD AC 3's "name the
capabilities", AC 4's heading text and AC 6's "all four claims still render" owned only downstream
— §5 is supposed to be the owner, so all three clauses moved up · M4 sampled one star, which
reintroduces a smaller copy of the hole it exists to close (now all twelve) · M2 read as a CSS
adjacency that does not exist, since two separate `Reveal`s sit between the `<h1>` and the subhead
· M5 asserted presence where the constraint says *visible* · D6 called the kept card "Trade with
verified partners" when `ValueProps.tsx:13` says `Verified partners only`, and claimed the retired
titles appear nowhere else while §4 said the opposite · M8 could go red for a pre-existing reason
with no in-scope fix · `LandingNav` cited two lines off.

**Round 2 confirmed sound:** M4b under all three attacks (missing reduce rule → M4 catches;
animation moved to another element → M4b catches; `animationName` is the right property, and
Playwright's default context is `reducedMotion: 'no-preference'`, so "default media" is
deterministic) · M7's deletion (in the App Router a stray `"use client"` still server-renders, so
it changes no observable M5 reads) · both authorised `id`s sufficient and fence-compatible · the
eleven-docstring census and the "four, not eleven" arithmetic · the Playwright strict-mode
correction · the seeded-DB correction · M6's heading anchoring (the footer's German line is a `<p>`
at `Footer.tsx:91`, not a heading, so a role-scoped locator is unique) · S1-S8 N/A · cross-ADR
sweep clean · nothing in the ADR body still asserts the full-bleed design.

**One option round 2 raised and dismissed with reasons:** a co-located
`DataProtection.module.css` would remove the hand-maintained `dpb-` prefix convention and dissolve
the shared-file fence — but `globals.css` is the repo's **only** stylesheet (verified: no
`*.module.css` anywhere in `src/`), so it would be a second convention, which this ADR's own
criterion rejects. Recorded so it is decided rather than unconsidered.

---

## 7b. What changed after `adr-checker` round 1

Seventeen findings, two on blocking rungs. Every one below was spot-verified against the repo
before folding in — checkers err, and two of these needed the ADR's *reasoning* corrected rather
than its conclusion (L-003).

### Rung 2 — blocking. Both were the same mistake, twice.

The ADR spent four paragraphs on L-025 ("if we get reduced-motion wrong the failure is silent")
and then wrote an invariant that was silent in exactly that way.

1. **M4 passed vacuously.** `none` is `animation-name`'s **initial value**, so an element with no
   animation rule at all returns `"none"`. A §7a that shipped completely static passed M1-M9. The
   ADR had imported L-025's headline and dropped its operational half — the stale-`.next` trap at
   `LEARNINGS.md:759-763`. **Fixed by M4b**, which also closes PRD AC 5 (previously covered by no
   machine invariant at all, only the judgment note J3).
2. **M4 named one animated element; the design has three.** The ADR's own blast radius said so.
   A scoped reduce rule naming only the ring leaves twelve stars turning for a reduced-motion user
   — and the prototype's AC-6 evidence does not transfer, because it passed via a universal
   `* { animation: none !important }` kill-switch that D2 rejects. **Fixed by enumerating all
   three in M4 and M4b.**

Neither fix adds a mechanism. Both are sentence edits to the invariant table.

### Rungs 4-5 — folded in, none held the loop open

| # | Finding | Disposition |
|---|---|---|
| 3 | M3/M6 had no DOM anchor — `ValueProps` has no `id`, and `data-testid` appears nowhere in `_landing/` | Two `id`s authorised, reusing `id="how"` / `id="faq"`. ⚠️ **Adds something — flagged at G3** |
| 3b | M6 anchored on `nicht an Verbraucher`, which renders **twice** — satisfied by §7a placed anywhere before the footer | Re-anchored on the neighbouring headings |
| 4 | "No database, so L-004 pass (c) is irrelevant" — **false**; case 2 signs in as a seeded user | Corrected in ADR §4 and `TICKETS.md`. Verdict unchanged |
| 4b | `.next` is a shared generated artifact both tickets read — and the exact artifact L-025 blames | Added to pass (b) |
| 5 | "Existing case 1 cannot catch a second `<h1>`" — **false**, Playwright locators are strict | Corrected in three files. M1 kept, its justification rewritten |
| 6 | D2 departs from PRD constraint 2 ("motion added only after mount") and never said so | Recorded as an explicit spec amendment for Muskan |
| 7 | D1 dismissed D-09 as "a nav affordance, not a copy architecture" — misdescribes it (`LandingNav.tsx:46-48`) | Argument narrowed and made honest; conclusion stands |
| 8 | "Every single section is `mx-auto max-w-6xl px-6`" — overstated; a full-bleed *backdrop* idiom exists | Restated precisely in §1 and `RESEARCH.md` |
| 9 | "Renumbering falsifies all eleven docstrings" — it falsifies **four** (§8-§11) | Arithmetic corrected; census of eleven verified correct |
| 10 | The D3 departure lived only in this ADR — `STATE.md`, `NOTES.md` and `variant-C.png` still asserted full-bleed | Amendment routed into all three. *An instruction nothing carries is a wish* |
| 11 | The fence told the builder to preserve `page.tsx:26`'s meta description — which paraphrases the copy T01 retires | **Raised at G3**, recommend one line into T01 |
| 12 | M2 said "matches AC 2's string exactly" while D5 leaves that string open | M2 now reads "as approved at G3" |
| 13 | M7 was two invariants joined by "or", neither chosen, and unfalsifiable from the browser | **Deleted.** M5 is the real observable; D2's rule is review-enforced and now says so |
| 14 | `motion-reduce:` was rejected without weighing its safety argument — and simplification bias favours it | Full reasoning written out; rejection now depends on M4b existing |
| 15 | ADR 0010 was not in `ADR-INDEX.md` | Added — `/design` step 5 |
| 16 | §7a hand-rolls a heading, failing the same "second convention" test used to reject `motion-reduce:` | Reconciled explicitly in §2 |
| 17 | M4 silently narrowed AC 6 from "animation/transition" to `animationName` | Narrowing stated, with the `Reveal.tsx:59` reason a builder would otherwise trip on |

### Checked and confirmed sound

D2's whole precedent chain (`ProductFlipCard` server-component status, all four `globals.css`
reduce blocks, the `"use client"` census). Every prototype and PRD-grounding citation. The
`Reused` fence against the blast radius — no contradiction. `Reveal` is safe to wrap the dark
card. **Security S1-S8: genuinely N/A** — no migration, no RLS, no grant, no `SECURITY DEFINER`,
no RPC, no server action; the only route touched is `/`, already public, its D-01 redirect
unchanged and still covered by existing case 2. Cross-ADR sweep clean: no ADR in the index touches
landing, marketing or public pages.
