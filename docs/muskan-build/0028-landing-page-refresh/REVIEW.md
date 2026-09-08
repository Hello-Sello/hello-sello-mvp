# 0028 landing-page-refresh — REVIEW

One file for the whole slug. Every finding is attributed. Severity uses the **PIPELINE §10 ladder**:
`blocking` is rungs 1-3 only (leak · silent failure · won't run); rungs 4-5 (behavioural edge,
contract/wording) are `note` — surfaced at G4, never retried.

---

# T01 — Hero headline + subhead, §4 recast to three capability cards (DEV-178)

## Gate results

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** — exit 0, no output |
| `playwright test e2e/landing.spec.ts` | **PASS — 16/16** (12 pre-existing = AC 7 / M9, + 4 new) |
| `npx vitest run` | **PASS** — 515 tests across 69 files |
| `npx next build` | **PASS** — 33/33 static pages; `/` still `ƒ` dynamic, so the D-01 redirect path is exercised |
| `npx eslint src/` | **6 errors / 4 warnings — PRE-EXISTING, not caused by this diff** |

**The lint result was proven, not assumed.** `test-runner` stashed the five changed files, re-ran
`eslint src/` against the true base tree, got the **identical** 6 errors / 4 warnings at identical
lines, then popped the stash. Scoped lint on T01's three touched files is clean (exit 0). The debt
lives in `CookieBanner.tsx:52`, `Footer.tsx:37,40`, `LandingNav.tsx:30,36`,
`OnboardingStepper.tsx:620`, `deals/actions.ts`, `messaging/supabase/store.ts` — none in this diff.

## Two checks with no test behind them, done by hand

- **Both em dashes are U+2014**, confirmed by codepoint dump: `Hero.tsx:37` (covered by case 14)
  and `ValueProps.tsx:34`'s `sub` (**covered by nothing** — a hyphen there would have reached
  production silently).
- **Card 3's body survived as a pure move** — the diff removes and re-adds the identical string.

## Two checks that guard the gate itself

- **No spec other than `e2e/landing.spec.ts` navigates to `/`** or asserts any string this diff
  changed (grepped for `goto('/')` plus all six retired/new strings). M9's blast radius really is
  one file.
- **The reused dev server was serving current code.** `playwright.config.ts:41-43` sets
  `reuseExistingServer`, and a `next dev` had been live on `:3000` since before the 58-commit
  rebase. Confirmed the served HTML contains the new headline and no longer contains
  `AI FOR DEALMAKERS`. **A 16/16 against a stale server would have been worthless.**
  ⚠️ The naive check `curl -s … | grep -c "…"` returned `0` intermittently despite the string being
  present — the shell hook rewrites `curl | grep` pipelines through `rtk` and the rewrite drops the
  match. Same class as HEL-80, triggered by a shell *pattern* rather than a binary name. Verified
  instead by saving the response to a file and grepping the file, three times.

## Findings

### `/code-review high` — 6 findings, 0 blocking, 1 fixed, 1 rejected

It independently re-verified the mechanical claims before reporting (em dashes are U+2014; the
three icons resolve; `SectionHeading` emits one `<h2>` and no `<h1>`; `LegalPageLayout`'s `<h1>` is
on another route so M1's count-of-1 holds; `CookieBanner`'s `<p>` renders after the Hero so case
14's document-order walk is safe). **No correctness defect in the render path.**

---

**F1 · note · ⚠️ THE ONE THAT MATTERS · `(code-review, src/app/_landing/Hero.tsx:39)`**
**"All data is hosted in Germany" is substantiated only for the database tier.**

Verified independently and **confirmed**: there is **no `vercel.json`**, **no `preferredRegion`
anywhere in `src/`**, and no region setting in `next.config.ts` (redirects + `devIndicators` only).
So the Next.js server functions — including this page's own `getCurrentUser()` call and every
server action — run in Vercel's **default region** unless the project dashboard overrides it.

The PRD's grounding table (`docs/PRD/0028-landing-page-refresh.md:31`) backs this claim with
exactly one fact: prod Supabase `byipusuthdlskdxoexkt` is `eu-central-1`. **The app tier was never
checked.** Exposure is **UWG § 5**, the same competitor-*Abmahnung* route D4 already reasoned about
— and this page's own spec treats that exposure as first-order (D-12's reject-parity).

**Not fixed here, deliberately.** The remedy is either an infrastructure change (pin the region) or
a copy change (narrow the claim) — both product decisions, neither a builder's call, and the copy
half was already overruled once at `/spec` on a *different* ground. **Muskan's, at G4.**

---

**F2 · REJECTED with reasoning · `(code-review, e2e/landing.spec.ts:356-357)`**
Claimed the two `not.toContain` guards are dead because line 353's `toBe()` "fully determines"
`content`. **The stated failure scenario does not hold.**

| Scenario | `toBe(literal)` | `not.toContain('documented deals')` |
|---|---|---|
| Today | passes | passes — phrase absent |
| Phrase reintroduced, test untouched | **fails** | (unreached) |
| Phrase reintroduced **and the literal updated to match** ← *the review's own scenario* | passes | **FAILS** |

The assertions run against `content`, not against a separate expectation, so once equality holds
`content` **is** the new literal — and the guard fires on it. The argument conflates *determined*
with *passing*; a determined outcome can be a failure. The guards are redundant for today's literal
and **load-bearing against a future test-editor**, which is precisely what they are for. Kept.

