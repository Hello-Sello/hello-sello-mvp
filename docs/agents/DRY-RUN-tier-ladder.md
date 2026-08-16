# Dry run — the tier ladder

> **What this is.** The build pipeline in `PIPELINE.md` is design-final and **nothing has
> been built.** Before writing a single skill or agent, we run the whole pipeline **by
> hand** on one real ticket, playing every role ourselves.
>
> **The point is to cut stages, not to admire them.** Per `PIPELINE.md` §13: *"If it
> catches nothing you would not have caught yourself, that is the signal to cut stages,
> not add them."*
>
> **Ticket:** the tier ladder — August MVP items 3–7 (`docs/muskan-build/august-mvp.md`).
> Chosen over the Discover migration batch because that one is a deploy job: it exercises
> only `/ship` and the security reviewer, leaving G1–G3 — the most speculative part of the
> design — untested. The tier ladder is FULL-lane and hits every stage.
>
> **Sealed:** 2026-08-14, before any stage was walked.

---

## The rules of this exercise

1. Predictions below are **sealed**. They do not get edited after a stage runs — if a
   prediction was wrong, it stays on the page as wrong.
2. Every stage gets walked **by hand**, and must produce its real artifact in its real
   home. A stage that cannot produce its artifact has failed, and that is a finding.
3. A catch only counts if it is written down **with the evidence** — a file, a line, a
   query. "The reviewer would probably notice X" is not a catch.
4. Each catch is scored against one question: **would Muskan have caught this herself?**
   That is the only question that decides whether a stage lives.

---

## The ticket in one paragraph

Today a product has exactly **one** volume bracket, stored as two nullable columns on
`pricelist_item` (`bundle_threshold_grams`, `bundle_price_per_gram`). Marcel's ask is a
**ladder** — several quantity breaks per product, seller-editable, buyer-visible, and
correctly applied when the buyer's basket turns into a deal. That means somewhere to put
rows 2, 3 and 4, an editor, a reveal, a resolver, and a deal card that shows which rung
was applied.

---

## Sealed predictions — what the pipeline will catch

| # | Stage | Predicted catch | Would Muskan have caught it? |
|---|---|---|---|
| 1 | triage | Migration ⇒ **FULL** lane, not TRIVIAL. "Price tier" is also a concept absent from `CONTEXT.md` | *(fill after)* |
| 2 | `/spec` G1 | Ambiguities: does the ladder **replace** `bundle_*` or sit beside it? `>=` or `>` at the threshold? Does the buyer see all rungs or only reachable ones? | |
| 3 | `researcher` | ~~Phase 15 (per-customer pricing) already claims `pricelist.relationship_id` — the tier table must not collide with it~~ **WRONG TARGET — overruled by Muskan, see stage log** | No — she caught the pipeline, not the reverse |
| 4 | `/prototype` G2 | The "See all prices" reveal gets eyeballed **before** it is built — session 69's lesson | |
| 5 | `/design` G3 ADR | The real invariant: rungs non-overlapping, ascending `min_grams`, exactly one base price. Enforced in the **DB** or the app? | |
| 6 | `plan-checker` | The plan misses call sites. `template.ts` (CSV import) and the `get_discoverable_shop` RPC are the two easiest to forget | |
| 7 | **`security`** | The new table needs RLS **and** the `price_public` gate mirrored in `get_discoverable_shop()`. Miss it ⇒ any verified user reads a rival's tier pricing | |
| 8 | `consistency` | The tier editor should reuse the `LotRow` pattern at `ProductCard.tsx:878`, not invent a new one | |
| 9 | `test-writer` | Resolver boundary cases: exactly at a threshold, below the lowest rung, above the highest | |
| 10 | `/ship` G5 | This makes **14** cloud-pending migrations, not 13 | |

**The headline bet is #7.** It is the catch least likely to be made unaided, and the only
one on this list where being wrong leaks another company's data.

---

## Predicted blast radius — 14 files

Verified against the repo on 2026-08-14. Two are new.

### Database

| # | File | Change |
|---|---|---|
| 1 | `supabase/migrations/<ts>_pricelist_tier.sql` **NEW** | The `pricelist_tier` table — one row per rung (`pricelist_item_id`, `min_grams`, `price_per_gram`) — plus RLS |
| 2 | `supabase/migrations/20260617090000_sec01_caller_verified_discover_gate.sql` | **Read-only reference.** `get_discoverable_shop()` (line 191) is the function that hides bundle prices behind `price_public`. A *new* migration must re-declare it to return tiers **and keep that gate** |
| 3 | `src/types/database.types.ts` | Regenerated, never hand-edited |

