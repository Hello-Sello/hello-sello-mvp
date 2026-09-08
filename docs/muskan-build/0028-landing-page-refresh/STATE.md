# 0028 landing-page-refresh — work order

lane:   STANDARD
branch: claude/muskan/work
stage:  design ✅ → build ✅ → G4 ✅ → G5 ✅ → **SLUG COMPLETE, 2026-09-08**
        Merged to `dev` only (`8fb3228`); Ayush continues landing-page work on top before any
        `dev → main` release. ⚠️ **One G4 item survives closure, unresolved — see "Still open" below.**

## Seed
Marcel, via Linear DEV-164 "LANDINGPAGE" (2026-07-24), routed by Muskan 2026-09-07 via /triage:
"1. Header: New Slogan for main page: ONE SECURE SPACE FOR EVERY B2B DEAL
2. Subtitle: 'Turn daily conversations into structured deals - together. Your fully EU GDPR
compliant AI plattform for buyers and sellers to trade with encrypted chat. All data is hosted
in Germany.'
3. Video Animation
4. What you can do on Hello Sello? Buyers and sellers can create offers and orders… Send deals
and orders to all your customers and suppliers. One big plattform to connect and trade fast…..
5. How your data is protected? GDPR data encryption germany hosted EU AI models
6. Animation European stars and locks"

## Triage — the YES answers
| # | | | evidence |
|---|---|---|---|
| 0 | broken / never worked? | NO | new copy ask |
| 1 | new screen? | NO | `src/app/_landing/` exists (Hero, ValueProps, HowItWorks, TrustedBy) |
| 2 | migration/RLS/RPC/auth? | NO | client-side copy/asset only |
| 3 | concept not in CONTEXT.md? | NO | "landing page" already a named surface |
| 4 | changes what the product does? | NO | text/asset swap, no new logic |
| 5 | file locked elsewhere? | NO | ayush.md + muskan.md both fully released |
| 6 | more than one ticket? | **YES** | (a) copy swaps on existing components (Hero headline/subhead, a "what you can do" section) vs. (b) a net-new "How your data is protected" section + its stars/locks animation — different kind of work, no existing section to edit |

**Lane: STANDARD.**

## Files so far
| stage  | wrote |
|--------|-------|
| triage | this file |
| spec   | `docs/PRD/0028-landing-page-refresh.md` |
| prototype | `prototypes/landing-refresh-prototype/` (index.html + NOTES.md, 3 variants) |
| design | `docs/architecture/adr/0010-landing-trust-band.md` · `RESEARCH.md` · `TICKETS.md` · row in `docs/architecture/adr/ADR-INDEX.md` · amendment banners in `NOTES.md` + this file |
| build  | `PLAN-T01.md` · `PLAN-T02.md` (both written before any code; `REVIEW.md` follows at step 7) |

`RESEARCH.md` exists after all — `/spec --amend` skipped the prior-art sweep, but `/design` ran its
own **approaches** sweep, which is a different question.

## Locked
**Prototype variant C + EU circle** (Muskan, 2026-09-07). §7a is a dark band carrying the EU
flag's circle of twelve gold stars around a lock, with the four claims as pills. §4 lands on
**3 cards** — Marcel's two capabilities plus the "Verified partners only" card kept from today's
`ValueProps` (`ValueProps.tsx:13`).

⚠️ **AMENDED TWICE AT `/design`, 2026-09-07** (Muskan, ADR 0010 §5b):
1. **§7a is a contained `rounded-3xl` card, NOT full-bleed** (D3). This line previously said
   "full-bleed"; the prototype had drawn the pink B2B band full-bleed too, and the real component
   is a rounded card (`B2BOnlyBand.tsx:12-14`), so variant C was judged against a page that does
   not exist.
2. **The four claims are a 4-up grid of label + one supporting sentence, NOT pills** (D4) —
   variant A's claim treatment on C's dark card. §7a ships taller than the prototype.

**Also locked:** the subtitle ships **corrected**, not verbatim — `platform`, em dash (D5,
supersedes PRD AC 2).