---

**F3 · note · `(code-review, src/app/_landing/ValueProps.tsx:32-33)`** — the eyebrow is a literal
prefix of the `<h2>`: `WHAT YOU CAN DO` sits directly above `What you can do on Hello Sello`. Every
other `SectionHeading` on the page pairs a *distinct* eyebrow with its title (`"See it in action"` /
`"A gated product, here's the inside"`). ⚠️ **Not a builder error — the locked prototype does this**
(`index.html`, `cap()`: `<span class="eyebrow">What you can do</span>` above the same `<h2>`). Ships
as designed; **G4 may want a distinct eyebrow.**

---

**F4 · note → ✅ FIXED, not deferred · `(code-review, src/app/_landing/ValueProps.tsx:30)`** — the
new `id="what-you-can-do"` was missing `scroll-mt-24`, which **both** existing anchor sections carry
(`HowItWorks.tsx:31` `id="how"`, `FAQ.tsx:32` `id="faq"`) precisely because `LandingNav` is sticky
and would otherwise cover the target.

**Fixed rather than noted, because the ADR asked for it.** ADR §5 authorises the `id` as *"reusing
the idiom `HowItWorks.tsx:31` and `FAQ.tsx:32` already establish"* — shipping the `id` without the
`scroll-mt-24` reuses half an idiom and leaves a latent bug for the first `/#what-you-can-do` link
anyone adds. One class token, zero behavioural risk, completes an authorised change rather than
adding scope.

---

**F5 · note · `(code-review, src/app/_landing/HowItWorks.tsx:20 + Footer.tsx:25)`** — after this
diff the **visible page and its own metadata disagree**: case 16 asserts `no cross-company leaks` is
retired from the description, while `HowItWorks.tsx:20` still renders that exact phrase two sections
below; likewise `marketplace` leaves the description but survives in `Footer.tsx:25`. Both are
fenced out of T01 by ADR D6. **New and worth acting on: the "grep-based cleanup sweep" D6 promises
does not exist as a ticket.** An instruction nothing carries is a wish — the ADR's own words.

---

**F6 · note · `(code-review, src/app/_landing/ValueProps.tsx:37)`** — 3 cards under an unchanged
`sm:grid-cols-2` leaves a 2 + 1 orphan row in the `sm`–`md` range. Already pre-flagged in
`PLAN-T01.md` §1.3(d) and carried below as G4 note 4. Restated by the reviewer independently.

**Explicitly not findings** (raised, then set aside as already-ruled): the 165-char description and
`Hero.tsx:13`'s stale D-15 docstring — both documented with a deliberate ruling and carried to G4
rather than silently fixed.

---

### `critic` — 6 findings, **0 blocking**, 3 fixed, 3 to G4

It flagged its own limit up front: no shell, so two of its "untouched" conclusions rest on the
diffstat rather than a re-derived `git diff`. I had already verified the diff directly — its fence
and scope conclusions are confirmed independently.

**Criteria walk: all five discharged**, each by code *and* a test that fires on the real
regression. **Fence: clean** — nothing in ADR §3's `Reused` list, nothing T02 owns, `page.tsx`'s
two fenced mechanisms (`export const metadata` `:23`, the `getCurrentUser()`/`redirect("/home")`
branch `:37-38`) both survive, cases 1-12 byte-identical. **Scope: nothing extra, nothing missing.**

---

**C1 · note → ✅ FIXED · `(critic, e2e/landing.spec.ts:331-333)`**
**M3's naming clause was weaker than M3.** Case 15 asserted three noun phrases; M3 names three
*capabilities* — "**creating** offers and orders", "**sending** to customers and suppliers". The
verbs were unasserted, so a benefit-framed `Track offers and orders` would **pass case 15 while
falsifying PRD AC 3's entire purpose** (the recast *away from* benefit framing). Second, smaller
hole: three independent `.some()` calls never bound a phrase to a *distinct* card, so one compound
title plus a duplicate satisfied all three.

**Fixed and the fix was proven to fire**, not just written: the verbs are now matched loosely
(`creat\w*`, `send\w*` — ordinary copy edits stay free) and each pattern must match **exactly one**
title. Verified empirically by temporarily setting card 1 to `Track offers and orders` →
`Error: exactly one §4 card title should match /creat\w*\s+offers and orders/i · Received length: 0`.
Reverted; suite back to 16/16. *(Writing a stronger assertion and never proving it fires is the
exact vacuity trap M4b exists to close — so it was proven.)*

**C2 · note → ✅ FIXED · `(critic, prototypes/landing-refresh-prototype/NOTES.md:54, :91)`**
**The prototype's amendment banner was one departure short, and G4 reads it.** The banner is headed
*"AMENDED TWICE"* and covers only D3 (containment) and D4 (supporting sentences) — but §4's shipped
copy departs from `index.html:362-367` in **three** strings. Card 2's plural was recorded only in
build docs (`PLAN-T01.md`, `STATE.md`, this file) — **none of which a visual gate opens** — and
`NOTES.md:91` still named card 3 *"Trade with verified partners"*, the exact string ADR D6 says
exists nowhere in the repo.