### Seller — building the ladder

| # | File | Change |
|---|---|---|
| 4 | `src/modules/catalog/components/ProductCard.tsx` | Edit mode gains repeatable "+ Add tier" rows (copy `LotRow`, line 878); the `Ng+` label at line 161 becomes a ladder |
| 5 | `src/modules/catalog/manage.ts` | Line 421 routes one price into `pricelist_item`. Needs a sibling that persists the tier rows |
| 6 | `src/modules/catalog/template.ts` | Lines 62–63 are the CSV columns for the single bracket — extend, or explicitly document as a gap |

### Buyer — reading the ladder

| # | File | Change |
|---|---|---|
| 7 | `src/modules/catalog/shop.ts` | The select string (line 164) and the mapping (line 226) must carry tiers |
| 8 | `src/app/discover/companies.ts` | Same shape, different reader (lines 170, 210) — **this is Marcel's actual path** |
| 9 | `src/app/present/ShopView.tsx` | Line 535 appends one threshold as a pack bubble; must handle a list |

### Basket and deal

| # | File | Change |
|---|---|---|
| 10 | `src/modules/basket/supabase/reads.ts` | Line 36 reads only `price_per_gram`; must fetch tiers too |
| 11 | `src/modules/basket/lib/<name>.ts` **NEW** | The resolver: quantity + rungs ⇒ price. Pure function, the only real logic here |
| 12 | `src/modules/basket/lib/toDraftLines.ts` | Line 20 passes `pricePerGram` through; should pass the **resolved** price |
| 13 | `src/modules/deals/supabase/reads.ts` | Line 451 re-reads price when building a deal — must resolve identically, or basket and deal card disagree |
| 14 | `src/modules/deals/components/CardFront.tsx` | DEV-156 — show which rung was applied |

**Pre-registered design smell:** #12 and #13 compute the same rule in two places. #11 must
be its single owner. If `/design` does not surface this unprompted, that is a miss.

---

## Stage log

*Filled as each stage is walked. Nothing below this line was written before the run.*

<!-- STAGE LOG BEGINS -->

### Stage 1 — `/triage` · walked 2026-08-14

**Verdict: FULL lane + sync ritual.**

| Q | Answer | Evidence |
|---|---|---|
| 0 · broken? | No — new capability | — |
| 1 · new surface? | No — lives inside the existing product card | `ProductCard.tsx` |
| 2 · migration / RLS / RPC? | **YES** ⇒ FULL | new table + `get_discoverable_shop()` |
| 3 · new concept? | **YES** ⇒ FULL | `CONTEXT.md` has "bundle" only, inside the Pricelist entry (line 109). No "tier", no "quantity break" |
| 4 · changes what the product does? | Yes | — |
| 5 · other engineer's lane? | **YES** ⇒ sync ritual | `deals/components/CardFront.tsx` is Ayush's |
| 6 · more than one ticket? | Yes, ~5 | — |

#### What it caught that was NOT predicted

**The snapshot rule.** `docs/architecture/CONTEXT.md:92` documents a system-wide pattern —
*standing agreement vs frozen snapshot.* A price lives in one mutable source-of-truth
table; any deal struck against it **copies** the value at strike time into
`deal_line_item.unit_price`. Changing the standing price never rewrites past deals. The
stated reason is regulatory: past deals must remain auditable in their original form.

Applied here: the **resolved rung price** is what gets snapshotted at signing. A seller
editing the ladder next week must not move last week's deal. Prediction #13 only said
basket and deal card "must resolve identically" — the real constraint is stricter and
legally motivated, and it lands on the write path, not the read path.

**Honesty note.** Triage did not *reason* its way here. Question 3 sent us to read
`CONTEXT.md` and the rule was sitting on the page. A cheap mechanical catch — but the
question is what caused the read, which is the whole argument for asking it.

#### What it got wrong — and who caught it

Prediction #3 aimed at the wrong target, and **Muskan overruled it, not the pipeline.**

> The tier ladder is a **public sales offer** — "buy 500g, pay less per gram" — the same
> for every buyer. It is a promotional mechanic, the kind a salesperson gives. The
> **customer-specific pricelist** (per-customer prices, the account/passport idea) is a
> **separate system**, and the pricelist cascade at `CONTEXT.md:55–58` belongs to that
> one, not to this feature.

So the reading of `CONTEXT.md` produced one real find and one false lead in the same pass.
The false lead survived until a human killed it. **Log this against any future claim that
the checker agents reduce the need for the human gate — here the human was the checker.**

#### Carried into `/spec`

1. Tier ladder = public offer, identical for all buyers. **Out of scope:** per-customer
   pricing (it is a different system).