**Rendered spec:** `prototypes/landing-refresh-prototype/` (`?variant=C`) **for palette, ring
geometry and type only** — see the amendment banner at the top of that folder's `NOTES.md`.
`variant-C.png` is superseded on containment. **`visual-verifier` must be pointed at the
amendment, not at the raw prototype.**

## Deferred
- **Item 3, "Video Animation"** — OUT OF SCOPE this slug. `HeroDealFlow.tsx` already provides the
  hero's animated product-visual (chat → signed Deal Card), documented in its own file as "the
  framed product-visual slot." Muskan's ruling 2026-09-07: the existing animation satisfies this
  ask; no new video asset needed.
- **German translation** (D-09) — English copy ships; the nav toggle slot stays reserved and
  non-functional. Copy deliberately stays inline rather than moving to a `copy.ts`
  (ADR 0010 D1) — the extraction is owed on the day a second locale actually lands, and
  `next-intl` is the destination then, not a hand-rolled module.
- **Legal pages, cookie banner, B2B band, restyling** — untouched, per the PRD's Out list.
- **`docs/product/PITCH.md:17`** still leads `## AI FOR DEALMAKERS`. Ruled at G3: leave it stale.
- **WCAG 2.2.2 (Pause/Stop/Hide)** — §7a's 44s loop inherits the same unaddressed exposure the
  Aurora blobs and `ProductFlipCard` already carry. 0028 neither worsens nor fixes it.
- **`globals.css` is now five animation vocabularies** (`hs-blob-`, `dc-`, `hdf-`, `pcard-`,
  `dpb-`). Each is scoped and none leak, but extraction is its own slug.
- **Prototype cleanup** — delete variants A/B, `.check.mjs` and the PNGs at `/ship`
  (`NOTES.md`, "Cleanup owed").

## Attempts

**Round 1 opened 2026-09-07** (session `build_0028`). Budgets per ticket, unspent:

| | T01 (DEV-178) | T02 (DEV-179) |
|---|---|---|
| `tests` | **0/2** — green on the first run | **0/2** — green on the first run |
| `blocking-findings` | **0/2** — zero blocking | **0/2** — zero blocking |
| `G4 rounds` | 1 — **not yet walked** | 1 — **not yet walked** |