Concrete failure prevented: `visual-verifier`, pointed at `?variant=C` under the banner's own
*"still valid from C: §4 landing on 3 cards"*, would have reported a **false failure on card 2**.
That is the recurrence, in T01's lane, of the round-2 blocking finding — *an instruction nothing
carries is a wish*. **Fixed:** banner re-headed *"AMENDED THREE TIMES"*, a card-by-card table of
prototype-vs-shipped titles added, `:91`'s dead paraphrase corrected in place.
⚠️ Confirmed while fixing: the banner exists at `NOTES.md:54`, **not** "at the top of the file" as
ADR `:186` claims. Carried, so not a defect — but the ADR's description of its own remediation is
imprecise.

**C3 · note → ✅ FIXED · `(critic, docs/PRD/0028-landing-page-refresh.md:39, :75-77)`**
**The PRD was never marked superseded on the string that shipped**, and `.claude/rules/product.md`
names the PRD the source of truth. FR2 still read *"carries Marcel's subtitle **verbatim**"* and
AC 2 still quoted `plattform` + a hyphen. **G5 walks acceptance criteria — whoever walked AC 2
against a correct page would have marked it FAILED.** Fixed by annotation, not rewrite (the
repo's annotate-never-delete convention): both original texts struck and kept, the G3/D5 ruling and
the shipped string added beneath, cross-referenced to M2 and case 14.

**C4 · note → G4 · `(critic, src/app/_landing/Footer.tsx:25)`**
Leaving it was correct — `Footer` is fenced `Reused`/untouched at ADR `:334`, so a drive-by fix
would itself have been the finding. Worth recording what the correct omission leaves standing:
`/` now carries **exactly one** "marketplace" claim (*"The verified B2B marketplace for
dealmakers"*), contradicting `.claude/rules/project.md`'s "not a marketplace". Before T01 there were
two and the contradiction was diffuse; **now it is a single line with a single owner** — which
makes it a ticket, not a sweep.

**C5 · note → ✅ FIXED · `(critic, src/app/_landing/ValueProps.tsx:5-8)`**
The rewritten docstring still claimed *"Glass cards with a **gradient icon tile**"* — the markup
has neither: `ValueProp:59` renders a bare `<Icon className="text-brand" …/>`. It also still opened
*"Value props (§4)"* for a section PRD FR3 just recast away from value framing. **Third instance in
this slug of a landing docstring asserting something false about its own file** — the defect the
ADR calls the slug's signature. The docstring was explicitly in scope, so fixed: now *"What you can
do (§4) … a brand-tinted icon"*, plus a line recording why the `ValueProps` **filename and export**
stay (renaming reaches `page.tsx`'s import, which is fenced).

**C6 · note → resolved · `(critic, STATE.md:5)`**
Record split — `REVIEW.md` carried a green gate while `STATE.md` still read *"Now at step 5"*.
Closed. **Its factual query, answered:** the lint baseline stash covered **five** files — `STATE.md`,
`e2e/landing.spec.ts`, and the three `src/` files. The 4th and 5th are a docs file and a test file,
**neither under `src/`**, so `eslint src/` on the stashed tree measured the true base of `src/`.
**The pre-existing proof stands.**

---

### `visual-verifier` — G4 staging

**21 screenshots** in `g4/`, live-vs-prototype pairs. Dev server confirmed serving current code and
working tree == HEAD before capture. `supabase db reset` deliberately skipped (`/` is static, zero
seeded-data dependency, a reset would be destructive for no benefit); the consent banner was hidden
by CSS for capture only — **not** clicked, since Accept/Reject is a consent decision.

#### Criteria and prototype differentiators

| Item | Shipped | Approved design | Verdict |
|---|---|---|---|
| AC 1 | one `<h1>`, `ONE SECURE SPACE FOR EVERY B2B DEAL` | same | **match** |
| AC 2 | D5 string byte-exact, em dash + `platform` | D5 (supersedes PRD AC 2) | **match** — ⚠️ the prototype PNG still draws the retired `plattform` + hyphen; **live is the correct one** |
| AC 3 | `#what-you-can-do`, `<h2>` correct, exactly 3 cards | same | **match** |
| AC 4 | new meta, neither retired phrase | M10 | **match** |
| AC 5 | 16/16 | all twelve pre-existing pass | **match** |
| Card 2 title | `Send to all your customers and suppliers` | **amendment 3** — plural | **match to approved**; differs from prototype **by design** |
| Card 3 title | `Verified partners only` | **amendment 3** / D6 | **match to approved**; differs from prototype **by design** |
| Card 3 body | existing longer body kept | D6 keeps the card verbatim | **match to approved** |
| Eyebrow / heading / sub | as shipped | identical to `index.html:368-372` | **match** — but see V1 |
| Card 3 icon | lucide `ShieldCheck` | prototype draws a circle-check | **deviates**, cosmetic — live keeps `ValueProps`' existing icon |

*(Pointing this agent at the amendment rather than `?variant=C` is what stopped cards 2 and 3 being
reported as failures. That routing was C2's whole purpose.)*

#### Captured views

| View | Finding | Verdict |
|---|---|---|
| Hero @1440 | h1 60px (prototype 68px). Live breaks `ONE SECURE SPACE FOR / EVERY B2B DEAL`; prototype breaks after `SPACE`. Live's second line is shorter — reads top-heavy | **deviates** |
| Hero @1440 fit | h1→sub 24px, sub→CTA 36px, CTA above fold, no overflow. **No collision** | **match** |
| §4 @1440 | 3-up, equal card heights (192px), 355px columns. Card 2's longer title wraps to 2 lines so its body drops a line — **body copy no longer shares a baseline** across the row | **deviates** — direct consequence of approved amendment 3 |
| **§4 orphan band** | ⚠️ **640–1023px, not just 768** — wider than the ticket assumed. Worst at 1023px: one card in the left half, right half empty. Resolves to 3-up at 1024px | **needs-a-human-call** |
| §4 @768 vs prototype | **Cannot be arbitrated by the prototype** — variant C has no 2-column state at all; it goes 3-up straight to 1-up at 900px | **cannot-verify** |
| Hero @375 | h1 36px × 3 lines, balanced break, no widow; CTAs stack via pre-existing `flex-wrap`; no overflow | **match** |
| §4 @375 | 1-up × 3 both sides | **match** |
| **Hero @640-700** | h1 jumps to 60px at the `sm` breakpoint inside a ~592px box → 3 lines with `DEAL` stranded alone. Tightest point on the page | **needs-a-human-call** |
| Hover @1440 | lift fires and matches the prototype | **match** |
| Full page @1440 | 5907px, no overflow, all sections render | context |

#### V1-V4 — the verifier's opinions

**V1 · The eyebrow duplication is real and it is the page's only instance.** Every other pair is
distinct *and* punchier: `HOW IT WORKS` / "Three steps from stranger to deal" · `SEE IT IN ACTION` /
"A gated product, here's the inside" · `LOVED ON BOTH SIDES OF THE DEAL` / "What dealmakers say" ·
`READY WHEN YOU ARE` / "Join the verified B2B network". §4 is the only literal prefix, and its
heading is merely descriptive where the others are outcome phrases. **Faithful to the approved
prototype**, so a design question, not a build slip. One prop to change.

**V2 · The orphan row — the ruling most worth having, and there is a precedent one section down.**
`HowItWorks.tsx:37` also renders 3 cards and uses **`sm:grid-cols-3` with no `lg:` step**, so it
never orphans. §4 kept `sm:grid-cols-2` from its 4-card days. `sm:grid-cols-2 lg:grid-cols-3` →
`sm:grid-cols-3` is **one class**, and it makes §4 match its sibling.
**Deliberately NOT applied:** the ADR's blast radius authorises only the `lg` value, and 3 narrow
cards at 640px is a design trade-off. **Muskan's call at G4.**

**V3 · The longer `<h1>` holds up better than expected.** 2 lines at 1440 (9.1% of hero height, no
collision), 3 balanced lines at 375. Soft spot is 640-700px only. Separately, the prototype's line
break is better balanced — it puts the short line first.

**V4 · Two extras.**
- ⚠️ **Pre-existing, out of scope, and it confirms the ADR's own reasoning:** the cards'
  `hover:shadow-[…]` **never applies**. `.glass` (`globals.css:60-66`) sets `box-shadow` as an
  **unlayered** plain rule, and unlayered CSS beats Tailwind v4's layered utilities regardless of
  specificity — so the hover shadow is dead code on **every** `.glass` element carrying a shadow
  utility. Confirmed unchanged from HEAD. **This is the exact cascade-layer mechanism ADR §2 used to
  reject `motion-reduce:animate-none` for T02** — the ADR predicted it in theory; here it is
  already happening in practice. Wants its own ticket.
- **§4 and §5 now read as the same section twice.** Dropping to 3 cards made §4 structurally
  identical to `HowItWorks` directly beneath it — two consecutive rows of three glass cards with
  icon + title + body. At 4 cards they read as different blocks. Rhythm observation for G4.

**Evidence-quality note the verifier self-caught:** its first hover test reported the lift as
broken. It was not — Tailwind v4 compiles `-translate-y-1` to the **`translate`** property, not
`transform`, and it had been reading `transform`. Corrected before it reached the table.

---

## Verdict — T01 *(see T02 below for the rest of the slug)*

**No blocking findings from any reviewer.** 12 review findings: **1 rejected with reasoning** (F2),
**5 fixed** (F4, C1, C2, C3, C5), the rest carried to G4 as notes. Visual staging adds 4 more
observations, **3 of which are design calls deliberately left to Muskan** (V1 eyebrow, V2 orphan
band, V3 the 640-700px headline) and 1 pre-existing bug worth its own ticket (V4 dead hover shadow).
Post-fix gate: `tsc` clean · scoped `eslint` clean · **landing e2e 16/16**.
Committed `423b6f5`, pushed.

## Notes carried to G4 — none is a defect, all need Muskan's eye

| # | Note |
|---|---|
| **0** | 🔴 **THE ONE TO READ FIRST — "All data is hosted in Germany" is only proven for the database.** No `vercel.json`, no `preferredRegion` in `src/`, no region in `next.config.ts` — so the Next.js **server functions** run in Vercel's default region unless the dashboard overrides it. The PRD grounds this claim on one fact: prod Supabase is `eu-central-1`. **Exposure is UWG § 5** — competitor *Abmahnung*, the same route D4 already reasoned about. Remedy is either infra (pin the region) or copy (narrow the claim); **both are product decisions, not a builder's.** ⚠️ Distinct from the `/spec` overrule, which covered "fully EU GDPR compliant" and "encrypted chat" — **not** this |
| 1 | **`Hero.tsx:13` ships false.** Still reads *"Copy is interim placeholder framing (D-15) — restyle/refill friendly"* on a file now carrying locked positioning. **The ADR contradicts itself:** its header (`:8`) says 0028 *amends* D-15; its `:406-408` says confirmation is *owed at G3, not assumed* — and G3's four rulings did not include it. Left untouched because the blast radius authorises no Hero docstring edit |
| 2 | **Card 2 ships PLURAL** — `Send to all your customers and suppliers`, overriding the locked prototype's singular `Send to every customer and supplier` (`index.html:364`). Resolved by rule, not preference: `.claude/rules/product.md` makes the PRD beat the prototype, and PRD FR3 + Marcel's seed + ADR M3 + TICKETS AC 3 all say plural. A visible copy change Muskan has not seen |
| 3 | **`metadata.description` is 165 characters**, ~5 over the SERP-truncation norm. Google may clip the trailing `hosted in Germany`. Accepted rather than cutting the most load-bearing phrase in Marcel's brief |
| 4 | **§4 now renders 2 + 1 (orphan row) in the `sm`–`md` range**, where it renders 2 + 2 today. Only the `lg` grid value was authorised, so this is faithful — but no test can see it |
| 5 | **The kept card's reveal delay shifted 0 ms → 160 ms** as `Verified partners only` moved from index 0 to index 2 (`ValueProps.tsx:44`, `delayMs={i * 80}`). The `Reveal` map is untouched as *code* and changed as *rendered timing* |
| 6 | **`marketplace` still renders on `/`** at `Footer.tsx:25` (*"The verified B2B marketplace for dealmakers"*), contradicting `.claude/rules/project.md`'s "not a marketplace". Correctly out of scope — T01 only removed it from `page.tsx:26`, as a side effect |
| 7 | **`HowItWorks.tsx:20` still contains "no cross-company leaks"** and **`PITCH.md:17` still leads "AI FOR DEALMAKERS"** — both deliberately stale (ADR D6; G3 ruling). A grep-driven cleanup sweep would hit both; it must not |

---

# T02 — New §7a "How your data is protected" + the EU star ring (DEV-179)

## Gate results

| Suite | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** |
| `playwright test e2e/landing.spec.ts` | **PASS — 21/21** (12 pre-existing + 4 T01 + 5 T02) |
| `npx vitest run` | **PASS** — 515 tests / 69 files |
| `npx next build` | **PASS** |
| `eslint` on the touched files | **PASS** — exit 0 |

⚠️ **Two intermediate runs went red and BOTH were environment, not code** — written up as **L-074**.
Run 1: `1 failed` (case 4, `/impressum` etc.) in 4.0m. Run 2: `3 failed` (cases 2, 3, 8) in 6.7m,
**with nothing changed between them**. The tell is that the failing case *moved*: two runs failing
different pre-existing cases cannot both describe one defect. The server log had it —
`GET / 200 in 17.8s (application-code: 17.4s)` against Playwright's 5s assertion timeout, because
`.next` had been wiped (correctly, per L-025) and the CSS edits re-invalidated it. Warming five
routes returned the suite to **21/21 with zero code changes**.

## Fence — verified independently, not taken on report

| Claim | Evidence |
|---|---|
| `globals.css` is a **pure append** | `git diff -U0 … \| grep -c '^-[^-]'` → **0 deletions**. `.speclist-scroll` (the fragile block L-025 was written about) untouched |
| `B2BOnlyBand.tsx` docstring only | `+1/-1`, line 4, `full-bleed` dropped, **zero JSX** — the one authorised exception, used exactly once |
| `page.tsx` | `+3/-0`: import + element between `<SocialProof />` and `<B2BOnlyBand />`. `metadata` and the D-01 redirect intact |
| **No reduced-motion leak** | The block declares exactly **three** animations — `.dpb-ring`→`dpb-spin`, `.dpb-star`→`dpb-counter`, `.dpb-lock`→`dpb-pulse` — and the reduce rule names exactly those three. `.dpb-card` and `.dpb-core` declare none. 1:1, nothing uncovered |
| Server component | no `"use client"`; only `Reveal` (already a fenced client island) is imported |
| Copy is the ADR's, not the prototype's | grep for `end to end of our stack`, `never leaves the EU`, `transatlantic` → **no matches** |

## Findings

### `critic` — 5 findings, **0 blocking**, 3 fixed, 2 to G4

All seven EARS criteria discharged, each with a named test. D2/D3/D4 conformance confirmed.
Accessibility clean: `aria-hidden` on the ring hides all twelve star SVGs *and* the lock in one
attribute; heading outline is `<h1>` (Hero) → `<h2>` (§7a) → four `<h3>`, no skipped level; contrast
passes AA at every opacity used (eyebrow ≈6.5:1 against the gradient's lightest end).

- **N1 · ✅ FIXED** — `#data-protection` omitted `scroll-mt-24`, **which T01's own review added to
  `#what-you-can-do` earlier in this same slug**, for the same reason, citing the same ADR line.
  *"Two halves of one slug now read the same instruction differently."* Fair, and fixed.
- **N2 · ✅ FIXED** — the docstring sat above the private `CLAIMS` array, not above the exported
  `DataProtection`. Every neighbour attaches it to the exported symbol. Moved; `CLAIMS` kept a short
  comment recording that its sentences are the ADR's, not the prototype's.
- **N5 · ✅ FIXED** — `PLAN-T02.md` counted six cases (17-22) and "22 green". **There is no case
  22** — the plan's own row says M9 is discharged by the file run. Five cases ship; total is 21.
  Corrected so the G4 log does not hunt for a case that was never written.
- **N3 · → G4** — the sub-line `German hosting, EU AI models, encrypted throughout.` is
  un-invented (variant C's own, `index.html:422` — the builder cited `:421`, which is C's `<h2>`)
  but **no artifact records it as approved copy for what ships**. Substantively: `encrypted
  throughout` is unqualified and sits directly above the tile that qualifies it (*Encrypted in
  transit and at rest.*). **Same UWG § 5 family as G4 note 0.**
- **N4 · → G4** — variant A's claim tiles are `border-radius: 24px` + a 1px border (`rounded-3xl`);
  the shipped tiles are `rounded-2xl` (16px), no border. Padding was carried across exactly, which
  is why the radius stands out. Consequence: the tiles no longer echo the card's own `rounded-3xl`.

### `/code-review high` — 6 findings, **0 blocking**, 4 fixed, 1 to G4, 1 accepted-as-declared

- 🔴 **CR1 · → G4, THE ONE TO LOOK AT · `(code-review, globals.css .dpb-core)`**
  **The padlock rotates.** `.dpb-core` is a child of `.dpb-ring`, which runs `dpb-spin`
  (`rotate(360deg)`). Parent transforms apply to the whole subtree, and the core has **no
  counter-rotation** — the twelve stars get `dpb-counter` for exactly this reason, the core gets
  nothing. Measured live at t=11s: `.dpb-ring` → `matrix(0,1,-1,0,0,0)` (90°), `.dpb-core` →
  `transform: none`. **So the lock lies on its side at 11s and is upside-down at 22s**, and the
  core's off-centre highlight and directional shadow orbit with it.
  **NOT fixed, deliberately.** The locked prototype has the identical structure
  (`index.html:158-163` — `.ring .core` carries no counter-animation), so this ships **as
  approved**, and changing it is a design decision the ADR's blast radius does not authorise. It
  also bears directly on **J3** — *"the star ring reads as the EU flag, not as a loading spinner"* —
  which §5 already lists as Muskan's call.
  **The fix, if wanted, is one rule:** give `.dpb-core` a `dpb-counter-core` animation restating
  `rotate(-360deg)` over the same 44s, and add `.dpb-core` to the reduce rule's selector list.
  ⚠️ **Neither the tests nor a static screenshot can surface this** — cases 18/19 read
  `animationName`, and a screenshot catches one frame. It needs a human looking at motion.
- **CR2 · ✅ FIXED** — `.dpb-core` had been ported from the prototype's **generic** `.ring .core`
  (96px, `--color-brand-deep` shadow) rather than **variant C's own override** (`index.html:206-210`:
  104px, `rgba(0,0,0,.7)` shadow + a 10px `rgba(255,204,0,.07)` gold halo). A third, unrecorded
  departure from `?variant=C`. It matters on a dark card: a `#7a1638` shadow is near-invisible
  against the aubergine, and the gold halo is what visually ties the core to the EU stars. Restored
  to C's values, with a comment recording why.
- **CR4 · ✅ FIXED — and it was MY error, propagated into the code.** The CSS comment claimed
  giving `.dpb-star` its own fallback *"would silently defeat that override."* **That is false about
  `var()`**: a fallback is consulted only when the property is unset, and `.dpb-star` is always
  inside `.dpb-ring`, which always sets it — so a fallback there would be dead, not dangerous. The
  prototype is the counter-example (`index.html:150` uses `var(--ring,260px)` and `:205` overrides
  it correctly). **The false claim originated in `PLAN-T02.md` §1.2 point 3, which I wrote**, and
  the builder faithfully turned it into a source comment. Both corrected; the honest reason to
  declare it once is DRY, not correctness.
- **CR5 · ✅ FIXED** — the `14px` star inset was written **twice** (`.dpb-star`'s resting transform
  and `dpb-counter`'s `to` frame) with nothing enforcing agreement, and **no test guards it**: cases
  18/19 read `animationName` only, so editing one copy makes the stars spiral off the ring radius
  over each 44s cycle **while all 21 tests stay green**. Hoisted into `--dpb-inset` beside
  `--dpb-size`, so the two copies cannot disagree about the geometry.
- **CR6 · ✅ FIXED** — the block comment claimed the two gradient ends were the only non-token
  colours; `#ffcc00` and `#fff` are literals in the same block. Inventory corrected to four.
- **CR3 · → G4, accepted as a declared departure** — `@media (max-width: 480px) { .dpb-ring
  { --dpb-size: 168px } }` is **outside ADR §4's authorised radius** for `globals.css` (which names
  the three keyframes and *one* reduce rule) and no test exercises it: case 21 passes with or
  without, because at 375px the card's content box is 263px, which already fits the 220px ring.
  **Kept rather than removed** — it is defensive responsive polish, and stripping it risks a
  cramped mobile render that the visual pass would then flag. Recorded as a departure so it is
  decided rather than unnoticed.

## The builder's seven declared deviations — recorded here because they existed nowhere else

`critic` flagged that only two of the seven reached a reviewer and none had landed in a repo
artifact. *An instruction nothing carries is a wish.* All seven, with adjudication:

| # | Deviation | Adjudication |
|---|---|---|
| 1 | Sub-line taken from variant C rather than invented | **Right call** — un-invented and traceable. But unrecorded as approved copy → N3, G4 |
| 2 | Claim tiles `rounded-2xl bg-white/5` instead of A's `.glass` | **Faithful, not a departure.** D4 says A's treatment *on C's dark card*; `.glass` is white-62% and unreadable there, so the surface **had** to change. The radius that travelled with it is N4 → G4 |
| 3 | Added an aubergine-retinted `shadow-[…]` on the card div | **Accepted** — `B2BOnlyBand.tsx:14` carries the equivalent raspberry-tinted shadow; retinting matches the idiom |
| 4 | `as CSSProperties` cast on the star's inline style | **Required** — csstype has no index signature for `--*` custom properties |
| 5 | Explicit `0%`/`100%` gradient stops | **Cosmetic**, identical rendered output |
| 6 | Also ran `next build` | **Correct** — PLAN-T02 §2 step 4 names it |
| 7 | Re-ran Playwright/eslint through `node …/cli.js` because `rtk` collapsed the output | **Correct, and the right instinct** — HEL-80. Same result both ways |

## Verdict — T02

**No blocking findings from either reviewer.** 11 findings: **7 fixed**, 4 carried to G4.
Post-fix gate: `tsc` clean · `eslint` clean · **21/21** · `globals.css` still a pure append.
🔴 **CR1 (the rotating padlock) is the one that needs your eyes on motion, not on a screenshot.**

### `visual-verifier` — G4 staging (T02)

**27 screenshots + one GIF**, all `t02-` prefixed, in `g4/`. Driven through Playwright rather than
the Chrome extension, which is what made exact animation phases possible. `supabase db reset`
skipped (`/` is public, `DataProtection` is static, every context is cookie-free — a reset would be
destructive for no benefit). Cookie banner suppressed by CSS, **not** clicked.

#### 🔴 The rotating padlock — confirmed three ways, and it looks broken

`t02-lock-rotation.gif` (24 frames, one full 44s cycle) · `t02-lock-rotation-strip.png` · four
singles at 0/11/22/33s.

`.dpb-core`'s own transform is `none` while `.dpb-ring` reads 90° at t=11s, so **the core's net
rotation is the ring's**. Two independent real-time runs measured 58.5→148.8→238.4→328.4° and
40.1→130.1→220.2° at 11s intervals — exactly 90° per 11s, so the paused frames are live behaviour,
not a pausing artefact.

**The verifier's plain verdict: "it looks broken."** At 11s and 33s the padlock reads as a coffee
mug; at 22s as a handbag. The core's specular highlight tips with it, so at 22s the sphere is lit
from below. **A padlock is an orientation-bearing glyph** — a sideways keyhole is not something a
viewer can read as intentional. Faithful to the locked prototype (`index.html:158-163`, no
counter-rotation on the core): **a faithful build of a prototype defect, not a build error.**

#### 🔴 A second, sharper finding on J3 — the 44-second cycle is invisible except through the bug

With the core hidden, the twelve stars were compared byte-for-byte across phases: **phase 30° and
phase 60° are pixel-identical to phase 0.** Twelve stars at 30° spacing, each counter-rotated
upright, means **the star field's visual period is 3.67 seconds, not 44.** The stars drift 30° and
reset, forever.

**So the only element communicating the long revolution is the padlock — and it communicates it by
falling over.** On J3 as asked: *static*, the ring reads as the EU flag. *In motion*, the stars read
as a slow 3.7s shimmer — closer to a spinner than a flag — and the lock reads as a bug.

#### Staging table (abridged; full table in the agent's return)

| Item | Shipped | Approved design | Verdict |
|---|---|---|---|
| AC 1-5 (position, claims+sentences, motion on, reduced-motion, no-JS) | all as specified | — | **match** |
| Palette | `linear-gradient(120deg, rgb(26,10,46), rgb(122,22,56) 55%, rgb(61,15,38))` | prototype C computes the **identical** string | **match**, byte-for-byte |
| Ring + core geometry | 220px ring, 12 stars, 22px glyphs, **104px core**, C's own shadow + gold halo | survives from C unchanged | **match**, byte-for-byte *(this is CR2's fix landing)* |
| **D3 containment** | contained `rounded-3xl`, `max-w-6xl` | **the amendment** — prototype's full-bleed superseded | **match to approved** |
| **D4 claim grid** | 4-up grid, §7a 724px tall vs prototype's 568px | **the amendment** — A's grid on C's card, taller | **match to approved** |
| **J5 — dark card + pink band** | two `rounded-3xl` cards, same 1152px width, same radius, 48px white gutter | D3 was made to answer exactly this | ✅ **match — D3 worked** |
| Eyebrow `Security & compliance` | present | **not in variant C at all** — comes from `PLAN-T02.md`. A third departure, at build-plan level | **differs** → G4 |
| Type scale | h2 30px @1440, sub 14px | prototype C: h2 **40px** @1440, sub 16px | **differs** → G4 (fourth departure) |
| §7a at 375 | section is **1252px tall** — ~1.5 phone viewports | D4 accepted §7a would be taller | **needs-a-human-call** → G4 |
| Fit, 15 widths 320→1920 | ring never clipped, grid steps 1→2→4 cleanly at 640/1024 | — | **match** |
| **320px overflow** | document overflows (`scrollWidth 359`) — but of **113 overflowing elements, ZERO are inside `#data-protection`**; all are hero `hs-blob-*` / `hdf-*` | ADR §5: red without 0028's diff = pre-existing, **file, do not fix** | **pre-existing page bug** → own ticket |

Text contrast passes AA throughout: `<h3>` 10.2-12.6:1, body 5.7-6.9:1, eyebrow 4.6:1 (narrowly).

#### Two fixes this pass forced — both reversed an earlier call of mine

- **✅ REMOVED the `@media (max-width: 480px)` ring shrink (was CR3, "accepted as declared").** The
  verifier measured it and it was **both unnecessary and harmful**: at 375px the card's content box
  is 263px, so the full 220px ring fits with **21px slack each side** and clips nothing — *and* the
  shrink moved only `--dpb-size` while `.dpb-core` stayed 104px and stars stayed 22px, so the
  ring-to-core gap went **23px → −3px and the stars overlapped the core's gold halo.** It was also
  outside ADR §4's authorised radius. Removed, with the measurements recorded in the CSS.
  **I had accepted this on reasoning; measurement overturned it.**
- **✅ ADDED a 1px hairline border to the claim tiles, and restored `rounded-3xl` (was N4).** The
  radius was the lesser half. The measurable failure: `bg-white/5` over that gradient gives
  **1.01-1.09:1 fill contrast** against the card the tiles sit on — tile 1 is **1.01, i.e. its
  boundary is invisible**, and the tiles only read where the card's gradient happens to shift
  beneath them. Variant A's tiles carry a 1px border, which is what gave them an edge; dropping it
  on a *dark* card (where 5% white has nowhere near the separation 62% white had on a light one) is
  the substantive deviation from what D4 cited. `border-white/15` chosen conservatively —
  **the exact opacity is a G4 call.**

#### J5, answered

**D3 worked; the premise really did dissolve.** Two cards of identical width and identical
`rounded-3xl` radius, separated by a clean 48px white gutter, read as a deliberate pair — dark
statement, then bright statement — not a collision. No seam left to argue about. One live question:
§7a's core is `radial-gradient(brand → brand-deep)`, the **same pink** as the band 400px below.
Either a rhyme or a duplicated accent; the verifier leans rhyme.

---

## Post-G4 fixes — 2026-09-08, on Muskan's instruction

Two of the nine G4 calls were answered "yes, fix". Both were one-line changes; both were verified
by **measurement**, not by eye alone.

### 1. The §7a padlock no longer rotates *(was G4 call 2 / CR1)*

`.dpb-core` gained `animation: dpb-counter-core 44s linear infinite` with
`@keyframes dpb-counter-core { to { transform: rotate(-360deg); } }` — the same cancellation
`.dpb-star` already used, at the same period and timing function (any mismatch and the cancellation
drifts). Safe to animate `transform` on the core because it is centred by `inset: 0; margin: auto`,
**not** by a transform, so no positioning is lost.

⚠️ **The important half of this fix is not the keyframe.** Adding a fourth animated element means
adding it to the reduced-motion rule — otherwise the fix *creates* exactly the leak invariant M4
exists to catch, and leaves the padlock spinning backwards against a stationary ring for a
reduced-motion visitor, which is worse than the bug it replaced. So:

- `@media (prefers-reduced-motion: reduce)` now names **all four**: `.dpb-ring, .dpb-star,
  .dpb-core, .dpb-lock`
- **e2e cases 18 and 19 extended to enumerate `.dpb-core`.** Case 18 proves it animates when motion
  is allowed; case 19 proves it stops under reduce. Symmetric by design — every element the reduce
  rule names must also be proven to animate, or M4 goes vacuous for that element.

**Verified:** net lock rotation `= 0.0` at two independent phases — `ring 8.2° + core 351.8°` and
`ring 89.9° + core 270.1°`. *(Honest limit: `animations: 'disabled'` on the first screenshot froze
the ring, so the 22s/33s samples re-read one phase rather than three. Two distinct phases both
netting exactly zero is conclusive given the cancellation is deterministic, but four phases were
not sampled.)* Frames in `g4/t02-lock-FIXED-*.png`.

**Consequence for J3, worth stating:** the star field's visual period was always 3.67s, so the 44s
revolution was only ever legible *through* the tumbling lock. What ships now is a slow continuous
star drift around a stationary padlock — which is what J3 actually asks for (*ambient*, not a
spinner).

### 2. §4's orphan row is gone *(was G4 call 4 / F6)*

`sm:grid-cols-2 lg:grid-cols-3` → **`sm:grid-cols-3`**, byte-identical to `HowItWorks.tsx:37` one
section below, which carries the same three-card shape and never orphaned. The `sm:grid-cols-2` was
left over from when §4 had four cards.

**Verified:** §4 renders **1 row at 768, 900 and 1023px** — the full band that previously showed
2 + 1 with an empty half. `g4/t01-s4-FIXED-{768,900,1023}.png`.

### Gate after both fixes

`tsc` clean · **landing e2e 21/21** · `globals.css` still a pure append (0 deletions).
Server warmed before the run, per **L-074**.

**Seven G4 calls remain open** — see `STATE.md`'s G4 table. The headline one is unchanged and
unaffected by these fixes: **"All data is hosted in Germany" is substantiated only for the database
tier.**
