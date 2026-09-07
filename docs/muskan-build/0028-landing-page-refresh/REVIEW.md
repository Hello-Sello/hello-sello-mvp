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

## Verdict — T01

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