2. The resolved price must be snapshotted onto the deal; editing the ladder must never
   rewrite a struck deal.
3. Sync ritual owed before touching `CardFront.tsx`.


### Stage 2 — `/spec` · researcher sweep + interview begun · 2026-08-14

**Researcher finds (by hand, docs corpus):**

1. **Prediction #3's correction was already on paper.** `DECISIONS.md:750` — per-customer
   "Customer Price / g" is **deferred post-v0 per Marcel**. The sweep finds in one grep
   what the sealed prediction got wrong. *Muskan caught it first in conversation* — but a
   real `/spec` runs the sweep before the human ever sees the spec, so score this one
   "stage would have caught it."
2. **The DRY smell is a locked decision, not a style note.** `DECISIONS.md:747` —
   *"Prices: one source of truth"* + `deal_line_item.unit_price` = frozen snapshot.
   Pre-registered files #12/#13 duplication would breach a lock, not just taste.
3. **A 15th file.** `docs/architecture/catalogue-ingestion-DESIGN.md:66,87` — TWO CSV
   contracts carry `bundle_min_grams` (catalogue + pricelist). Prediction #6 undercounted.
4. **"Tier" is overloaded** across the corpus (premium tier, reversibility tier, role
   tiers, autonomy ladder). Table naming must dodge this — unpredicted find.