**Both tickets closed the build loop without spending a single budget unit.** Across the whole
slug: `plan-checker` ×1, `/code-review high` ×2, `critic` ×2, `visual-verifier` ×2 — **one blocking
finding total** (T01's plan, caught before any code was written), **zero** against shipped code.
23 review findings: **13 fixed**, 1 rejected with reasoning, 9 carried to G4.
Commits `423b6f5` · `51d884b` · `5268f09`. **57 screenshots + one GIF** in `g4/` (verified via
`/bin/ls`, not the shell's `ls` — see the rollup note below on why that distinction mattered here).

**Reviewers routed for this diff:** `/code-review high` + `critic` **only**. `security` is **not**
routed — ADR §4 and §7b both record S1-S8 as genuinely N/A (no migration, no RLS, no RPC, no auth,
no server action; the only route touched is `/`, already public, its D-01 redirect unchanged).

## Gate log
- 2026-09-07 — spec written (no gate — G1 merged into G3, PIPELINE §9a)
- 2026-09-07 — prototype: 3 variants built + Playwright-verified; Muskan picked **C with the EU
  circle of stars**. §4 = 3 cards. Two follow-ups recorded in the prototype's NOTES.md.
- 2026-09-07 — **G3 (spec + ADR, merged gate) — APPROVED.** ADR 0010 `0010-landing-trust-band.md`,
  indexed in `ADR-INDEX.md`. `adr-checker` ran the locked 2-round budget: **32 findings, 3
  blocking**, all folded in and spot-verified. Round 1's two rung-2s were one mistake twice — an
  invariant that passed on a §7a that never animated. Round 2's rung-3 was three remediations
  reported done that were not in the repo. Four product rulings closed (ADR §5b). Tickets
  **DEV-178** (T01, S) and **DEV-179** (T02, M, blocked by 178) created in Linear.
- 2026-09-07 — **build opened.** Base synced then **frozen**: the branch was 58 commits behind
  `origin/dev` and rebased clean (fast-forward, 0 unique commits) before any work. The `/design`
  stage's own output was uncommitted and blocking that rebase — committed as `17aa6bf`. Sync-lock
  ritual run and pushed (`78b875a`), closing the process gap this file flagged above. Environment
  verified: Supabase up, `alice@greenleaf.test` seeded and confirmed, **183/183 migrations applied
  (zero drift)**, dev server on `:3000` serving current pre-0028 code. `PLAN-T01.md` +
  `PLAN-T02.md` written, every cited line number re-read in the repo.
- 2026-09-07 — **T01 `plan-checker` round 1: REVISE — 1 blocking (rung 3) + 9 notes. All folded.**
  **The blocking find was a real deadlock:** the plan shipped card 2 as the prototype's *singular*
  `Send to every customer and supplier` while asserting the ADR's *plural* `/customers and
  suppliers/i` — case 15 would have gone red at step 1 and **stayed** red, forcing the builder to
  make a copy ruling the plan owed it. Both halves were individually right; they came from
  different authorities and were never intersected. Resolved **by the rule, not by preference** —
  `.claude/rules/product.md` makes the PRD beat the prototype, and four sources say plural against
  the prototype's one. Copy changed to `Send to all your customers and suppliers`; **the regex was
  deliberately NOT loosened.**
  Five findings were re-verified by direct query before folding (L-003), and three of those
  corrected claims *this plan* had made: the meta description is **165** chars, not 162; a dead
  import does **not** fail lint (`no-unused-vars` is `'warn'`, the script is a bare `eslint`, no
  `noUnusedLocals`) — so the plan had presented an unenforced gate as enforced; and
  `SectionHeading`'s h2-only guarantee was cited from its **docstring** (`:7-8`) rather than its
  code (`:29`), in a slug whose ADR argues comments are not contracts.
  Also surfaced: **the ADR contradicts itself on D-15** — its header says 0028 amends it, its §4
  says confirmation is owed and G3 never gave it. Carried to G4 with both citations.
  `plan-checker` budget: **1 round used.**
- 2026-09-07 — **T01 tests written and RED-confirmed by measurement.** Cases 13-16 appended to
  `e2e/landing.spec.ts` (M1, M2, M3, M10). Append verified mechanically: **106 insertions, zero
  deletions, one hunk at line 253** — cases 1-12 byte-identical.
  ⚠️ `test-writer` has no shell in this repo's agent definition, so it could only assert RED **by
  reading source**, and said so rather than implying it had run them. It was right to flag it: an
  unrun red test is a claim, not evidence. Ran all four directly — **4 failed, each for the right
  reason** (13 on the old `AI FOR DEALMAKERS` *text*, having passed its `count() === 1`; 14 on the
  old subhead; 15 on `#what-you-can-do` not existing; 16 on the old description). Case 13's reason
  was re-run alone to confirm it failed on the text and not the count, since that distinction is
  what M1 exists for.
- 2026-09-07 — **T01 BUILT, gate green. `tests` budget 0/2 spent — green on the first run.**
  Diff is exactly three source files (`Hero.tsx`, `ValueProps.tsx`, `page.tsx`) + the append-only
  spec. Fence held: nothing T02 owns, nothing in ADR §3's `Reused` list, `ValueProp` and the
  `Reveal` map byte-identical, Hero's `:13` docstring untouched as ruled. Builder reported **no
  deviations**; verified independently against the diff rather than accepted.
  **Gate:** `tsc` clean · **landing e2e 16/16** (12 pre-existing = AC 7 / M9, + 4 new) · unit
  **515 tests / 69 files** · `next build` clean, 33/33 pages, `/` still dynamic (the D-01 redirect
  path is exercised). `eslint src/` reports 6 errors — **proven pre-existing**, not inferred: the
  runner stashed the five changed files, re-ran on the true base tree, got the *identical* 6/4 at
  identical lines, then popped. Scoped lint on the three touched files is clean. Standing debt,
  not a T01 blocker.
  Two independent checks worth keeping: **no other spec navigates to `/`** or asserts any changed
  string (so M9's blast radius really is one file), and the reused dev server was confirmed to be
  serving the **new** HTML — a 16/16 against a stale server would have been worthless.
  Verified by hand, because neither has a test behind it: both em dashes are **U+2014** (including
  `ValueProps`' `sub`, which no case covers), and card 3's body survived as a pure move.
- 2026-09-07 — **T01 REVIEWED. `/code-review high` + `critic`, 12 findings, ZERO blocking.**
  `blocking-findings` budget **0/2 spent.** Full detail in `REVIEW.md`; the shape of it:
  **1 rejected with reasoning** — `/code-review` claimed case 16's two `not.toContain` guards were
  dead because the `toBe()` above "fully determines" `content`. **Its own failure scenario
  disproves it:** if someone reintroduces a retired phrase *and* updates the expected literal, the
  guards run against `content` — which is now that literal — and **fail**. The argument conflates
  *determined* with *passing*. Guards kept.
  **5 fixed** (one pass, so one fix round): `scroll-mt-24` added to the new anchor, completing the
  idiom ADR §5 told us to reuse · case 15 strengthened to assert the **verbs** and bind each
  capability to a **distinct** card — it previously passed a benefit-framed `Track offers and
  orders`, falsifying PRD AC 3's whole purpose · the prototype's amendment banner brought up to
  date (it said "AMENDED TWICE"; §4's copy has departed a third time) and its dead
  "Trade with verified partners" paraphrase corrected · **PRD FR2 + AC 2 marked superseded** —
  they still demanded Marcel's typos *verbatim*, so **G5 would have walked AC 2 and marked a
  correct page FAILED** · `ValueProps`' docstring claim of a "gradient icon tile" the markup does
  not have.
  ⚠️ **The strengthened assertion was proven to fire, not merely written** — card 1 was temporarily
  set to `Track offers and orders`, case 15 went red (`Received length: 0`), then reverted. Writing
  a stronger assertion without proving it fires is the vacuity trap M4b exists to close.
  **Post-fix gate:** `tsc` clean · scoped `eslint` clean · **landing e2e 16/16**.
  🔴 **One finding is Muskan's and cannot be closed here:** *"All data is hosted in Germany"* is
  substantiated only for the **database** tier. Verified — no `vercel.json`, no `preferredRegion`,
  no region in `next.config.ts`, so the Next server functions run in Vercel's default region. UWG
  § 5 exposure. `REVIEW.md` G4 note 0.
- 2026-09-07 — **T01 G4-STAGED. 21 live-vs-prototype screenshots in `g4/`.** Committed `423b6f5`
  (code) + `51d884b` (review + screenshots), both pushed. **The gate itself is NOT passed** — it is
  held open deliberately so T01 and T02 are walked together, once.
  Routing the verifier at the **amendment** rather than `?variant=C` is what stopped §4's cards 2
  and 3 being reported as failures; that was C2's entire purpose, and it worked.
  **Three design calls left for Muskan, none of them defects:** the eyebrow is a literal prefix of
  the heading and the page's only such pair · **the orphan row is 640-1023px, not just 768** — and
  `HowItWorks.tsx:37` next door already solves the identical 3-card problem with `sm:grid-cols-3`,
  a one-class change the ADR's blast radius does not authorise · the `<h1>` strands `DEAL` alone at
  640-700px.
  ⚠️ **One pre-existing bug found that vindicates ADR §2 in practice:** the cards'
  `hover:shadow-[…]` **never fires**. `.glass` (`globals.css:60-66`) sets `box-shadow` **unlayered**,
  and unlayered CSS outranks Tailwind v4's layered utilities regardless of specificity — so the
  utility loses silently on **every** `.glass` element. This is the exact cascade mechanism the ADR
  used to reject `motion-reduce:animate-none` for T02: the ADR argued it as theory, and it is
  already happening on the live page. **Wants its own ticket.** It also means T02's reduce rule
  belongs in the `dpb-` block, as planned — not on the elements.
  **T01 DONE for this stage.**
- 2026-09-07 — **T02 tests written and measured. Cases 17-21 appended** (M6, M4b, M4, M5, M8);
  **213 insertions, 0 deletions** — cases 1-16 byte-identical. `test-writer` again flagged it has
  no shell rather than asserting RED from source; ran them directly.
  **4 failed, 1 PASSED — and the pass is the useful result.** Case 21 (M8, no horizontal overflow
  at 375px) is **green before §7a exists**. ADR §5 anticipated the opposite — that M8 might be red
  for a pre-existing reason with no in-scope fix, and told us to stash and check. **Measuring it at
  the red stage inverts that problem:** we now hold a proven-green pre-diff baseline, so if M8 goes
  red after T02, **T02 caused it** — no stash archaeology required. M8 is a regression guard for
  this ticket, not a red-to-green criterion.
- 2026-09-07 — **T02 BUILT + REVIEWED. 11 findings, ZERO blocking. `tests 0/2`,
  `blocking-findings 0/2` — both budgets unspent.** Gate: `tsc` · `eslint` · **21/21** · 515 unit ·
  `next build`, all clean. **7 fixed, 4 to G4.** Full detail in `REVIEW.md`.
  **Fence verified independently, not on report:** `globals.css` **0 deletions** (pure append, the
  fragile `.speclist-scroll` untouched) · `B2BOnlyBand` `+1/-1` docstring, **zero JSX** ·
  `page.tsx` `+3/-0` · **no reduced-motion leak** — exactly three animations declared, exactly
  those three named in the reduce rule, `.dpb-card`/`.dpb-core` animate nothing.
  🔴 **The finding that needs Muskan's eyes on MOTION, not a screenshot: the padlock rotates.**
  `.dpb-core` is a child of the spinning `.dpb-ring`; parent transforms apply to descendants; the
  twelve stars carry `dpb-counter` to cancel it and **the core carries nothing**. Measured live —
  on its side at 11s, upside-down at 22s. **Not fixed: the locked prototype has the identical
  structure**, so it ships as approved, and it is squarely judgment item **J3**. One-rule fix
  documented if wanted.
  ⚠️ **One fixed finding was MY error, propagated into shipped code.** `PLAN-T02.md` asserted that
  giving `.dpb-star` a `var()` fallback "would silently defeat the override" — **false**; a
  fallback is consulted only when the property is unset. The builder faithfully turned my false
  claim into a source comment. Both corrected; the real reason to declare it once is DRY.
- 2026-09-07 — ⚠️ **Two red suite runs that were ENVIRONMENT, not code — written up as L-074.**
  Run 1: 1 failure (case 4, legal routes) in 4.0m. Run 2: 3 failures (cases 2, 3, 8) in 6.7m,
  **nothing changed between them**. The tell was that the failing case *moved* — two runs failing
  different pre-existing cases cannot both describe one defect. Server log had it:
  `GET / 200 in 17.8s (application-code: 17.4s)` against Playwright's 5s assertion timeout, because
  `.next` had been wiped (correctly, per L-025) and the CSS edits re-invalidated it. Warming five
  routes restored **21/21 with zero code changes**. **L-074 records the rule: check whether the
  failing case changes between runs BEFORE re-reading the diff.**
  Now at step 9, `visual-verifier` on §7a — briefed to capture the lock at four points in one 44s
  cycle, since neither a test nor a single frame can show a rotation.
- 2026-09-08 — **G4 ruled ACCEPTED by Muskan.** Two calls answered "fix" (padlock rotation, §4
  orphan row — both shipped in `abffde0`). Remaining seven G4 items (§7a's server-region claim,
  the eyebrow/heading duplication, the ADR self-contradiction on D-15, the four minor departures)
  accepted as-is or deferred — none are defects, all are judgment calls the pipeline correctly
  refused to make. `/ship` proceeding on that basis. Merge target for this round is **`dev` only**
  — Ayush continues landing-page work on top before any `dev → main` release.
- 2026-09-08 — **Rebase onto origin/dev: clean, no conflicts** (picked up DEV-167's shelf-position
  fix from a disjoint worktree session — zero file overlap).
- 2026-09-08 — **Full gate: tsc clean · unit 515/515 · eslint 6 pre-existing errors (same files/
  lines as the documented baseline, none in 0028's diff) · e2e 124+/146.** e2e failures fall into
  three proven buckets, none attributable to 0028: (a) the documented `sb_secret_` JWT key-class
  issue (~14, `auth.admin.createUser` rejects the new key format) · (b) 7 failures split across
  `present-edit-model.spec.ts`/`present-info.spec.ts`, pre-existing on `origin/dev` (confirmed:
  0028's diff never touches those files) · (c) 1 failure in `auth-gate.spec.ts`, also pre-existing.
  ⚠️ **One false alarm caught and fixed environmentally, not in code:** `landing.spec.ts:488`
  (today's `.dpb-core` counter-rotation fix) failed on the first run — the dev server was serving a
  **stale CSS bundle** from before `abffde0` (`.dpb-core` had no `animation` property in the actual
  served chunk, though the source file was correct). `.next` wiped, server restarted, routes warmed
  — bundle confirmed to contain `dpb-counter-core`, landing suite now 21/21. Same environment-fault
  class as L-074, different symptom (stale artifact, not slow-compile timeout).
- 2026-09-08 — **Security scan (Claude Security plugin, scan-changes mode): zero findings.**
  Verified the ADR's S1-S8 N/A call rather than trusting it — migration set byte-identical to
  origin/dev, no `middleware.ts`, all 4 touched components are server components, zero matches for
  any dynamic-input/secret pattern across all 496 added lines. One process caveat logged: a secret
  sweep's first run silently no-opped on an unsupported grep flag; re-run confirmed genuine no-match.
- 2026-09-08 — **e2e non-JWT failures resolved to root cause with dev_167's help.** Of the 7
  originally flagged: **3 in `present-edit-model.spec.ts` are stale test-ids**, broken since
  `1cb26e8` (2026-07-07) renamed `add-location-input/btn` → `add-shop-input/confirm` and the spec
  was never updated — unrelated to 0028 or to DEV-167's shelf-position fix, worth its own ticket
  (same shape as HEL-78). **4 in `present-info.spec.ts` remain genuinely undiagnosed** — all three
  test-ids used (`info-card-warehouse`, `info-more`, `present-banner`) still exist in source, so
  not stale-selector rot; dev_167 is running it down with a trace, not attributed to anything yet.
- 2026-09-08 — **Pushed to origin/claude/muskan/work.** Caught mid-push: the other active Muskan
  session (dev_167, same working tree) had pushed 2 docs-only commits directly to origin
  (`8b557db`, `68f5856`) after my last fetch. A plain `--force` would have dropped them silently.
  Verified via `--is-ancestor` (NO), confirmed both commits docs-only, cherry-picked both, verified
  content present, pushed with `--force-with-lease`. Origin now matches local HEAD exactly. → L-075.
- 2026-09-08 — **PR #192 (claude/muskan/work → dev) merged.** Merge commit `8fb3228`. Vercel
  deploy for `dev` confirmed READY.
- 2026-09-08 — **G5 PASSED.** Muskan walked `https://hello-sello-dh4tn7bgc-hello-sello.vercel.app`
  live and said "looks fine" — no per-item written detail against the five-point walk list below.
- 2026-09-08 — **`rollup` run.** Verdict table + contradiction list in the slug's records (this
  session's transcript; not copied verbatim here). Four factual corrections made as a direct
  result, each independently re-verified before fixing rather than taken on the rollup's word:
  `REVIEW.md`'s `critic` header said "3 fixed, 3 to G4" — body shows **4 fixed, 1 to G4 (C4), 1
  resolved (C6)**, header corrected. `PLAN-T02.md`'s Risks table (§4) still stated the `--dpb-size`
  fallback claim `REVIEW.md:406` said was "both corrected" — it wasn't, in this one location;
  corrected. Screenshot count corrected 48 → 57 (`/bin/ls`, not the shell's wrapped `ls`, which
  returned 0 on the first attempt — same silent-no-op class as the security scan's grep flag
  earlier in this slug; both are `rtk`-hook symptoms, not new bugs, and reinforce the standing
  HEL-80 backlog item rather than needing their own ticket).
  🔴 **Rollup's one substantive finding, not a paperwork one: G5's visual "looks fine" does not
  and structurally cannot discharge G4 item #1** — the Germany-hosting claim is still proven only
  for the database tier, still a live UWG §5 exposure. Carried forward below, explicitly, so
  closing this slug doesn't quietly close that with it.

## G5 — PASSED (visual walk only)

Deploy: `https://hello-sello-dh4tn7bgc-hello-sello.vercel.app`. Walked against PRD
`docs/PRD/0028-landing-page-refresh.md`'s acceptance criteria — hero headline/subhead, §4's three
capability cards, §7a, reduced motion. Muskan: "looks fine."

⚠️ **Still open after slug close — G4 item #1, unresolved by G5 or anything else in this slug:**
*"All data is hosted in Germany"* (`Hero.tsx:39`) is proven only for the database tier — no
`vercel.json`, no `preferredRegion`, no region pin in `next.config.ts`, so Next server functions
run in Vercel's default region. UWG § 5 exposure. Fix is infra (pin the region) or copy (narrow
the claim). Needs a decision and a tracked follow-up — not something this slug can close on its
own, and not something a visual walk was ever going to catch.

## For Muskan

### ✅ ALL FOUR CLOSED AT G3, 2026-09-07 — kept for the trail, nothing owed

| # | Ruling |
|---|---|
| 1 | Marcel's typos → **corrected**: `platform`, em dash. Supersedes PRD AC 2 |
| 2 | §4 card count → **3** (closed earlier, at prototype) |
| 3 | The stacking bands → **premise was false.** The pink band is a rounded card, not full-bleed; §7a ships **contained** |
| 4 | Claim labels → **each gets a supporting sentence.** 4-up grid, not pills |

Plus: `page.tsx:26`'s meta description and `B2BOnlyBand.tsx:4`'s docstring folded into scope;
`PITCH.md:17` left stale on purpose.

⚠️ **One process note.** `docs/architecture/adr/ADR-INDEX.md` is a shared file and was edited
**without the sync-lock ritual** (`docs/team/WORKFLOW.md`). Ayush offline, nothing locked, nothing
committed at the time — risk nil, but the step was skipped, not satisfied.

### Original text, as carried in from /spec
1. **Marcel's subtitle has two apparent typos** — "plattform" (German spelling) and a hyphen
   where an em dash is likely meant. AC 2 quotes his string **verbatim**, so G4 will walk it
   exactly as written. Correcting either is Muskan's call, not the builder's guess.
2. ~~**§4 recast is short two cards.**~~ ✅ **Closed at prototype 2026-09-07** — see `Locked`.
   3 cards: Marcel's two, plus "Trade with verified partners" kept from today's `ValueProps`.
3. **Two full-bleed bands now stack.** The chosen §7a runs straight into the existing pink
   B2B-only band with no separation. Decide at `/design`: spacing, a rounded bottom edge, or
   leave it.
4. **The chosen variant shows claim labels only, no supporting sentences.** PRD AC 4 only
   requires the four claims to appear, so this passes as specced — but the grounding detail
   (German data centre, EU-served models) is not on the page.

### Overruled during /spec (recorded per the skill's overrule rule)
3. Claude flagged "fully EU GDPR compliant" as contradicting the legal pages' "rechtlich noch
   nicht geprüft" notice, and "encrypted chat" as implying end-to-end. **Muskan overruled
   2026-09-07:** the pending-review notice covers the legal page *text*, not the platform's
   compliance; the two are separate facts. Marcel's copy ships verbatim.

### Resolved at triage (recorded for /spec --amend to carry forward)
Item 6, "stars and locks animation" pairs with item 5 ("How your data is protected") — a
genuinely new GDPR/security section, confirmed nowhere on the page today (`TrustedBy.tsx` is a
logo strip, `SocialProof.tsx` is testimonials/metrics). IN SCOPE. No source assets exist for the
stars/locks motif — /spec --amend should note it's a buildable CSS/SVG animation, not a video,
so scope stays achievable without waiting on Marcel for footage.

---

## ⏸ G4 — OWED. Nine items, one walk, both tickets.

**Nothing here is a defect blocking the build.** Both tickets are green with zero blocking
findings. These are the calls the pipeline is not allowed to make for you. Evidence: `REVIEW.md`
(full reasoning) and `g4/` (57 screenshots + `t02-lock-rotation.gif`).

| # | Call | Where |
|---|---|---|
| 1 | 🔴 **"All data is hosted in Germany" is proven only for the DATABASE.** No `vercel.json`, no `preferredRegion`, no region in `next.config.ts` — the Next server functions run in Vercel's default region unless the dashboard overrides it. **UWG § 5** exposure. Fix is infra (pin the region) or copy (narrow the claim) | `Hero.tsx:39` |
| 2 | ✅ **FIXED 2026-09-08 on Muskan's instruction — the §7a padlock no longer rotates.** `.dpb-core` gained `dpb-counter-core` (−360deg over the same 44s, `linear`), exactly as `.dpb-star` already did, and **joined the reduced-motion rule** — adding a fourth animation without naming it there would have been the very leak M4 exists to catch. Cases 18 and 19 extended to enumerate `.dpb-core`, so the pair stays symmetric. Verified by measurement: `ring 8.2° + core 351.8° = 0.0` and `ring 89.9° + core 270.1° = 0.0` | `g4/t02-lock-FIXED-*.png` |
| 3 | **The 44s cycle stays invisible — and that is now fine, arguably better.** 12 stars at 30° spacing, each counter-rotated upright ⇒ the star field's visual period is **3.67s, not 44s** (phases 30° and 60° are pixel-identical to 0°). With item 2 fixed, what remains is a slow continuous star drift around a **stationary** padlock. That is what **J3** asks for — *ambient*, not a spinner. Before the fix, the only thing communicating the long cycle was the lock falling over | — |
| 4 | ✅ **FIXED 2026-09-08 on Muskan's instruction — §4's orphan row is gone.** `sm:grid-cols-2 lg:grid-cols-3` → **`sm:grid-cols-3`**, byte-identical to `HowItWorks.tsx:37` one section down, which has the same three-card shape and never orphaned. The old `sm:grid-cols-2` was left over from when §4 had four cards. Verified: §4 renders **1 row at 768, 900 and 1023px** — the whole band that previously showed 2+1 | `g4/t01-s4-FIXED-*.png` |
| 5 | **§4's eyebrow is a literal prefix of its own heading** — `WHAT YOU CAN DO` above `What you can do on Hello Sello`. The page's only such pair. Faithful to the prototype | `ValueProps.tsx:32-33` |
| 6 | **`Hero.tsx:13` ships false** — still says "copy is interim placeholder framing (D-15)". **The ADR contradicts itself:** header `:8` says 0028 amends D-15; `:406-408` says confirmation is owed and G3 never gave it. Something is owed either way | `Hero.tsx:13` |
| 7 | **Two more §7a departures from variant C, neither in the ADR:** the eyebrow `Security & compliance` (not in C at all) and the type scale (h2 30px vs C's 40px at 1440) | `DataProtection.tsx` |
| 8 | **§7a is 1252px tall at 375px** — ~1.5 phone viewports for one section. The real mobile cost of D4's grid | `g4/t02-live-s7a-375-FINAL-ring220.png` |
| 9 | **Tile border opacity** — tiles gained a 1px hairline because `bg-white/5` measured **1.01:1** against the card (an invisible boundary). `border-white/15` was chosen conservatively; the exact value is yours | `DataProtection.tsx` |

### Three tickets this slug found but must not fix

1. **`.glass` kills every `hover:shadow` on the page.** `globals.css:60-66` sets `box-shadow`
   unlayered; unlayered CSS outranks Tailwind v4's layered utilities regardless of specificity, so
   the utility loses silently on **every** `.glass` element. Pre-existing. **This is the same
   cascade mechanism ADR §2 used to reject `motion-reduce:` — argued as theory, already happening.**
2. **The document overflows horizontally at 320px.** Of 113 overflowing elements, **zero** are in
   `#data-protection` — all are hero `hs-blob-*` / `hdf-*`. ADR §5's rule applies: file, do not fix.
3. **D6's promised "grep-based cleanup sweep" does not exist as a ticket.** `HowItWorks.tsx:20`
   still renders "no cross-company leaks" and `Footer.tsx:25` still renders "marketplace" — the
   latter now the page's only such claim, contradicting `.claude/rules/project.md`.
