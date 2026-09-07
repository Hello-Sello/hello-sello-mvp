# 0028 landing-page-refresh — work order

lane:   STANDARD
branch: claude/muskan/work
stage:  design ✅ → build (next)

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
(none)

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