5. **Marcel's real CSV has ONE bracket** (`Bundle Deal Volume (minimum)` + `Bundle Deal
   Price / g`). The ladder came from his ask, not his file — forced the scope question
   below.

**Interview (Muskan, live):**

- **Marcel's ask, verbatim: "Create 3 price tiers per product with dropdown."** Ladder is
  real; buyer-side dropdown confirmed.
- **Shape decided: child table, UI capped at 3** — not 6 columns on `pricelist_item`.
  Rationale: `DECISIONS.md` already rejects fixed-column shapes twice (terpenes,
  `buyer_product_code` — *"forces a painful extract-column-to-rows migration"*). A 4th
  tier later = a row, not a migration.
- Consequence: new table ⇒ prediction #7 (RLS + `get_discoverable_shop()` gate) is live.
- **Replace, not sit-beside** — the existing `bundle_threshold_grams` /
  `bundle_price_per_gram` bracket migrates into the tier table as each product's first
  rung, then the two columns are dropped. Rationale: the locked *"prices: one source of
  truth"* decision; sit-beside means every reader merges two sources forever.
  Consequence: all 7 existing call sites (incl. the sec01 RPC + both CSV contracts)
  switch to tiers **in this same build** — the blast radius is confirmed, not optional.
- **Base price stays put** on `pricelist_item.price_per_gram` (NOT NULL, unchanged). The
  tier table holds only the rungs above it. Rationale: the required column makes
  "product with no base price" impossible by construction — moving base into the table
  would turn that guarantee into an invariant someone has to enforce.
- **Assumptions stated, not asked** (routine calls): threshold is `>=` ("from 500g" means
  500 qualifies); the dropdown shows base + all rungs to every buyer — showing the ladder
  IS the sales pitch, per Marcel's ask.

**G1 — the gate caught one (2026-08-14).** Reading the draft spec, Muskan questioned the
line *"when the basket quantity reaches a rung, that rung's price is applied
automatically"* — and surfaced that the dropdown's role was underspecified: is it a
label, or does *selecting a volume* change the price? Resolved live: **the dropdown is an
order tool** — selecting a rung pre-fills that quantity into the basket; from there
basket quantity alone decides the price (re-resolves on edit, up or down). Spec §1, rule
6 and criterion 5a amended before approval. This is exactly the class of catch G1 exists
for — an interaction the author thought was obvious and the owner read differently.
**Unpredicted** (not on the sealed sheet), and not catchable by any agent: it required
the human who knows Marcel's intent.

**G1 APPROVED 2026-08-14** after a second question round (ascending rule, dropdown
visibility → deferred to G2 as look-and-feel, criterion 8 migration check). Spec status
flipped. Stage 2 complete. Prediction #2 scored: the ambiguity list was right in kind
(replace-vs-beside, `>=`, visibility) but the **best** G1 catch — dropdown-as-order-tool
— was not on it.

### Stage 3 — `/prototype` · G2 · 2026-08-14

Built `prototypes/0021-tier-ladder-prototype/` — the real ProductCard design replicated
(tokens from `globals.css`, structure from `ProductCard.tsx`), 3 buyer-dropdown variants
+ the seller editor with live ascending-validation and the 3-cap.

**Muskan's asks at this stage (before building):** number prototypes like PRDs/builds
(`prototypes/NNNN-<slug>-prototype/` — PIPELINE.md §6b amended); build ON the existing
card design, not an invented one; seller's post-save read view = the buyer view (spec
rule 3a added). The second ask is prediction #8's job (`consistency`: reuse existing
patterns) — **caught by Muskan at the gate before any agent existed to catch it.**

**G2 verdict: Variant B — "See all prices" inline panel.** No change requests. B as
prototyped = the G4 visual contract. Prediction #4 (the reveal gets eyeballed before
build) confirmed working — cheap gate, real decision made on a real rendering.

### Stage 4 — `/design` · ADR + adr-checker ×2 · 2026-08-14

**Setup change, on Muskan's suggestion:** the checker runs as a genuinely FRESH agent
(separate context, read-only tools) instead of the ADR's author re-reading his own work.
This turned out to be the decisive move of the whole dry run.

**Round 1 — REJECT, 11 findings (5 blocking).** Highlights the author had already
convinced himself were fine: `import_products()` WRITES the bundle columns (writer, not
reader — dropping them breaks CSV import); the shop RPC swap needs DROP+CREATE, which
resets grants → the anon gate would silently vanish (the exact sec01 accident class);
the parent table has THREE doors (2 policies + anon revoke), the ADR mirrored two; a
product may carry price rows on several pricelists and basket/RPC already pick with
different rules — a shared rung-resolver can't fix disagreeing parent rows; both named
resolver call sites were wrong; the "no new module edge" claim was false.

**Round 2 (fresh agent again, rev 2) — REJECT, 15 findings (8 blocking), almost all
NEW — the two checkers barely overlapped.** Worst: the migration never ENABLED RLS
(policies silently inert → cross-company ladder read/write; verified: every post-06-07
table enables by hand); the backfill crashes on half-filled brackets (min without
price — legal in today's CSV); single-migration drop 400s the still-deployed app
(migrations ship in ops sessions decoupled from deploys) → split expand/deploy/contract;
`getOwnCatalog`/`CardFront.lineFromCatalog` DOES have a quantity and writes prices —
a third row-picker obeying neither rule; `getMyShop` is a FOURTH picker (no order, no
deleted_at filter); the write path picks the OPPOSITE row (oldest-first); the ADR
contradicted the spec on post-draft re-pricing; and — best meta-catch — **the ADR
ignored PIPELINE.md's own mandatory template** (plain-English options comparison,
Reused, Blast-radius, ADR-INDEX — which didn't exist).

**Human decision surfaced to the gate:** post-draft quantity edits — auto re-price vs
negotiation-owned. **Muskan chose B (negotiation-owned + hint, human click applies).**
Spec amended (§1, criterion 6a). This is the correct shape: the checker found the
contradiction, the human resolved it.

**Rev 3 written** addressing all 15: RLS-enable as ritual #1, guarded backfill with
NOTICE count, expand→deploy→contract with dual-write window, `current_pricelist_item`
view as the single row-picker (all 4 readers + the writer), resolver in catalog's
public API (2 new edges, both into a leaf, justified), anon REVOKE ALL + lockdown-test
extension, template sections, `ADR-INDEX.md` created (0001–0004).

**Dry-run scoring so far:** predictions #5/#6/#7 all confirmed but UNDERSHOT — the
checkers found strictly more than predicted (#6 predicted 2 missed call sites; reality:
a missed WRITER, 4 divergent pickers, a deploy-order hazard). `adr-checker` was Tier 2
(hypothesis, cut-if-useless). **It has earned Tier 1 with two REJECT rounds of observed
catches.** Corollary: checker freshness matters — same prompt, disjoint findings across
rounds; plan at least 2 rounds after any major revision.

**Rounds 3–5 — the convergence experiment (Muskan's explicit ask: keep looping to see
when the checker runs dry, to inform how the real `adr-checker` gets built).**

| Round | Verdict | Findings (blocking) | Dominant NEW category |
|---|---|---|---|
| 1 | REJECT | 11 (5) | security doors · missed writer · wrong call sites |
| 2 | REJECT | 15 (8) | silent-failure mechanics (RLS enable, backfill crash) · deploy windows · pipeline's own template |
| 3 | REJECT | 15 (4) | mechanism-won't-function (view RLS zero-rows, helper arg mismatch) · invariant bucketing |
| 4 | APPROVE-WITH-FIXES | 14 (6) | invalid SQL-as-written · **cross-ADR contradiction (0001/0002 held-change)** · ops-ritual reality (batch push) |
| 5 | APPROVE-WITH-FIXES | 15 (6) | unit normalization (kg) · null contracts · tooling enforceability (lint can't see embeds) · data-loss at contract · **corrections of EARLIER rounds** |

**The answer to "when does it run dry": it doesn't.** Find-rate stayed flat (~14/round,
5 rounds, ~70 findings); what falls is SEVERITY — leaks → silent failures → won't-run →
behavioral edges → contracts/wording. And round 5 **overturned two earlier claims**:
the round-2 "policies silently inert" rationale is wrong (an `rls_auto_enable` event
trigger exists — ARCHITECTURE-NOTES:231 — the practice stands, the reason didn't), and
rev 4's own blast-radius flag about `getOwnCatalog` described a change that wouldn't
happen. Checkers also err; only repo evidence settles it.

**Design consequences for the real `adr-checker` (the load-up Muskan asked for):**
1. One pass ≠ one perspective. The agent's prompt should enumerate the observed
   categories as an explicit checklist: citation truth · security doors (RLS enable /
   policies / grants / anon / DEFINER re-grants) · Postgres semantics of every
   statement claimed verbatim · deploy-window + ops-ritual reality · call-site truth
   (writers, not just readers; quantities actually present) · cross-ADR contradictions
   via ADR-INDEX · data-loss at migrations · enforceability of every invariant bucket ·
   unit/null contracts.
2. **Bound the loop by severity, not exhaustion**: run 2 rounds; ship to the human gate
   when a round produces zero NEW blocking findings — never wait for zero findings.
3. Treat checker output as claims to spot-verify, not verdicts (two were wrong here).
4. The G3 human still decides — two findings in five rounds required Muskan
   (dropdown-as-order-tool at G1; decision B at G3); no round replaced her.

**Round 6 (rev 6) — REJECT, 8 blocking. The loop's most important lesson: THE FIXES
THEMSELVES INTRODUCED NEW HOLES.** Rev 6 added two mechanisms in response to round 5
(`save_price_ladder` RPC for atomic saves; a deferred constraint trigger) — and round 6
found the RPC was declared SECURITY DEFINER **with no ownership check**: any logged-in
user could rewrite any seller's prices. A live security door that did not exist in rev
5. Also: the partial unique index can't defer (ladder shifts trip it mid-save), the
trigger races under concurrency (needs `FOR UPDATE`), the resolver's unit rule
contradicted the very function it claimed to mirror, and the card's `units` multiplier
means card and basket bill the same grams to different rungs.

**Meta-lesson for the pipeline:** verdicts went R→R→R→AWF→AWF→**R** — the regression
tracks design GROWTH, not review quality. Every new mechanism is new attack surface;
a fix-loop only converges if revisions carry a **simplification bias** (prefer the fix
that removes a mechanism over the fix that adds one — e.g. checker's own suggestion:
make the RPC SECURITY INVOKER and let RLS enforce ownership for free, instead of
DEFINER + a hand-written authz check). Load this into the builder/fixer prompts, not
just the checker.

**Round 7 (rev 7, simplification bias applied) — APPROVE-WITH-FIXES, 4 blocking, 12
total (the series' low).** The bias worked: rev 7's removals (DEFINER→INVOKER, no
deferred constraints, delete+insert) generated no new holes; the 4 blockers were
refinements of standing mechanisms (lock placement, a missing `deleted_at`, a §3↔§4
contradiction) — plus **one spec-level catch requiring the human: acceptance criterion
5a was unbuildable** (the basket has no gram control; the drawer steps whole packs).
**Muskan chose A — add a grams/pack-size editor to the basket line** — over
renegotiating the criterion into pack arithmetic, on product grounds: buyers think in
grams and the ladder speaks grams; pack-only editing would confuse. Second G3 flag
accepted: the view's public arm gains `is_caller_verified()` (a tightening over
today's ungated table policy — the gate this repo already lost and reinstated once).

**Rev 8 written** — all 4 blockers + 8 notes folded (RPC locks parent as its FIRST
statement; policy gains rung-live check; E-time RPC sources legacy fields off the
view's picked id; grams editor; grep-guard scoped to `src/**`; `buy_schema` orphan
repair as E's precondition; the `20260618120100` precedent flagged as itself missing
the anon re-revoke — a live defect found incidentally, repair in this ticket).

**Convergence series, final: findings 11·15·15·14·15·14·12 — blockers 5·8·4·6·6·8·4.**
Never zero. The pipeline's checker loop MUST be budgeted (2 rounds + simplification
bias on fixes) and closed by the human gate, not by exhaustion.

*Filled at the end. One row per stage: **keep**, **cut**, or **change**.*

| Stage | Caught | Muskan would have caught it anyway? | Verdict |
|---|---|---|---|
| | | | |
