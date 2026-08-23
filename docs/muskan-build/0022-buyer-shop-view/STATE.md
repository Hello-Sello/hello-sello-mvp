# 0022 buyer-shop-view — work order
lane:   FULL
stage:  triage ✅ · spec ✅ (G1) · prototype ✅ (G2) · design ✅ (G3 2026-08-19) ·
        build: **T00 ✅** · **T03 ✅** · **T01 ✅** · **T02 ✅ (G4 2026-08-21)** ·
        **T04 ✅ (G4 2026-08-21 — accepted; e2e re-run ✅ + VISUAL PASS DONE 2026-08-22)**
        post-G4 ruling: env repair ✅ · DEV-83 ✅ · price gate ✅ · ADR amend ✅ (all 2026-08-22)
        **T05 ✅ G4 PASSED 2026-08-22 — all six items ruled (A-D built + mutation-proved, E dropped, F recorded)**
        **T09 ✅ G4 PASSED 2026-08-23 — Muskan: "pass" (all 5 items ruled).**
        **▶ T06 ⏸ G4 STAGED 2026-08-23 — re-verified green on current HEAD, walked live,
        AC 6 PROVEN (no price leaked). 6 items awaiting Muskan → `G4-T06.md`.** Then T07 · T08.
        **▶ T06 UNBLOCKED — its G4 resumes next · then T07 · T08.** T09's G4 follow-through is DONE:
        ADR-0005's Reused fence amended (both the `relationship` and `pending_inbox_item` lines,
        each carrying WHY), and **T10** (the accept path swallows its own errors — DEV-83's shape,
        made reachable by T09) + **T11** (`anon` holds TRUNCATE on ~90 tables) filed in TICKETS.md.
        **T06 BLOCKED at G4 on T09 (Muskan, 2026-08-22) · then T07 · T08.**
branch: **claude/muskan/work** — no feature branch (Muskan's call, 2026-08-18)
>  No cut: this slug is frontend-heavy with no expected migration, so a feature branch
>  would only add a merge step. `/ship` still rebases onto `dev` and PRs from here.
>  ⚠️ **If /spec or /design turns up a migration or an RLS change, revisit this** — that
>  is what earned 0021 its own branch.
>
>  ✅ **CONDITION FIRED at G1 (2026-08-19), reviewed, call UNCHANGED.** Spec decision 6
>  (an accepted relationship overrides `product.profile_visible`) is a permission-rule
>  change, so this slug DOES carry a migration. Muskan re-confirmed no feature branch:
>  sole owner, one migration (0021 had thirteen across eight tickets), and `/ship`
>  rebases either way. Trade-off accepted: the migration ships only when this whole
>  branch ships.
>
>  Base-branch trap, recorded so the next slug doesn't hit it: a feature branch here must
>  cut from `claude/muskan/work`, **never `origin/dev`**. At triage the work branch was 26
>  commits ahead, and `origin/dev` carried only `.claude/skills/track-doubt/` — none of the
>  pipeline skills. A branch cut from dev could not run `/spec` or `/build` at all. (0021
>  cut from dev legitimately: the work branch had just merged there via Release 1/2.
>  Always re-check the delta before cutting.)
seed:   "wehave to build the august_mvp what dhould be the next thing to build?" — Muskan, verbatim

> Routed to `docs/muskan-build/august-mvp.md` **item 2** — the only unbuilt item on the
> list. Items 1, 3, 4, 5, 6, 7 are verified done in code (releases 1+2 live; the tier
> ladder `0021` swallowed 3–7). Item 8 (production UAT) is blocked by this slug.

## What it is — Muskan's framing, 2026-08-18

> "From Discover, the user should be able to see the seller's shop properly, like the
> Present page we have for the seller, but just for the buyer's view."

**Not** "wire a basket button onto the existing tiles." The catalogue block on
`/discover/[companyId]` is a hand-written 2-up teaser grid. It gets **replaced** by the
buyer's version of the Present shop.

`/discover/[companyId]` is an EXISTING route (the page in the 2026-08-18 screenshot) —
one file serving every seller. No new route; its insides get rebuilt.

### The gap (Present has / Discover shows)
| Present | Discover today |
|---|---|
| shop banner + logo + info box | hero strip + one text line |
| description, links, locations | — |
| location/shop tabs | — |
| 4-up grid of `catalog/components/ProductCard` | 2-up grid of a local mini tile |
| flip card: full specs, lots, THC/CBD | one line of text |
| quantity stepper + pack sizes | — |
| "See all prices" tier ladder | — |

## Why FULL — the six questions
| # | | evidence |
|---|---|---|
| 0 | NO | never built; not a regression |
| 1 | **YES** | a buyer-side shop surface exists nowhere — `/present` is the seller editing their OWN shop |
| 2 | **UNCERTAIN → YES** | `get_discoverable_shop` already returns `tiers` (migration C, live) and `product_basket_line` is owner-scoped RLS, so the happy path looks backend-complete — but NOT proven: (a) can a buyer read a foreign seller's `current_pricelist_item` rows? (b) is a basket write gated on product visibility? |
| 3 | NO | `CONTEXT.md:130` "Product Basket" already names the buy-from-another-connected-shop case |
| 4 | YES | a buyer can place orders for the first time |
| 5 | NO | `docs/team/sync/*.md` — no locks held; Ayush offline |
| 6 | YES | page shell + card reuse + reads + basket write + UAT |

## Reuse already in place — confirmed in code
- `catalog/components/ProductCard.tsx` takes `editing?: boolean` (**defaults false**) and an
  `onAddToBasket?` hook documented as *"the store/send flow is a later phase; defaults to a
  no-op here."* The card was built expecting exactly this mode.
- `resolveTierPrice` + `ladderPanel` (the "See all prices" popover) ship with it.
- `get_discoverable_shop` returns a `tiers` column that `src/app/discover/companies.ts`
  currently **drops on the floor** — `DiscoverProduct` has no `tiers` field.
- `addToBasket` / `getMyBasket` / `BasketDrawer` all handle a foreign seller group already.

## Files so far
| stage  | wrote |
|--------|-------|
| triage | this file |
| triage | `docs/architecture/CONTEXT.md` — added the **Buyer shop view** section: `Buyer Shop View` + `Catalogue openness (L0/L1/L2)` (2026-08-18, Muskan approved) |
| spec   | `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md` — researcher sweep; settles Q2a/Q2b with citations |
| spec   | `docs/PRD/0022-buyer-shop-view.md` — the PRD, APPROVED at G1 |
| spec   | `docs/architecture/CONTEXT.md` — corrected `Buyer Shop View` ("connected buyer" → any verified buyer), per-product Request-pricing CTA, **new** `Connection override (visibility only)` term |
| spec   | `docs/decisions/DECISIONS.md` — 2026-08-19 entry: relationship overrides visibility, amends the 2026-06-14 soft-openness lock |
| spec   | `docs/superpowers/plans/2026-07-07-product-basket.md` — Tasks 9–11 marked DEAD (superseded); project `CLAUDE.md` loose end updated |
| prototype | `prototypes/0022-buyer-shop-view-prototype/` — `index.html` (variants A/B/C + the fit check) + `NOTES.md` (the G2 verdict) |
| prototype | `src/app/prototype-0022-buyer-shop/page.tsx` — **the chosen contract**: real AppShell + ShopView + ProductCard, hardcoded data. ⚠️ THROWAWAY — delete at `/build` |
| prototype | `src/app/present/PresentBanner.tsx`, `ShopView.tsx`, `InfoBox.tsx` — **real component fixes** the walk surfaced (see NOTES.md table) |
| build  | `docs/muskan-build/0022-buyer-shop-view/G4-T09.md` — **the T09 gate page: 5 holes closed, 7 criteria walked, 5 items for Muskan to rule** |
| design | `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md` — `## Approaches (design)` + 2 orchestrator corrections that made the slug bigger |
| design | `docs/architecture/adr/0005-buyer-shop-view.md` — **the ADR, rev 6, G3-accepted**. 4 checker rounds: 6 → 8 → 9 → 9 blocking |
| design | `docs/muskan-build/0022-buyer-shop-view/TICKETS.md` — **T00–T08**, INVEST + EARS, 3 slices + ops housekeeping |
| design | **Linear HEL-54 … HEL-62** — T00–T08 created 2026-08-19, team *Codebase Development Tickets*, all Backlog |
| design | `docs/architecture/adr/ADR-INDEX.md` — ADR-0005's line |

## Locked
- **Connection overrides `profile_visible`, never `price_public`** → the read path gains a
  relationship arm; the price arm is untouched. (`DECISIONS.md` 2026-08-19.)
- **One read door** — no parallel price reader for this surface (`ARCHITECTURE-NOTES.md:423`).
- **G2: variant A** — the buyer view REUSES `ShopView` + `ProductCard`. **A new card
  component is a build failure, not a style choice** (the `consistency` agent's question).
- **G2: buyer mode shows no owner chrome anywhere** — Manage shop, Present mode, SaveBar,
  banner/logo edit. PRD AC 11.
- **G4 · T02's `ShopView` fence AMENDED** (2026-08-19, Muskan: *"amend"*). Was *"no new state
  and no new branch"*; now **no new state, exactly one new branch** — a render conditional that
  suppresses the per-location group header when a single named location is the active filter
  (today the name renders twice, one line apart). Driven by state `ShopView` already owns. The
  rule below is **untouched**.
- **G3 · a `BuyerShopView` wrapper, NOT a 4th prop on `ShopView`** (ADR §1). `ShopView` gains
  no behaviour prop. Split trigger written down: a third consumer, or a 4th
  `viewerCanManage`-shaped boolean. Slots don't count.
- **G3 · the connection rule is written ONCE** (`is_connected_to_company`, `SECURITY INVOKER`
  — the first INVOKER policy helper in the tree, a deliberate departure) **and applied at
  exactly THREE of the seven gate sites** (ADR §3, rev 6): `product_public_select` (the basket
  reads `product` under the buyer's own RLS), the `current_pricelist_item` public arm, and
  `get_discoverable_shop`. **The other four are NOT touched** — the RPC and the view bypass
  RLS, so those policies are off the buyer's read path, and `plit_public_select`'s inlined gate
  is ADR-0004's deliberate defense-in-depth. *(rev 2-5 applied it to all seven; round 4 found
  four of them off-path. The cut resolved the ADR-0004 contradiction, the four-vs-three
  miscount, and most of the behaviour change at once.)*
- **G3 · the verification tightening is SIGNED — and rev 6 narrowed it to one policy.**
  `is_caller_verified()` lands on `product_public_select` only. **Sellers are unaffected**: all
  five `*_all` owner policies are owner-scoped and NOT verification-gated, so a seller manages
  their own shop, hidden products included, before verification. What changes: an unverified
  company can no longer read *other* companies' `product` rows directly. Belongs in the walk.
- **G3 · basket admission = one RESTRICTIVE `FOR ALL` policy**, carrying the owner arm and the
  **price** rule (decision 3 is server-side per PRD §6.5). The shipped owner policy is
  untouched. Two mechanisms were tried and rejected: an **RPC** (leaves the table's
  direct-write door open — the DEV-88 class) and a **column-REVOKE on `product_id`** (round 4:
  breaks `addToBasket`, whose upsert payload carries `product_id`, so every re-add would fail
  `42501`). `FOR ALL` closes the hole with no privilege surgery. Accepted cost, already out of
  scope in PRD §7: a line whose product later goes invisible can no longer be pack-count edited.
- **G3 · AC 3 AMENDED** — "opens a conversation" → "sends the seller a request naming that
  product; the conversation happens in chat once connected". Non-connected → inbox item;
  connected → chat. **The shop-level Request-pricing CTA is retired.**
- **G3 · `supplier_product_code` is NOT shown to buyers** (confidentiality; AC 7 omits it).
- **G3 · the card's buy row gates on `!editing && (priceShown || viewerIsOwner)`** — never on
  `price_per_gram != null` alone (breaks the seller's own unpriced products), and never without
  `!editing` (returns dead chrome to the space ADR-0004's tier editor needs). **`ShopView` must
  pass `viewerIsOwner={viewerCanManage}`** — round 4 found rev 5 required the prop and forbade
  the change that supplies it, so the gate would never have fired in buyer mode, with all tests
  green.
- **G3 · request pricing = ONE mechanism for both arms** — an inbox item naming the product,
  connected or not. rev 5 specified a chat-thread arm for connected buyers and gave it no design
  at all (no thread lookup, no message insert, no file, sized S); posting into an existing
  thread defers with the messaging slice. Decision 4's real requirement — the seller knows
  *which product* — is met either way.
- **G3 · site 7 gains an owner arm** (`or p.company_id = current_company_id()`) so a member of
  the seller's own company sees their whole catalogue from Discover — PRD §7 requires it and
  `is_connected_to_company` cannot supply it (a self-pair row is impossible under the
  canonical-order CHECK).

## Deferred — must NOT be built
- **AC 9 — ordering without a connection.** Split to its own slug at G3. Buildable as Muskan
  sequenced it (accept the connection first, then the order lands in chat), but it is the only
  part of the spec off Marcel's demo path. Its three real costs are recorded in ADR §9 — it is
  a slug, not a footnote.
- **A "deactivate / unavailable" product control.** Owed *because of* decision 6: repurposing
  `profile_visible` leaves the seller no switch that hides a product from **everyone**. The
  visibility-window columns survive un-overridden but have no UI and are the wrong shape for
  out-of-stock. Decide then whether delisted and out-of-stock are one concept or two.
  (Muskan, 2026-08-19.)
- Per-customer pricelists (Phase 15 — September; the one most likely to be confused with this)
- Cross-product bundles (September)
- Threshold nudge ("add 20g more and pay €7/g")
- Person-to-person deals (deals require a company `relationship`)
- Seller-side edit affordances on this surface — buyer view is READ + BUY only

## ✅ G4 · T04 — MUSKAN RULED 2026-08-21: all three ACCEPTED, execute in the order below

Muskan: *"I want you to do all of these, in the priority of building and shipping and
dangerous stuff."* All three rulings from `G4-T04.md` are **approved**. T04 itself is
**accepted at G4** with two things explicitly still owed (e2e re-run + visual pass), because
both are blocked by the environment, not by the ticket.

**▶ EXECUTION ORDER for the next session — highest first:**

**1 · REPAIR THE LOCAL STACK.** Blocks every e2e and every visual pass, for every ticket, so
nothing else can be *verified* until it is done. Full write-up + candidate fixes:
`docs/muskan-build/local-stack-grants-regression.md`. **Run the production-grants check FIRST**
(the SQL is in that file) — the entire fix premise is "prod is fine, local drifted", and if prod
also lacks `arwd` this becomes far more urgent than an environment bug.
⚠️ **Do NOT blanket-GRANT** — `supabase/policies/*.sql` runs AFTER migrations, so it would
re-open DEV-88's deliberate `person.company_id` revoke and make the lockdown suites lie.
Open question for Muskan, unanswered: which Supabase CLI version last worked? If unknown,
bisect releases. Currently unpinned at 10.9.7.

**2 · FIX DEV-83 — its own ticket, before this slug ships.** *Dangerous: silent failure on
Marcel's demo path.* A connected buyer's pricing ask can never be accepted — the seller clicks
Accept, **nothing happens, no error**, the item stays `pending` forever and the buyer cannot
re-ask. Proven: `SQLSTATE 23505` on `uq_relationship_pair_active`, rolled-back transaction. The
seeded relationship carries `inbox_item_id = NULL`, so `acceptInbox`'s probe (`store.ts:538`)
never matches and falls through to the INSERT; the throw is uncaught at `InboxView.tsx:137`
(`void refreshWith(...)`) and `RequestsSection.tsx:98` (try/finally, no catch).
Remedy ~6 lines — before inserting, look up an existing active relationship **for the pair** and
adopt it (returning its id + threads); `relationship` is per-pair by construction, so that is the
correct semantic regardless. **Muskan's call: NOT folded into T04** — `acceptInbox` serves every
accept flow (connect, message, pricing, deal card), so it gets its own tests. **`/ship` for slug
0022 is BLOCKED on this.**

**3 · ADD THE PRICE-PUBLIC GATE.** One line at `src/app/discover/actions.ts:141`:
`if (product.price_public) return { error: … }`. ADR §7 already pushed the identical predicate
server-side for basket admission; leaving the client gate as decoration is the inconsistency.
Needs a test (the server currently accepts an ask the UI would never offer).

**4 · AMEND THE ADR FENCE.** `docs/architecture/adr/0005-buyer-shop-view.md` — `Reused` section
and §6:575-577. Change *"`ShopView` … no behavioural modification"* → **"`ShopView` gains no new
props; internal handlers are allowed."** Rationale to record: the prop is what costs (every buyer
difference becomes a knob on the seller's shipped component); a private handler beside
`handleAddToBasket` is already that file's own pattern. This retires deviations 1 and 7.

**5 · THEN the owed T04 verification**, once step 1 lands: re-run `e2e/discover-shop.spec.ts`
(6 tests) + the four dependents, and run `visual-verifier` for the **owed visual G4** — the
button→confirmation swap and the inline error state have never been seen. Muskan has NOT waived it.

**6 · THEN resume the slug: T05 · T06 · T07 · T08.**

## ✅ ENVIRONMENT BLOCKER — CLEARED 2026-08-22

**Fixed by `supabase/migrations/20260607090000_stack_default_privileges.sql`** — a migration
timestamped BEFORE all 147 others, restoring the stack's default privileges for tables,
sequences and functions to production's exact values. Because it runs first, later migrations
inherit the grants and every deliberate REVOKE still runs after it and still wins — DEV-88's
`person.company_id` revoke and the anon function lockdown were both verified intact afterwards,
and it ships to prod as a verified no-op. Prod was checked FIRST, as the write-up demanded, and
was healthy. Drift was wider than tables: 9 of 86 RPCs were also unreachable locally. Full
record + a correction to the suspected trigger: `docs/muskan-build/local-stack-grants-regression.md`.

**e2e baseline, re-measured on a clean reset:** 146 tests · **102 pass / 22 fail** · all 22 in
the two documented pre-existing classes (13 `sb_secret_`/GoTrue-key, 9 `present-*` /
`public-profile` / `deal-p2p-send`). `deal-p2p-send` was missing from every earlier count and is
A/B-proven pre-existing. `deal-c2c-create` was NOT pre-existing — see the inbox crash below.

<details><summary>Original blocker text, kept for the diagnosis</summary>

**`supabase db reset` yielded a database the app could not read.** Role `authenticated`
holds SELECT on **1 of 92** public tables, so `/rest/v1/person` 403s, `requireVerified()` fails
closed, and every gated route bounces to `/home`. Root cause located: `pg_default_acl` for role
`postgres` in schema `public` reads `anon=Dxtm authenticated=Dxtm service_role=Dxtm` — `arwd`
stripped — while the `supabase_admin` row beside it still has the full set.

**Proven NOT caused by slug 0022:** zero migrations changed, all 147 applied, the only
`ALTER DEFAULT PRIVILEGES` in the tree targets FUNCTIONS. Suspected trigger: the Supabase CLI is
unpinned (now 10.9.7).

**⚠️ Do NOT "fix" it with a blanket GRANT.** `supabase/policies/*.sql` runs AFTER migrations, so a
blanket grant re-opens **DEV-88's** deliberate `person.company_id` revoke and makes the lockdown
suites assert against a state no real environment has.

Full write-up + candidate fixes: `docs/muskan-build/local-stack-grants-regression.md`.
Ticket-level record: `docs/muskan-build/0022-buyer-shop-view/blocked.md`.

</details>

## 🔴 FOUND + FIXED 2026-08-22 — `/connect/inbox` was DEAD, live on production

Surfaced while writing DEV-83's test; **not** caused by slug 0022 or by the stack repair.

Release 2's Discover person graph added a fifth `inbox_request_type` code, `connect_person`.
The connect module never learned it: `types.ts`'s `InboxRequestType` stayed a 4-value union, so
`REQUEST_TYPE_META[item.type]` returned `undefined` and `InboxRow.tsx:26` / `InboxDetail.tsx:72`
threw on `.icon`. `getInbox` applied no type filter, so **one** such row replaced the entire page
with "This page couldn't load". The seed plants exactly one (Clara → Alice), so it reproduced on
every clean reset — and **production held a live pending row**, meaning that company's inbox was
dead. `tsc` could not catch it: the stale thing was the union itself.

**Muskan's call:** person connection requests land on **Discover**, not the inbox. So `getInbox`
now filters to the company-inbox types, and that list is DERIVED from `REQUEST_TYPE_META`'s keys
— one authoritative statement instead of two that drift. `types.ts` documents the union as a
deliberate subset with the rule for adding to it. Discover's `RequestsSection` already had the
accept/decline path; nothing was built there.

**It was also masking a real failure:** `deal-c2c-create.spec.ts` (5 tests, incl. *"the ticket
lands in the other company's Deal tickets lens; accepting joins the deal"*) had been counted as
pre-existing and now passes.

Guard: `e2e/inbox-accept.spec.ts`. ⚠️ **The first version of that test passed against the broken
code** — `LensTabs` renders before `getInbox()` resolves, so every assertion landed in the
pre-crash window. It now waits on a row that MUST be present before concluding anything from a
row that must not.

## ✅ POST-G4 RULING — all four items DONE 2026-08-22

| # | item | outcome |
|---|---|---|
| 1 | local stack | ✅ migration `20260607090000`; prod parity row-for-row; DEV-88 + anon lockdown verified intact |
| 2 | **DEV-83** | ✅ `acceptInbox` is now **ensure-shaped** — see below. Unblocks `/ship`. |
| 3 | price-public gate | ✅ `actions.ts` refuses an ask on a price-public product; 3 unit tests, RED→GREEN proven |
| 4 | ADR fence amend | ✅ `0005-buyer-shop-view.md` both sites — "gains no new props; internal handlers allowed"; retires deviations 1 and 7 |

**DEV-83 went wider than the recorded ~6-line remedy (Muskan: *"fix it permanently"*).** The
schema declares three uniqueness rules — `uq_relationship_pair_active`, `uq_chat_thread_c2c`,
`uq_chat_thread_p2p` — and `acceptInbox` honoured none, deduping instead on `inbox_item_id`, a
column nothing enforces. So it was never only the seeded pair: **any** second substantive accept
between two already-connected companies raised `23505`. The adopt-only remedy would also have
skipped creating the P2P a `pricelist_request` opens, moving the silent failure one step later.
`acceptInbox` now adopts the relationship, reuses the existing C2C, and creates only what is
missing; **seed lines are written only for threads it creates**, so a double-accept cannot
double-post and two connected companies are never told they are "now connected" again.

**Gate for all four:** `tsc` clean · unit **448/448** (445 + 3 new) · eslint **6 errors, 0 new**
(the recorded pre-existing set) · SQL **35/35** · full e2e **102/22, zero new failures** ·
`discover-shop` + `inbox-accept` **8/8, twice in a row with no reset** (the new spec tears down
its own rows — `seed.sql` creates no `pricelist_request`, so every one is test residue).



## ▶ NEXT SESSION — start here

**Working agreement changed 2026-08-21 (Muskan's call): run the remaining tickets CONTINUOUSLY.**
Stop at G4 only for tickets that **render** or that **touch a locked decision**; batch the rest into
one gate with all the evidence. Stop immediately if a reviewer returns blocking or a fence must break.

| ticket | gate |
|---|---|
| **T05** `get_discoverable_shop` spec columns · **T06** the connection override · **T08** ledger housekeeping | **backend — batch into ONE G4** |
| **T04** per-product Request-pricing · **T07** | **renders — own visual G4 each** |

**Owed into those tickets, already recorded:**
- **T05/T06:** `database.types.ts` is **NOT reproducible** from `supabase gen types` (undocumented
  `update_deal_draft` hand-edit) — an in-place ⚠️ block sits above both tickets in TICKETS.md.
  Also owed to T05: `ShopRow` is still hand-typed behind `as unknown as` although the generator has
  all 15 columns, twelve lines below a comment forbidding exactly that — **T05 rewrites this RPC's
  shape**, so a renamed column arrives as `undefined` with `tsc` green.
- **T04:** wires the dead Request-pricing button; may reuse `RequestPricingActions.tsx`, which is
  dead-but-kept and still carries a docstring describing the retired shop-level CTA.
- **T02 leftovers:** `categories` is now dead (its one consumer was the rewritten `page.tsx`);
  `TAG_LABEL` is 3 codes behind the live taxonomy (`#Eu Gmp Cultivator`); the basket drawer goes
  transparent when the shop scrolls under it.

**⚠️ NOTHING IS COMMITTED.** T00, T01, T02, T03, the whole pipeline build, and every doc edit sit
uncommitted in the working tree on `claude/muskan/work`. Commits were deferred by Muskan on
2026-08-20 ("leave for now, focus on building"). **A new session should confirm the commit plan
before doing anything else.**

### ▶ T06's G4 resumes here — what it already owes (recorded, do NOT re-derive)

T06 was BUILT and GREEN and blocked only on T09, which has now shipped.

**✅ ALL THREE OWED COMMENT FIXES ARE WRITTEN (2026-08-23).** Comment-only — `git diff` on the
migration shows **zero non-comment lines changed**, so nothing re-tests:
- `20260822100000:343` — the TRUNCATE sentence now says what actually gates that verb (the table
  grant; Postgres exempts TRUNCATE from row security) and cites T11's proof (3 audit rows → 0).
- `20260822100000:30,34` — cascade list is **three**, with one line saying why `plit_public_select`
  is not a fourth (it already inlines `is_caller_verified()`, `20260814120000:74`).
- ADR-0005 row 4 now reads **role list narrowed** instead of `untouched`, and the round-3 N2
  correction at `:298-301` is itself corrected: it holds for the DEFINER RPC, **not** for the view
  — owner rights don't change the effective user id, so `rel_all` IS load-bearing at site 2.

**⚠️ ONE THING THIS FILE GOT WRONG, now fixed:** it said *"the ledger is right, the migration is
wrong."* **The ledger repeats the same over-count** (`cloud-migrations-pending.md:67`) and was
corrected in the same pass. Nobody had opened it. Recorded as **L-031**.

**T09 changed T06's ground:** the gate T06 builds is no longer ornamental — `relationship` can no
longer be self-minted, and a member can no longer self-verify. T06's G4 walk should re-confirm the
connection override against the locked-down write path, not the old one.

## Owed — surfaced by this slug, NOT in its scope

### ⚠️ A product must never be saved without a location (Muskan, 2026-08-22)

> *"if any product is unassigned or unfiled it simply doesn't appear on shop"*

**Ruled at T05's G4.** The buyer half shipped inside this slug (see the gate log); the seller half
did not, and is owed. Full reasoning in `DECISIONS.md` 2026-08-22.

**What is owed:**
- the price input's sibling problem — the save path, the add-product flow, and probably a
  `NOT NULL` constraint on `product.location`
- a backfill for existing NULL-location rows. **8 of the 13 products on production are unfiled**
  (Aurora 5, StonePharm 3), and **Aurora's are the only two buyer-visible products on all of
  production** — its shop goes empty the moment T05 deploys until they are filed. Demo data;
  Muskan's call is to refile them in the UI.
- once it ships, `ShopView`'s `named.length <= 1` filter rule becomes exact for the seller too, and
  the `Unassigned` pile becomes legacy-only. **Re-label, do not delete** — same treatment ADR-0005
  §6's owner criterion got, and the reason `AssignProductsDialog` must keep working.

**Explicitly dropped:** one product / many locations. Raised at the same G4 and rejected on cost —
a join table plus a rewrite of the drag-to-file dialog, the grouping, the RPC projection and the
filter, to model something no seller has asked for. `product.location` stays a single value.

**Pairs with** the blank-price rule below — same shape, same lane, and both are seller-side save-path
work. Worth doing as one ticket.


### ⚠️ A product must never carry a blank price (Muskan, 2026-08-19)

> *"the seller should not be allowed to leave price blank, they can always hide but price
> shouldn't be blank in product"*

**How it surfaced.** T03's plan check found a reachable cell: `price_public = true` with
`price_per_gram = null`. A seller ticks "Show price to buyers" (`ProductCard.tsx:616`) and saves
with the box blank — `writeStandardPrice` returns `{ ok: true }` on null (`manage.ts:449`). The
buyer then sees the pill **"Price on request"** (`:658`) with no way to request, because
ADR-0005 `:566-567` restricts Request-pricing to *deliberately hidden* prices. Three renderings
were offered; Muskan rejected the framing and fixed the cause instead — **hiding stays a dial,
blank stops being a state.**

**Why it is not in 0022.** Enforcement is seller-side: the price input's save path, the
add-product flow, probably a DB constraint, and a backfill for any existing null-price rows.
None of it lives in T03's two files, and 0022 is the buyer's read surface.

**Consequences to carry into that work:**
- **Do not** simply make `pricelist_item.price_per_gram` NOT NULL — a product with **no
  `pricelist_item` row at all** produces the same null through `get_discoverable_shop`'s LEFT
  JOIN (`20260816190000:140-141`). The rule is "every product has a live price row", not "no null
  column".
- **ADR-0005 §6's owner criterion becomes defensive rather than live.** *"the seller's own
  unpriced products keep their controls"* protects a state that would no longer be creatable.
  Keep the gate (legacy rows, and it costs nothing); re-label the criterion so a later reader
  does not delete it as dead code.
- **T00's fourth matrix corner is unaffected** — it is the `price_public` dial, not a null price.
  AUR-1D keeps its price row, which T00's pgTAP block (5) actively asserts.
- Until this ships, cell 12 stays reachable, so **T03 keeps a test for it**. Local only; `security`
  confirmed seed cannot reach production.

**Proposed for `docs/decisions/DECISIONS.md`** (propose-mode, awaiting Muskan's yes/no):
> **2026-08-19 — A product always carries a price; visibility is the only dial.** A seller may
> hide a price from buyers (`price_public = false`) but may not save a product without one.
> Rationale: the two states the DB distinguishes — "price on request" vs "price not set yet" —
> are indistinguishable and useless to a buyer, and the card cannot honestly render the second.
> Removing the state beats choosing a rendering for it. Surfaced by slug 0022 T03's plan check.

## Attempts

| ticket | plan-checker | tests | blocking-findings | G4 rounds |
|---|---|---|---|---|
| **T00** | **2 rounds** (rev 2 → 5 blocking · rev 3 → 2 blocking; 13 findings folded across rev 2-4) | **0 / 2** — green on the first `test-runner` pass, no retry | **0 / 2** — `critic` and `security` returned **no blocking** on T00's own diff | **1** — passed |
| **T03** | **1 round** (rev 1 → 4 blocking, all folded; rev 2 OK) | **0 / 2** — no retry needed | **0 / 2** — `critic` and `consistency` both returned **no blocking** | **1** — passed |
| **T02** | **2 rounds, budget SPENT, did NOT converge** (rev 1 → **9 blocking** · rev 2 → **8 blocking, all new, FIVE attacking rev 1's own fold-ins**) | **0 / 2** — green on the first pass | **0 / 2** — `consistency` no blocking; `critic` **2 blocking**, both fixed by the orchestrator | **1** — passed |
| **T04** | **2 rounds, budget SPENT, did NOT converge** (rev 1 → 5 blocking · rev 2 → **5 blocking, ALL NEW, all defects in rev 1's own fold-ins**; 21 notes folded across rev 2-4) | **0 / 2** — green on the first `test-runner` pass | **1 / 2** — `critic` 2 blocking (both scope rulings, escalated NOT fixed) · `security` + `consistency` no blocking; 7 notes fixed in one pass | **1** — passed 2026-08-21; owed visual pass DONE 2026-08-22 |
| **T05** | **2 rounds, budget SPENT, did NOT converge** (rev 1 → 7 blocking · rev 2 → **9 blocking, ALL inside rev 1's own fold-ins** — the 4th ticket on this slug) | **0 / 2** — green on the first `test-runner` pass, independently re-run from a clean reset | **1 / 2** — `critic` 1 blocking (fixed in one pass) · `security` **no blocking**; 9 + 6 notes, 5 fixed | **1** — PASSED 2026-08-22, all 6 staged items ruled (A-D built + mutation-proved, E dropped, F recorded) |
| **T01** | **2 rounds, budget SPENT, did NOT converge** (rev 1 → 4 blocking · rev 2 → 4 blocking, **all new**, **two of them defects in rev 1's own fold-ins**) | **0 / 2** — green on the first `test-runner` pass | **0 / 2** — `critic` and `security` both returned **no blocking** | **1** — passed |

| **T06** | **round 1 done → 7 blocking, 11 non-blocking, ALL folded into rev 2** (3 changed the design; every blocking finding spot-verified against the live DB before acceptance). **round 2 → 3 blocking + 7 non-blocking, ALL NEW, TWO of them defects in round 1's own fold-ins. Budget SPENT, did NOT converge — the 5th ticket on this slug.** All folded into rev 3 | — | — | — |

| **T09** | **2 rounds, budget SPENT, did NOT converge — the 6th ticket on this slug** (round 1 → 2 blocking + 10 notes · round 2 → **4 blocking + 8 notes, TWO of them defects in round 1's own fold-ins**). All folded into rev 3; every blocking finding spot-verified against the live DB before acceptance | **0 / 2** — green on the first `builder` pass; RED proof captured pre-migration (all 5 blocks failed on their OWN assertion); `test-runner` re-ran independently and confirmed GREEN — 38/38 SQL · 458/458 unit · tsc clean · 27/28 targeted e2e (the 1 fail A/B-proven pre-existing) | **1 / 2** — `critic` 2 blocking (**both escalated, not fixed** — scope rulings) + 8 notes · `security` **3 blocking, ALL FIXED in one pass, all five mutation-proved** + 8 notes. **Two of security's three were premature `→ fixed in the fix pass` claims the orchestrator wrote into REVIEW.md before the fixes existed** | **1 — PASSED 2026-08-23** |

**T09 notes (in flight, 2026-08-22):** base synced and frozen — **0 behind `origin/dev`, 93 ahead**,
clean tree, no rebase needed. Plan at `PLAN-T09.md` rev 1. `plan-checker` is **still unregistered in
this harness** (T00's REVIEW.md P1) — its ruleset is running verbatim inside a `general-purpose`
agent, the precedent set on this slug. Every claim in the plan's ground-truth table was **queried,
not recalled** (grants, policies, `pg_proc`, all `src/` call sites).

**🔴 Scope amendment found BEFORE any code — the ticket's own remedy is defeated one level down.**
T09 as filed routes the connection mint through a `SECURITY DEFINER` RPC that reads consent from
`pending_inbox_item`. **That row is forgeable by the attacker.** `inbox_insert`'s `WITH CHECK` pins
`sender_company_id = current_company_id()`, but `inbox_update`'s pins only `receiver_company_id` — it
never re-checks *who sent* the request, and `authenticated` holds table-wide UPDATE. Reproduced as
Eva/Bavaria inside `BEGIN … ROLLBACK`: insert a legal self-addressed request → `UPDATE … SET
sender_company_id = GreenLeaf` → `FORGED: 1 row(s) now claim GreenLeaf asked to connect to Bavaria`.
The RPC's *"is it addressed to me? is it pending?"* check then passes. **This is L-027 recursing: the
consent evidence is itself a permission input, so its write path is in scope.** The plan adds
`pending_inbox_item`'s six identity columns (`type`, `sender_person_id`, `sender_company_id`,
`receiver_company_id`, `receiver_person_id`, `deal_card_id`) to T09's scope as a declared
`⚠️ AMENDED` block — all 7 client UPDATE sites write only `status`/`assigned_*`, so the allowlist
costs nothing. **Muskan adjudicates at G4.**

**🔴 ROUND 1 FOUND A SECOND LIVE HOLE — on the INSERT side, against a SHIPPED RPC.** rev 1 wrote
the INSERT side off as *"a member can attribute a request to a colleague — intra-company, no
cross-company consequence."* **The reason was false** (L-026). `inbox_insert` pins
`sender_company_id`; **nothing constrains `sender_person_id`** — no policy clause, no CHECK. So the
claimed sender may be a person at any company. Reproduced independently by the orchestrator as
Eva/Bavaria in `BEGIN … ROLLBACK`: insert `connect_person` with `sender_person_id = Alice
(GreenLeaf)`, `sender_company_id = Bavaria` (own — policy satisfied), `receiver_person_id = Eva` →
`accept_person_connection` (**shipped**, `20260724100400`) returns a real id → `Alice-Eva edges =
1 | initiated_by = Alice`. **A non-consensual person-graph edge, falsely attributed to the victim as
initiator**, plus the p2p DM thread the accept mints. The RPC is not defective — it checks the item
is addressed to the caller and pending, exactly as T09's own RPC would. **Both read consent from a
row the attacker wrote.** Closed in rev 2 by one clause on `inbox_insert`'s `WITH CHECK`
(`AND sender_person_id = auth.uid()`), verified safe first: both client inserts already pass `uid`,
and the only function writer (`deliver_deal`) is DEFINER owned by `postgres` (`rolbypassrls`), so
policies never apply to it.

**⚠️ One piece of round 1's evidence CORRECTED, not repeated.** The checker reported the forgery
also moved `people_visible 3 → 4 · bob_visible 0 → 1`. **That does not reproduce on this seed** —
Alice and Carla are already visible to Eva before any forgery, and the count is unchanged at every
step. The finding is real; the visibility delta is fixture-dependent and is not claimed.

**Round 1's other blocking finding (B2) — the RED-first proof was not observable as specified.**
One `BEGIN … ROLLBACK` under `ON_ERROR_STOP=1` can only ever prove block 1: block 1 RAISEs, psql
aborts, and every later block either never runs or fails `42883` (L-023's *wrong red*). rev 2
replaces it with **four separate single-block scripts run before the migration**, outputs pasted —
the orchestrator's job, since `test-writer` cannot run anything.

**Round 2's four blocking — two were defects in round 1's own fold-ins:**
- **B1 (fold-in defect):** rev 2's `inbox_insert` re-creation specified only the `WITH CHECK` and
  **omitted the role list**. Live is `TO authenticated` (confirmed: `roles = {authenticated}`), so
  the fix for §0c would itself have re-created the policy as **`{public}`** — the dropped-role-list
  class, S5, the exact mistake ADR-0005 round 4 caught. **A security fix that would have shipped a
  security regression.**
- **B2 (fold-in defect):** rev 2 stated the RED-first block list **three incompatible ways**, and
  two of them omitted blocks 3b/3c — the *only* evidence that the new `sender_person_id` clause
  does anything. The fold-in's own guard would have shipped with no RED proof.
- **B3 (new):** the RPC's INSERT omitted `created_by`/`updated_by`. Both are **nullable with no
  default** and the only trigger is BEFORE **UPDATE** (verified), so the RPC would have written
  NULL where `store.ts:615-616` writes the person today — silently, with nothing planned to notice.
- **B4 (new):** the `FOR UPDATE` serialisation claim was overstated. It covers two accepts of ONE
  item; it does nothing for two *different* pending items on the same pair, which take different
  row locks and race to a raw `23505`. The guarantee is `uq_relationship_pair_active`, not the
  lock — fixed with `ON CONFLICT DO NOTHING` + re-SELECT. A true two-session proof is not runnable
  in a one-transaction harness, so **the claim is dropped rather than asserted untested**.

**🔴 T09 IS AT G4 (2026-08-23) — 5 items for Muskan.** Two scope rulings from `critic`
(`pending_inbox_item` crosses ADR-0005's *"no migration"* Reused fence; the verification **triple**
against a one-column criterion), and three escalations that are NOT T09's to fix: the re-accept
RAISE with no catch at either UI entry point (DEV-83's exact shape), `pricelist_request` minting a
**full** connection now that a relationship IS the catalogue gate, and `anon`'s table-level TRUNCATE.

**`security` verdict: THE FIX HOLDS.** ~20 attacks as an unconnected member — forged items,
`connect_person` at the company RPC, `deal_card`, soft-deleted, non-pending, self-sent, `anon` on
both functions — **not one minted a connection or self-verified.** S1-S5 pass; **S6 + S8 owed at
`/ship`** (cloud-only) and recorded as owed, never as passed.

**🔴 THE ORCHESTRATOR'S OWN ERROR, caught by `security` and recorded here rather than quietly
fixed:** REVIEW.md logged two of `critic`'s notes as *"→ fixed in the fix pass"* **before the fixes
existed**. `security` grepped the tree, found neither, and ruled *"a claimed fix that is absent from
the tree is worse than an open finding."* Correct. **Intent was written as completion.** Both are
now genuinely fixed and mutation-proved. **Rule for the next slug: never write a remediation verb
into REVIEW.md until the tree carries it — write "→ owed" instead.**

**`security`'s best NEW finding:** four RPC guards (`type` allowlist, `deleted_at`, non-pending
`status`, own-company sender) had **zero assertions**. All four fire live; nothing in the repo would
have noticed if any vanished — L-011's question answered *no* four times, inside a suite written to
prove that very class. All four now asserted and mutation-proved.

**Two corrections the orchestrator made to `security`'s own evidence:** its audit-log probe ran
against an **empty** table (`0 → 0`), proving the permission but not the destruction — re-proven
with real rows (**3 → 0**, the append-only hash chain gone, though unreachable via PostgREST since
it emits neither TRUNCATE nor DDL); and its "unexploitable orphan" reasoning was right about
escalation but wrong about the orphan — `search_joinable_companies` **returns** the forged
`verified` company, so it is an impersonation lure in the Path-B join directory.

⚠️ **Counting trap, found while verifying:** `run_*_test.sh` matches only **37** runners. The 38th
is `run_auth_gate_test.sql.sh` — a **malformed double extension**. It runs and passes, but the
obvious glob silently skips it. Report **38 over 43**; rename in housekeeping.

**✅ BUILT + GREEN, INDEPENDENTLY VERIFIED (2026-08-23).** `builder` green on the first pass;
`test-runner` disbelieved it as instructed and re-queried every grant and policy claim against the
live DB rather than trusting the report. **38/38 SQL runners · 458/458 unit · tsc 0 errors ·
27/28 targeted e2e**, the single failure **A/B-proven** pre-existing (stash → identical failure at
`auth-gate.spec.ts:101` → restore) and already the known stale banner assertion.

**The builder caught a defect in the plan's own instructions** — §3 step 6's `store.ts` deletion
range (581-620) strands `relationshipId` and **does not compile**; it replaced 580-622 and said so.
That range had **already been corrected once** by checker round 2 (583 → 581) and was still wrong.
*A line range written from a read is not a line range verified by a compile.*

**Two corrections `test-runner` made to what it was told:** the stale-timestamp loose end is in
**two** places, not one (the builder undercounted), and **the 453 unit baseline is stale — the true
count is 458**; T09 has no unit surface so the diff did not move it. **New baseline: 458.**

**`critic` — all seven criteria met in SHIPPED CODE**, with the eight `acceptInbox` invariants
checked in code rather than in the plan's prose. **2 blocking, BOTH escalated rather than decided**
(the `pending_inbox_item` fence crossing, and the verification triple against a one-column
criterion) + 8 notes. It also **stated a limitation instead of papering over it** — no Bash to diff
the ~5000-line `database.types.ts` — and asked the orchestrator to close it. Closed: **5 insertions,
0 deletions, two hunks, no ride-along drift**, hand-edit intact.

**A third instance of the T06 owed error, found by `critic` (N3):** this migration's header again
says `anon`'s writes are *"blocked because `current_company_id()` is NULL"* — **RLS does not apply
to TRUNCATE.** Same defect STATE.md already records against T06's migration. Fixing in the fix pass.

**✅ RED-FIRST PROOF — captured BEFORE any source existed (2026-08-23).** B2 established that one
`BEGIN … ROLLBACK` under `ON_ERROR_STOP=1` can only ever prove block 1, so the five RED blocks were
extracted with the fixture prelude and run as **standalone pre-migration scripts** (the
orchestrator's job — `test-writer` cannot run anything, L-023). **All five failed on their own
assertion, not a generic error** — which is what proves each exercises a real live hole:

```
BLOCK 1  authenticated could INSERT directly into relationship (self-declared connection)
BLOCK 3  authenticated could rewrite sender_company_id on an inbox item it owns (§0b forge)
BLOCK 3b authenticated could INSERT an inbox item attributed to a colleague who never asked (§0c)
BLOCK 3c the §0c forged connect_person request was inserted — accept_person_connection still reachable
BLOCK 7  a member could self-verify their own company via direct UPDATE
```

**`test-writer` pushed back on two instructions and was right both times** — block 2 is the same
grant-revoke class as block 1 (not a separate hole-proof) and block 10 is a regression guard
expected green in both states; neither belongs in the RED list. Fixture prefix `6…`, chosen after
grepping the seeds and every existing suite (`e`/`f` are claimed by the two other lockdown suites).

**rev 3's own fixes are unchecked by a fresh agent** — budget spent. `critic` + `security` carry
them at build, the precedent set at G3 rev 5/rev 6.

**Two more deviations declared in the plan, not silently taken:** the `company` lockdown covers the
verification **triple** (`verification_status`, `verified_at`, `verified_by`) rather than the one
column the criterion names — three columns, one fact, and leaving two writable lets a member forge
the verification audit trail while the status is locked. And recorded-not-fixed: `authenticated`
still holds UPDATE on `company.id`/`created_at`/`created_by`/`deleted_at`/`deleted_by`.

**T06 notes (in flight, 2026-08-22):** base synced and frozen — **0 behind `origin/dev`, 79 ahead**,
no rebase needed. Plan at `PLAN-T06.md` rev 1; `plan-checker` round 1 running.

Three findings from planning, before any checker round:
- **`is_connected_to_company` does not exist** — the ticket names it as if it did. Verified:
  `function "public.is_connected_to_company(uuid)" does not exist`. T06 creates it.
  `shares_connection_with_company` is a **lookalike that must NOT be reused**: it ignores
  `r.status`, ignores `r.deleted_at`, and returns true for a **pending** `pending_inbox_item` —
  that last one alone inverts the ticket's "a pending connection reveals nothing" criterion. Its
  real job is Discover chrome (a looser question, deliberately); changing it would silently alter
  Discover's listing contract.
- **Site 1 has NO verification gate today.** Live `product_public_select` (local AND prod, byte-
  identical) is `deleted_at is null AND profile_visible AND <window>` — no `is_caller_verified()`.
  So *any* authenticated member of *any* company, verified or not, can read every visible product
  row right now. That is what the signed tightening closes, and it means **`getOwnCatalog`'s missing
  `company_id` filter is a LIVE leak, not a hypothetical one** (T00 already shipped buyer-visible
  products). Widening site 1 makes it strictly worse — hence the cross-lane fix rides this ticket.
- **The ticket contradicts itself on `product_media`** — one criterion says its policies are "NOT
  touched", four lines later another requires `product_media_public_select` to stop listing `anon`.
  Flagged in the plan §3 rather than resolved unilaterally; my reading is that the first scopes the
  *override rule* and the second is an independent S4 role-list change, so both hold. Checker rules.

**S5 evidence captured before planning** (never re-type a policy from the migration that declared
it): `product_public_select`, `product_all`, `product_media_public_select`, `product_media_all` —
all four pulled from `pg_policies` on **both** local and production, all four **byte-identical**, no
drift. `get_discoverable_shop` must be re-diffed immediately before site 3 is written: it was
rewritten **twice today** (T05's build, then the G4 item-A amendment), which is exactly when a stale
re-declare is most likely.

**T06 · plan-checker round 1 — the three that changed the design (2026-08-22):**
- **B1 — rev 1 reversed a SIGNED decision, to the LARGER privilege.** I wrote the new helper
  `SECURITY DEFINER`. `SECURITY INVOKER` is locked at `STATE.md:112` (G3) and
  `adr/0005-buyer-shop-view.md:282` — *"the deviation is SIGNED. INVOKER is the smaller privilege."*
  The ADR's reasoning holds: `rel_all` already lets a member read their own `relationship` rows
  under RLS, so **there is nothing for DEFINER to bypass**. DEFINER would also have created an S2
  obligation the plan never discharged. Folded.
- **B2 — `create or replace view` would have silently DROPPED `security_barrier=true`.** It is a
  **reloption, not a predicate term**, so the S5 body-diff we rely on comes back clean while the
  guard is gone; the planner may then push a leaky function below `is_caller_verified()` and
  `price_public`. Reproduced on a throwaway view: `{security_barrier=true}` → `NONE`. Fixed with an
  explicit `with (security_barrier = true)` **plus a `reloptions` assertion** — a predicate
  assertion structurally cannot see this.
- **B3 — the whole rev-1 test matrix went GREEN against a build with site 2 missing.** The checker
  widened site 3 only and ran all ten cells as a connected verified buyer; every one passed,
  including the price cell, which passed **vacuously**. Missing cell: `profile_visible = false`
  **and** `price_public = true` → price *and* tiers must appear. Seed already has it (**AUR-1C**).
  This is the ADR's own named failure mode (`:399-405`).

**Also folded:** the tightening **cascades** — `pricelist_item_public_select`, `plit_public_select`,
`product_image_public_select`, `product_media_public_select` each nest `EXISTS (… FROM product …)`,
and a policy subquery is RLS-filtered as the **calling** role, so one edit to site 1 propagates to
all four (measured: 4/1/1/2 rows → 0/0/0/0). A **companyless** caller also loses reads. Both classes
now named in the ledger entry — this is a read-REMOVING migration, the only kind that breaks a live
user on deploy. Plus: helper must not reuse `shares_connection_with_company` (it ignores `status`,
ignores `deleted_at`, and counts a **pending** inbox row as connected); `alter policy … to
authenticated` replaces a drop+create on `product_media` so "predicate unchanged" is true by
construction; the inert NULL guard was **removed** (the canonical-order CHECK already makes the
self-pair unsatisfiable, and §8 requires every guard be mutation-provable — that one could not fail).

**⚠️ CORRECTION to earlier gate claims on this slug — "38/38 SQL suites" was not a real number.**
Reliable census (counted in Python; `ls … | wc -l` returns **unstable** counts through this shell
filter, same family as L-024): **41 suite files, 36 runners.** **FIVE suites have no runner and never
execute** — `rls_isolation_test` (already filed as DEV-161), `announcement_projection_test`,
`change_reason_log_test`, `onboard_company_categories_test`, `pending_change_lock_test`.
(⚠️ corrected at round 2: I first said six and included `auth_gate_test` — its runner exists as
`run_auth_gate_test.sql.sh`, which matches `run_*.sh`, so it does run. 41 − 36 = 5.) Earlier "38/38" figures counted
*runners that ran*, not suites that exist. **Report both numbers from now on; never say "all".**

**T06 · plan-checker round 2 — 3 blocking, all NEW, two inside round 1's own fixes (2026-08-22):**
- **B-1 🔴 — T05's OWN SUITE GOES RED UNDER T06, AND THAT IS CORRECT.** Rev 2 told the builder the
  T05 suite *"already asserts this, so run it"*. False. `discoverable_shop_spec_columns_test.sql`
  TEST7 uses **Bob / StonePharm** as *"a plain verified NON-OWNER"* and asserts he sees **0** hidden
  GreenLeaf products — but **StonePharm has an ACTIVE relationship with GreenLeaf**, so under T06 he
  is a *connected* buyer and must see it. T05 pins the precise invariant T06 exists to break.
  **The framing was the hazard:** a builder hitting a red security test under a plan that promises
  green will either revert site 3 or quietly weaken TEST7. Fix = repoint TEST7's negative arm at a
  verified persona with no relationship to GreenLeaf, **resolved by company name, never UUID** (those
  ids regenerate on every reset). The suite is now in T06's Files, declared as expected-to-fail.
- **B-2 — site 2 was the only site with NO S5 instruction.** Sites 1 and 3 both got explicit
  "pull it live and diff" steps; site 2 got neither, and the plan never reproduced the full view
  body — the builder would re-type ~20 lines from nothing. Two regressions this closes, both
  measured, both passing every rev-2 cell: dropping `is_caller_verified()` from **site 2** leaks
  prices to unverified AND companyless callers while doors (a)/(c) stay at 0 (every cascade cell is
  worded about *product* rows, so nothing looks); and dropping site 2's owner arm costs Alice 4 of
  her 6 own prices — **no rev-2 cell read the view as the owner at all.**
- **B-3 — the cascade cells were VACUOUS.** `product_media` and `product_image` are **empty
  repo-wide** (0 rows each), so rev 2's three cascade cells are 0-before / 0-after and pass with the
  migration unbuilt. Same vacuity family rev 2 added B3 to kill, reintroduced one section earlier.
  They now plant fixtures.

**Two findings ESCALATED to G4, not decided at build:**
- **N-5 · the read-ADDING side.** Site 1 hands a connected buyer the seller's **private columns** on
  hidden products through a direct `product` read — proven:
  `AUR-1C metadata={"note": "PRIVATE-SELLER-NOTE", …} rrp=9.9900`. In tension with the G3 lock on
  `supplier_product_code` and with the ADR's reason for projecting `metadata -> 'pack_sizes'` only.
  Pre-existing for *visible* products; T06 widens it to **deliberately-hidden** ones. It widens the
  ROW set, not the column set — so narrowing columns would be new scope, not a fix. **Muskan rules.**
- **N-6 · a real performance cliff.** The helper is **not inlined** (it appears literally in the
  `Filter:`), so it runs per row and `idx_product_company_profile_visible` is lost to a Seq Scan.
  Measured on 20 000 products: **1.7 ms → 1327 ms**. Removing `SET search_path` does not restore
  inlining. Production holds 13 products, so this is a scaling cliff, not a live problem — but it is
  the kind that arrives without warning.

**Cleared by round 2** (worth recording, since these were the risky parts): `SECURITY INVOKER` works
inside the `SECURITY DEFINER search_path = ''` RPC (the helper's own `set search_path = public` is
what saves it) · **no RLS recursion** — nothing in `relationship`'s policy chain reads `product` ·
`alter policy … to authenticated` is valid on PG 17.6 and provably predicate-preserving
(`qual_identical|true`) · omitting **any one** of the three sites is caught by the three-doors matrix.

**T06 · tests-first (2026-08-22) — RED verified by the orchestrator, per-assertion:**
`test-writer` **refused a wrong instruction in my plan and was right** (2nd agent this session to
push back correctly). Rev 3's mutation table claimed removing `is_caller_verified()` from **site 1**
reddens doors (a) **and (c)**. It does not. Verified live: `product.relforcerowsecurity = false`,
`get_discoverable_shop.prosecdef = true` owned by `postgres`, and `FORCE ROW LEVEL SECURITY` appears
**nowhere** in `supabase/`. **RLS is bypassed inside the RPC** — the policy being edited never runs
there; door (c) is gated by the RPC's own inline `is_caller_verified()`. The same holds for door
(b): `current_pricelist_item` has `security_barrier` but **not** `security_invoker`, so it too runs
as owner. **Each of the three doors has its OWN independent verification gate; no single mutation
reddens all three.** Complying would have produced a test that passes against a broken build.
Corrected as plan **rev 4**. The cascade is real only for **direct table reads**, where the nested
`EXISTS (… FROM product …)` in a *policy* IS evaluated as the calling role.

**A test that does not RUN is not a RED test.** `reads.getOwnCatalog.test.ts` first landed with a
`vi.mock` hoisting error — module-scope `const`s referenced inside a hoisted factory, TDZ, file
crashed at load: **0 tests executed**. vitest reports that as `status: "failed"`, which is
indistinguishable from a passing RED if you read only the exit code. Sent back to its author; fixed
to `manage.ladder.test.ts`'s pattern (factory creates its own `vi.fn()`, reached later via
`vi.mocked`). **I required a per-assertion prediction with the fix and checked reasons, not just the
pass/fail column** — all five matched:
`5 total · 3 failed · 2 passed` — (1) `expected [] to deep equally contain ['company_id','company-A']`
(no `.eq` exists) · (2) `expected ['product'] to include 'person'` (viewer company never resolved) ·
(3) `expected ['product'] to not include 'product'` (no null-company guard) · (4)+(5) stable-shape
mapping guards, untouched by T06.

SQL suite RED verified for the right reason — `ERROR: function public.is_connected_to_company(uuid)
does not exist`. **T05's suite re-verified GREEN pre-T06** with TEST7's negative arm repointed to
Eva / Bavaria Medical Cannabis GmbH, resolved by name and guarded four ways (resolves · verified ·
unconnected · sees a non-zero shop) so it cannot pass vacuously.

**T06 · build + verification (2026-08-22):** migration `20260822100000_connection_visibility_override.sql`.
Committed at `c4c1486`.

**⚠️ `test-runner` was right to disbelieve the builder.** The builder reported "everything green";
it was not. One e2e failure, and `test-runner` **A/B-proved** it rather than assuming: base 24/24,
with T06 23/24, the same test every run.

`e2e/discover-shop.spec.ts:111` (AC 11) asserted `location-menu-btn` **never** appears on a buyer's
page. T06 gives connected Bob a second visible location (Montreal), so `LocationTabs` renders the
filter and the assertion fires. **The production code is correct** — Muskan ruled at T05's G4, walk
row 12: *"the rule is driven by what the **viewer** sees, not by role."* The assertion was written
at T02, when a buyer could only ever see one location, and it bundled the dropdown in with genuinely
owner-only chrome. Stale, not a regression.

**The lesson is the miss, not the fix.** This is **the same class as B-1**, which the builder had
already found and fixed in the SQL suite — same two companies, same active relationship. It missed
the e2e twin because **T06's declared Files list never named that file**. A scope boundary hid a
defect from the agent best placed to see it. Both files are now recorded in TICKETS.md's inline
`⚠️ AMENDED` block, per item F's ruling.

**T06's own behaviour had NO e2e coverage** — the only thing watching "a connected buyer sees hidden
products" was a test asserting the opposite. A positive test was added and **mutation-proved**:
migration removed → fails on `location-menu-btn / Expected: visible`; restored → **11/11**.

**Gate after the fix:** 37/37 SQL runners (42 suite files, **5 never execute** — unchanged census) ·
**458/458** unit incl. 5 new `getOwnCatalog` assertions · `tsc` clean · eslint 6 errors **all
pre-existing, none in touched files** · e2e `discover-shop` **11/11**, `present-card-edit` +
`present-grid` green on a clean reset. **Mutation pass 6/6, each red on its named door** — including
the two `plan-checker` added and the one `test-writer` corrected.

**⚠️ `diff` produced a FALSE "Files are identical" again** — the builder hit it on the view and the
policy (md5s differed); it caught the lie and redid every comparison with `difflib`. Second slug
running. **L-024 is now proven twice; nothing in this repo may branch on `diff`.**

**Builder deviations, both declared, neither silent:** (1) rewrote `getProductBatches`'s docstring —
it cross-referenced `getOwnCatalog` as precedent for "no company filter needed", which this ticket
makes false; (2) added a warning block to the ledger's PENDING section because **T05's migration
`20260822090000` is local-only and has NO ledger entry**, while the section header claimed "1
migration so far". **T05 still owes its ledger entry** — a deploy reading that checklist today would
silently skip it. Out of T06's scope; flagged rather than silently widened.

**Sync ritual note, recorded honestly:** the ledger edit was made by the build agent *before* the
lock was taken. Ayush's lock list was empty throughout, so exclusivity held — the ritual **order**
was broken, not the guarantee.

**Still carried to G4, unsolved by design:** the read-ADDING side (a connected buyer now reads the
seller's `metadata` private note and `rrp` on **deliberately hidden** products via a direct table
read — widens the ROW set, not the column set, so narrowing columns would be new scope) and the
**perf cliff** (the helper is not inlined, costs `idx_product_company_profile_visible`; 1.7 ms →
1327 ms at 20 000 products; prod holds 13).

**🔴 T06 · G4 — BLOCKED. Muskan ruled: close the write door first (2026-08-22).**

`security` returned **3 blocking**; two are live privilege escalations that I reproduced myself,
end-to-end, inside `BEGIN … ROLLBACK` before relaying them.

**The gate T06 builds is ornamental as shipped.** `relationship` is directly writable by
`authenticated`, and `rel_all`'s `WITH CHECK` only requires the caller's **own** company be one side
of the pair — nothing requires the other side to consent. Proven as a Bavaria member with no
relationship to GreenLeaf: `connected=false, hidden=0` → one INSERT → `connected=true, hidden=2`,
leaking `AUR-1C`/`AUR-1D` with their `rrp`. The migration argues carefully about
`status`/`deleted_at`/pending — **all of which the attacker simply supplies as `'active'`.**
Compounding it: a member can **self-verify** (`company_update` permits `id = current_company_id()`
and `authenticated` holds column-level UPDATE on `verification_status`), which undoes the very
tightening T06 adds. Self-verify, then self-connect.

**Neither hole is caused by T06** — `rel_all` and `company_update` both predate it. T06 is what
changes their *job*: before, a self-minted row bought nothing on the catalogue; after, `relationship`
IS the confidentiality gate for hidden products. **T06 converts a bookkeeping-integrity bug into a
data-confidentiality hole** — which is exactly why it blocks on the fix rather than shipping beside it.

**T09 filed** (`TICKETS.md`, above T07; Linear entry owed — MCP auth still blocked). The surface
turned out **much smaller than the finding suggests**, measured not assumed: `relationship` has
**exactly one** write call site in all of `src/` (`messaging/supabase/store.ts:609`; the other ten
`.from("relationship")` uses are reads, and **no RPC writes it at all**), and
`company.verification_status` has **exactly one** client write (`onboarding/actions.ts:181`, a
`rejected → pending` resubmit already guarded in SQL). The HS-team paths are already DEFINER RPCs.
**The consent evidence already travels with the accept call** — it passes `inbox_item_id`; the DB
just never checks it. Remedy is the DEV-88 pattern verbatim.

**`critic`'s blocking (B3) is the same column-leak I was going to bring as a weak scope question —
and it found the precedent that reframes it.** `20260607190000_seller_only_column_split.sql` opens
*"RLS is row-level only, so a counterparty who can see a shared row can read every column of it"*
and moves `cogs` to a sibling table for exactly this reason. **Three columns were left behind** —
`metadata` (the seller's private note), `rrp_per_gram`, and **`supplier_product_code`**, which
carries a G3 signature (*"OMIT … a commercial-confidentiality call"*) enforced today only in the RPC
projection and the UI — both of which the direct table door bypasses. The tree already contains the
signed pattern for this problem.

**Two factual errors in shipped comments, to fix when T06 resumes:** (1) the migration says `anon`'s
INSERT/UPDATE/DELETE/**TRUNCATE** are "blocked by RLS" — **RLS does not apply to TRUNCATE**; that
verb is gated by the table grant alone, which the same sentence says `anon` holds. Not exploitable
(no PostgREST TRUNCATE verb) but it closes the section arguing *incidental vs deliberate* by
misattributing a lock to the wrong mechanism. (2) the cascade list over-counts by one —
`plit_public_select` already has its own gate, so the migration and the ledger disagree and **the
ledger is right**. Also owed: ADR `:344`'s site-4 row says `untouched` of a policy whose role list
was narrowed, and ADR `:298-301` is **wrong about the view** (an owner-rights view doesn't change the
effective user id, so `rel_all` IS load-bearing at site 2) — **the shipped comment is right, the ADR
is wrong**.

**`security` CLEARED, worth recording:** S5 stale-redeclare **clean** — one hunk, confirmed against
the live deparse, every prior guard intact including T05's unfiled clause and the window terms
outside the override · S1 grants correct · the `product_media` revoke is now **deliberate** (`anon`
errors on `product_media` itself, not on `product`) · all seven doors deny `anon` with no over-lock ·
companyless → 0 rows everywhere · **the cascade is bounded and in the safe direction** (the override
does NOT propagate) · `security_barrier` survived · every other `.from("product")` read swept.

**T05 notes (in flight, 2026-08-22):** base synced and frozen — 0 behind `origin/dev`, 60 ahead.
Plan at `PLAN-T05.md` rev 1. Its invariant table was built by **walking the live function body
clause by clause** (`20260816190000:82-154`), not from the ticket's risk framing — L-011 is exactly
that failure, on this same function, at T01. **Two invariants have no guard today** and the plan
adds them: the primary filter `c.id = p_company_id` (lose it and this `SECURITY DEFINER` function
returns every verified company's catalogue to any verified caller) and the LEFT-ness of the
`current_pricelist_item` join. **The seed cannot support this ticket's assertions** — measured, not
assumed: only `cultivator` and `location` are populated of AC 7's set, and `batch_terpene` has **0
rows repo-wide**, so the derived-terpene fallback has no data; per L-012 the suite plants distinct
sentinels per column rather than asserting "as seeded". One decision is deliberately left for the
checker to rule on (D1): whether the owner arm also lifts the **visibility window**, or only
`profile_visible` — the ticket's "their whole catalogue" reads both ways. ⚠️ `plan-checker` is
**still not registered** in this harness although `.claude/agents/plan-checker.md` exists (the other
10 all register); running its ruleset verbatim inside a `general-purpose` agent, as at T00/T04 —
surfaced, not silently substituted.

**T05 round-2 note — a fact I gave Muskan was wrong.** I told her GreenLeaf has two named
locations that would bring the location filter back for a buyer. It does not: **Montreal is exactly
the hidden pair** (AUR-1C/1D, `profile_visible = false`), so a buyer sees four products, all
Toronto — ONE distinct location, verified against the live DB. Her ruling was taken on that false
premise. Her correction on being told: **the rule is general — one location, no filter; many
locations, filter — for every user, not designed around GreenLeaf's seed.** That reframing
dissolved six of round 2's nine blocking findings, which were artifacts of my having framed it as a
buyer-only rule: it is not a new branch (a changed threshold on the existing
`if (named.length === 0) return null`, so the one-branch budget stays unspent), needs no
discriminator, needs no seed subject, and **leaves T02's two e2e assertions exactly as shipped**.
Three findings survived and are folded: `media` was ruled IN at rev 2 but every operational section
still said 11 columns and excluded it (a builder would have shipped without it, all tests green,
falsifying T06's premise); `parsePackSizes` is **not exported**, so rev 2's mandated call could not
compile; and the render fixture had no cleanup or forbidden-column contract. Plus the subtle one:
when the representative batch has no terpene rows but an older batch does, the answer is NULL — the
one shape a join-then-limit body gets wrong while every other planned test passes.

**T05 build notes (staged at G4, 2026-08-22).** Gate: 35/35 SQL · 453/453 unit · `tsc` clean ·
eslint 6 errors **0 new** · `discover-shop` 8/8 · present trio 22/22 · full e2e **109/21, all 21
pre-existing** — independently re-verified by `test-runner` from a clean reset, which also
reproduced both of `builder`'s self-reported claims (the `present-manage` seed-order hazard is real
and pre-existing; the AC 7 fixture does restore what it writes).

**`critic`'s one blocking finding was correct and is the lesson:** the buyer/`Unassigned`
suppression had **no guard at all** — every seeded GreenLeaf product carries a `location`, so the
group never forms and the term could be deleted with the whole suite green. The plan had demanded a
planted fixture; none was written. Fixed with a throwaway unfiled product (safe: the matrix suite
explicitly tolerates a sixth product and `count(DISTINCT location)` ignores NULLs), asserting
**both** halves — buyer sees no divider, seller does — because the buyer half alone would pass on a
page that renders no headers at all.

**Every new guard was mutation-proved** (closing `security`'s S7 note): removing
`verification_status = 'verified'`, reducing `coalesce(bt.percent,0)` to a bare `sum`, and replacing
the `Unassigned` term with `true` were each caught by the test that names them. Two further gaps
found and closed: **I4 (the unverified TARGET seller) had no coverage anywhere** — every existing
suite covers the unverified *caller* — and the `coalesce` clause was a live buyer/seller divergence.

`security` returned **no blocking**: the stale-redeclare class is clean (live `pg_get_functiondef`
diffed, all six guards verbatim), the owner arm cannot reach cross-company, and grants verified
against the live catalog. Two notes carried forward: `anon` is blocked from `product_media` only
*incidentally* (a privilege error inside the policy, not a policy decision — close with T06), and
**`shop-media` is a public bucket**, so the COA/doc paths T05 newly hands buyers need no auth.

⚠️ **Two real defects staged for adjudication, not fixed unilaterally:** (A) a seller with ONE named
location plus unfiled products loses a filter that genuinely filters — the rule counts locations,
the case is about groups; (B) the buyer's unfiled product renders under a divider reading
`Toronto Warehouse · 4` with **five** cards beneath it. Plus C-F in `REVIEW.md`.

**Tooling hazard found here, applies everywhere:** `diff` exits **0** on differing files in this
environment (rtk rewrites it), so any script branching on it gets a false clean — L-024.

**T03 notes:** `builder` **stalled mid-ticket**, having completed 4 of its 5 plan steps and left a
half-implemented component that type-checked — the orchestrator diffed the tree against the plan's
step list, found only the `canAsk` JSX branch missing, and finished it by hand (REVIEW.md P6, and
`critic` was tasked specifically to hunt for residue — it found none in behaviour). 6 of `critic`'s
8 notes were fixed rather than deferred, the same deviation T00 took and for the same reason: three
of them were defects in the gate test itself (stale narration, casts that discarded type coverage of
the very props under test, and negative assertions ANDed so they were weaker than the criterion).
`test-runner` also raised a **false** tooling alarm (REVIEW.md P3) — refuted by a same-state A/B.

**T00 notes:** 4 of `critic`'s 8 notes were fixed rather than deferred (a deviation from `/build`
step 7, recorded in REVIEW.md) — two of them made the gate itself unreliable: a flaky assertion
the orchestrator had specified, and a false-green where the suite printed `… PASSED` and exited 0
while failing. `plan-checker` is **not registered** in this harness (see REVIEW.md P1); both
rounds ran its ruleset verbatim inside a `general-purpose` agent.

## Gate log
| gate | date | verdict |
|---|---|---|
| **G4 · T06** | 2026-08-23 | **⏸ STAGED — awaiting Muskan. 6 items to rule; page `G4-T06.md`, 22 shots `g4/14`–`26b`.** **AC 6 is the ticket and it PASSES:** AUR-1D (`profile_visible=false` **and** `price_public=false`) is revealed to connected Bob as `Price on request` with **zero** currency figures on either card face — asserted by regex over the card's whole `innerText`, not by eye. Structural, not incidental: the override attaches to `profile_visible` only, and `price_public` stays a separate un-overridable conjunct at all three layers (policy · view `AND p.price_public` · RPC `case when p.price_public then …`). Matrix walked in full — AUR-1C (hidden, priced) reveals **with** `4,00€/g`; AUR-1A (visible, unpriced) stays priceless; AUR-1B control renders `6,00€/g`, proving the price block works. Controls both hit: **Eva 4 products / one location / no dropdown; Bob 6 / two locations / dropdown `All 6 · Montreal 2 · Toronto 4`.** No horizontal overflow at 1440 or 900. **Re-verified on current HEAD, not trusted from 2026-08-22** — T09 shipped after T06 built and revoked the `relationship` INSERT grant, so T06's fixtures were re-run against it: **not broken, no fixture needed to move.** Gate: clean reset · **38/38 SQL runners over 43 suite files** (5 never execute) · `tsc` 0 · eslint 6 all pre-existing · unit **458/458** · targeted e2e **13/13** · full e2e **113 pass / 21 fail / 17 skipped of 151**, all 21 classified, three A/B-proven against `d96f68e`. **⚠️ e2e baseline corrected: 151 total, not 146** — the 21 failures and both classes are unchanged; specs were added since (T06's own positive `location-menu-btn` test among them). **⚠️ A polluted measurement was caught and discarded, not reported:** the first full-suite run followed a targeted run and one deal-ticket test failed from leftover state; on a clean reset it passed — the F-05 persistence trap, hit again. **Criterion 10 marked CANNOT-VERIFY, not passed:** the outcome matches live `polqual`, but that the site-1 body was *diffed* rather than re-typed is not observable after the fact. **6 items:** (1) location filter **shape** — live ships a dropdown + grouped bands, the prototype had a flat 4-up grid under pill tabs; presence was ruled at T05, shape never was; (2) criterion 5 names a `pending` state `relationship_status` cannot hold (`active`/`ended`/`suspended` only) — behaviour correct via Eva's pending inbox item, the wording invites a future "fix"; (3) the buyer is never told **why** the catalogue grew — the prototype's `6 products · full catalogue (connected)` counter didn't ship; (4) seed `region`/`location` disagree on AUR-1D (`Region · Toronto` under a `Montreal Warehouse` header) — T06 is what first puts them on one screen; (5) `anon` keeps INSERT/UPDATE/DELETE/TRUNCATE on `product_media` — criterion 9 asked only for SELECT and got it, T11's class; (6) the G2 visual contract no longer exists (the in-app route was deleted at `/build`, as designed), so shape rows are judged against HTML variant A, which its own NOTES call insufficient. **Three shipped-comment errors FIXED today** (`00c22b3`, comment-only — 0 non-comment lines changed in the migration): TRUNCATE is gated by the table grant not RLS · the cascade list is **three** not four (`plit_public_select` self-gates) · ADR-0005 row 4 `untouched` → role list narrowed, and `:298-301`'s view claim corrected. **⚠️ STATE.md's own claim that "the ledger is right" was WRONG** — `cloud-migrations-pending.md:67` repeated the same over-count and nobody had opened it; corrected in the same pass, recorded as **L-031**. **Owed before `/ship`, not gate items:** the ledger still lacks T05's `20260822090000` and T09's `20260823090000` (T08 owns it). |
| **G4 · T09** | 2026-08-23 | **PASSED — Muskan: *"pass"*. All 5 staged items ruled in one word: the `pending_inbox_item` fence crossing ACCEPTED (ADR-0005's Reused list needs the amendment), the verification **triple** ACCEPTED as shipped, and items 3-5 accepted as recorded — filed, not fixed in T09. Page: `G4-T09.md`.** Built · green · reviewed · fixed. **Five live holes closed, every one reproduced before the build and proven shut after**; `security` ran ~20 attacks and **none got through** (S1-S5 pass; S6+S8 owed at `/ship`, recorded as owed not passed). Gate: clean reset · T09 suite PASSED · **38/38 SQL runners over 43 suite files** · `tsc` 0 · eslint 6 all pre-existing · unit **458/458** · targeted e2e 27/28 (the 1 A/B-proven pre-existing) · `inbox-accept` **2/2** · **5 mutation proofs**. **5 items to rule:** (1) `pending_inbox_item` crosses ADR-0005's *no migration* fence — but without it the ticket's own remedy is defeated, since the RPC reads consent from a row the attacker can write; (2) the verification **triple** vs a one-column criterion; (3) re-accept now RAISEs with **no catch at either UI entry point** — DEV-83's exact shape; (4) `pricelist_request` mints a **full** connection, and post-T06 that IS catalogue access; (5) `anon` holds TRUNCATE on ~90 tables (proven: 3 audit rows → 0), unreachable via PostgREST, **recommend its own ticket**. **🔴 Orchestrator error recorded, not quietly fixed:** REVIEW.md logged two findings as *"→ fixed in the fix pass"* **before the fixes existed**; `security` caught it — *a claimed fix absent from the tree is worse than an open finding*. **Rule for the next slug: never write a remediation verb into REVIEW.md until the tree carries it — write "→ owed".** |
| **G4 · T04 visual (owed)** | 2026-08-22 | **DONE — walked live, not waived.** Muskan said "pass T04"; the local stack that blocked this in session 79 is repaired, so the pass was captured rather than accepted on trust. Bob on `/discover/aaaa…`, AUR-1A (`profile_visible` + `price_public=false`): the card renders a `Price on request` pill and a `Request pricing` button, and the click swaps it for a green `✓ Pricing requested` confirmation. Evidence `g4/12-T04-request-pricing-before.png` + `13-…-after.png` (headed, 2×). The same frames double as confirmation of T05's items C and D — no `Supplier code` row on the buyer card, the Lineage row fading rather than cut, and the 6px scrollbar painted on the right. **T04's last owed item is closed; nothing on this slug is now owed a visual.** |
| **G4 · T05 (item F)** | 2026-08-22 | **RULED — amendment block written.** T05 shipped 9 files against a 3-file `Files` line; T01 and T02 recorded that kind of drift inline as `⚠️ AMENDED`, T05 did not. Every edit had written plan authority — 3 were the ticket's own tests (a Files-line omission shared by T00–T04), `shop.ts` is the terpene source the SQL reproduces, `ShopView.tsx` is the location rule. Block written into `TICKETS.md` above T05's criteria, and it covers the post-G4 rulings too: items A–D added `ProductCard.tsx` and `globals.css` and re-touched four more files, none of them inside any declared boundary. **Gap recorded, rule NOT changed (Muskan's call):** the amend-the-ticket convention covers `/build` only — nothing in `PIPELINE.md` says what to do when a G4 ruling changes the diff, which is exactly how items A–D landed with nowhere to be recorded. Offered as an option and declined; noted so the next slug can decide with the evidence. |
| **G4 · T05 (item E)** | 2026-08-22 | **DROPPED — the premise did not hold.** Staged as "Alice is offered a Connect button on her own company". Muskan challenged it: *why is her own company showing to herself in Discover at all?* It is not — `list_discoverable_companies()` self-excludes (`and c.id is distinct from public.current_company_id()`, line 46), so GreenLeaf never appears in Alice's Discover list and nothing routes her to `/discover/<own id>`. It is a typed-URL edge case. No fix, no ticket. **The check earned its keep anyway:** it exposed that the owner exception I had written into the unfiled rule an hour earlier carried a FALSE justification ("otherwise the rows are stranded") — `/present` reads `getMyShop`, which queries `product` with no location filter, so nothing could ever have been stranded. Clause unchanged, rationale corrected in the migration header, the e2e doc comment, DECISIONS and this row, with the correction recorded rather than silently swapped — the wrong reason made the exception look load-bearing to anyone later deciding whether to keep it. |
| **G4 · T05 (item D)** | 2026-08-22 | **RULED — fix the clipping, keep the scroll.** Muskan: no row is ever sliced, and the scroll gets a real affordance instead of a fade. Two CSS changes in a new `.speclist-scroll` class (`globals.css`): the list carries one row of bottom padding and the fade above it grew from 20px to one row (`h-5` → `h-7`, opaque at the base), so a partly-visible row **dissolves** instead of ending mid-letter — and at the end of the scroll that padding holds the last row clear of the gradient; and the scrollbar is forced to a classic always-painted 6px bar. **⚠️ The subtle part, recorded because it silently reverts:** setting `scrollbar-width` or `scrollbar-color` makes Chromium **ignore every `::-webkit-scrollbar` rule** and fall back to a macOS overlay bar that occupies zero width and is invisible until you scroll — exactly the problem being fixed. Measured `offsetWidth - clientWidth = 0` with it set, `6` with it scoped to Firefox behind `@supports (-moz-appearance: none)`. **Also cost an hour to a stale `.next` cache** — the whole class was absent from `document.styleSheets` until the dev server was restarted with `.next` deleted; the CSS looked wrong when it was simply not loaded. Verified in a **headed** browser: headless Chromium does not paint scrollbars, so the first screenshots showed no thumb even though the geometry was correct. Evidence: `g4/09-buyer-card-specfix.png`, `10-seller-card-specfix.png`, `11-speclist-zoom.png` (headed, 3× — the Lineage row visibly fades, the thumb is on the right). Guarded by an e2e pinning the two measurable invariants behind the CSS: the scrollbar reserves width, and the list's bottom padding is ≥ the fade height. **Mutation-proved** (re-adding `scrollbar-width: thin` → test fails). `tsc` clean · eslint clean · **453/453** unit · **10/10** `discover-shop` · **14/14** `present-card-edit` + `present-grid` on a clean reset. |
| **G4 · T05 (item C)** | 2026-08-22 | **RULED — the `Supplier code` row is now owner-only.** The field is seller-confidential (G3) and the buyer's RPC never projects it, so the row rendered `Supplier code — n.a.` on every buyer card: correctly withheld, but a withheld field read identically to an unset one. Muskan: **drop the row for buyers** — a confidential field should not advertise its own existence. One conditional in `ProductCard.tsx:390` on the `viewerIsOwner` prop already there for the buy controls; also frees one of the nine rows the card cannot fit (item D). Guarded by a new two-sided e2e — the buyer half pins `Cultivator` as a control so "the card rendered nothing" cannot pass as "the row is hidden", the seller half proves it was hidden by viewer and not deleted. **Mutation-proved** (row forced back on → test fails). `tsc` clean · eslint clean · **453/453** unit · **9/9** `discover-shop` on a clean reset. |
| **G4 · T05 (items A+B)** | 2026-08-22 | **PARTIAL — items A + B RULED, D-F still open.** Muskan rejected the framing on both defects and fixed the cause instead, the same move as the blank-price rule: **a product always has a location, and an unfiled one is not served to a buyer at all** (DECISIONS 2026-08-22). A many-locations model was raised and **dropped** — a join table plus a rewrite of the dialog, grouping, RPC and filter, for something no seller asked for. That single rule dissolves BOTH staged defects: no unfiled card can sit under a divider counting four (item B), and with nothing unfiled the buyer's `named.length <= 1` filter rule is exact by construction (item A, buyer arm). **Built, not deferred:** `20260822090000` amended in place (unshipped, so no second re-declare of the function that once lost a gate on production) with one clause mirroring the owner arm — `and (p.location is not null or p.company_id = public.current_company_id())`. **The owner exception buys CONSISTENCY, not reachability** (rationale corrected same day — the first version said unfiled rows would be stranded, which is wrong: `/present` reads `getMyShop`, never this RPC): PRD §7 row 158 says an owner sees their own shop here, so without it `/discover/<own id>` would show a smaller catalogue than `/present`. **Mutation-proved** — removing the clause fails block (14) with exactly its own assertion. Suite hardened first: every other fixture in `discoverable_shop_spec_columns_test.sql` was given an explicit `T05-FIXTURE-LOC`, so the new unfiled fixture is the only row in the file whose visibility turns on `location`; the buyer assertion carries a control on a FILED product so "the shop is empty" cannot pass as "the rule works". **T05's own e2e encoded the OLD ruling** (`discover-shop.spec.ts` asserted the buyer sees the unfiled product) — rewritten to the new one. Gate: `tsc` clean · eslint clean on the touched file · **453/453** unit · **38/38** SQL suites · **8/8** `discover-shop` · **14/14** `present-card-edit` + `present-grid`, all on a clean reset. ⚠️ **Two false alarms worth recording:** a full `npm test` run leaves the seed dirty (AUR-1A deleted, AUR-1D renamed "Renamed by E2E"), which fails the next targeted run for reasons that look like the change — always `db reset` before a targeted e2e. And `npm test` is Playwright here, not the unit suite (L-022). **Seller arm knowingly NOT patched:** a seller holding legacy unfiled rows plus one named location still loses the filter until the seller-side enforcement ships. **⚠️ At deploy: Aurora's shop goes empty on production** — its only two buyer-visible products are unfiled. Demo data, a UI fix, not a migration. |
| **G4 · T04** | 2026-08-21 | **PASSED — accepted with two items OWED.** Muskan ruled all three staged questions ACCEPTED (ADR fence → amend to "no new props"; DEV-83 → own ticket, blocks `/ship`; price-public gate → add the line). All four EARS criteria verified in shipped code by `critic`, walked one at a time. Gate before the fix pass: `tsc` · eslint 6 pre-existing/**0 new** · **445/445** unit (440 + exactly the 5 planned) · **37/37** SQL suites each with a real PASSED marker · **6/6** `discover-shop.spec.ts` · **23/23** dependents · full e2e 105/22 all pre-existing. `plan-checker` **2 rounds, budget SPENT, did NOT converge** — r2's 5 blocking were ALL NEW and ALL defects in r1's own fold-ins (third ticket on this slug to do this). `security` + `consistency` **no blocking**; `critic` 2 blocking, both scope rulings escalated rather than fixed; **7 notes fixed in one pass**. Best catches: r1 killed three unit tests that **could never go green** (no DOM env) and found criterion 3 untestable on the seed (one product in the visible+price-hidden corner → no "product B" → seeded AUR-1F); r2 killed the whole "sign in as the seller and count her inbox" design (`proxy.ts` bounces a signed-in user off `/login`, **no sign-out helper exists in `e2e/`**, and one worker + one DB made counts read high) → replaced with direct SQL row assertions, strictly stronger since they see `metadata->>'product_id'`, which no screen renders. `test-writer` **refused an instruction and was right**: the plan asserted the note contains *"Cosmic Cream"*, which is the **cultivar**, not `name`. `security` closed cross-company forgery at the SQL level (`c.id = p.company_id AND c.id = p_company_id`) and proved the PostgREST filter non-injectable. `consistency` **corrected the plan in the ticket's favour** — `taxonomy.ts` is exactly the precedent D7 claimed didn't exist. Two corrections I owed: D8 said DEV-83 needs a *second* accept (it fires on the **first**, proven `23505`), and D2 claimed a guarantee that is true of the action but false of the endpoint set (`authenticated` holds INSERT on all 16 columns of `pending_inbox_item`). **⚠️ OWED: the post-fix e2e re-run and the visual G4 — both blocked by the local-stack grants regression, NOT by this ticket (zero migrations changed, all 147 applied). Muskan has not waived the visual pass.** |
| **G4 · T02** | 2026-08-21 | **PASSED** — Muskan: *"all good"*. **The G2 contract is proven, not asserted:** `consistency` returned **REUSE, not a lookalike** (the real `VerifiedBadge` + `ConnectActions` imported, the prototype's hand-rolled pill and button discarded, shared parsers reused, and **the lookalike retired rather than kept alongside**); `visual-verifier` then **measured** it — buyer and seller grids byte-identical at `289px × 4 tracks`, grid `1204px`, card `289×640`, owner chrome `0` on the buyer DOM. Gate: 60/60 files · 440 unit · `tsc` clean · **17/17 e2e** on a clean reset. **Three defects found AFTER the first green run, all fixed with e2e guards added** (none had one): AC 4's Connect action missing from the locked panel *(with a factually wrong comment excusing it)*; the buyer seeing seller shelf vocabulary — an **"Unassigned"** divider and a one-option "Shop location" dropdown; and owner authoring copy on the card back (*"Drag to re-sort · ✕ to remove"* — `MediaManager` gates 16 affordances on `canEdit`, this hint was the one that wasn't). **Then the double scrollbar was fixed too** — `<main>` had been overflowing a constant 48px because the Back link sat above an `h-full` child; re-measured **overflow=0**, one scroll container. Deviations accepted: a **5th `ShopView` edit region** (`LocationTabs` self-hides with no named locations — declared, not reinterpreted, per L-017), plus edits to `LocationGroup.tsx` and `MediaManager.tsx` outside the declared Files list, dead `_urlFor` kept (removing it is TS2554 against a test builder may not edit), and the ticket's "1400px container" criterion **knowingly waived** (that width exists once in all of `src/`, inside the Present-mode overlay; `/present` and the approved prototype both have none). **⚠️ Unverified, stated as a gap:** the banner/logo have **never rendered from storage** — no seeded company has a logo, so no `shop-media` request fires. The double-URL *bug class* is proven absent by injecting paths and comparing rendered `<img src>` on both surfaces; real pixels are unproven. |
| **G4 · T01** | 2026-08-21 | **PASSED** — Muskan: *"pass"*. The re-create class did **not** bite: `critic` and `security` independently diffed the new body against the verified-live base and `security`'s normalised diff came back as **one character** — the comma appending the new projections. All 11 invariants held; grants came out **stronger** (the prior migration issued 2 statements, this one adds the explicit `revoke … from anon`). Gates proven behaviourally in rolled-back transactions: `anon` → denied; companyless/unverified/target-pending/target-deleted → 0 rows. Chrome suite PASS · 411/411 unit · `tsc` clean · 3 SQL guards PASS · `present-grid` 2/2 · `present-card-edit` 12/12. Adjudicated: **D4** — `export` added to `parseLinks`, which sits in the ADR's *"don't touch"* list, but ADR §5 itself mandates reusing it (impossible across modules without the export); **D1** widening two columns, forced by the pre-written spec; **4 notes fixed not filed**, two of them defects in T01's own tests (an assertion passing vacuously on zero rows; zero coverage for the 11 fields the extraction moved — the added transposition guard was **mutation-tested**). ⚠️ **Carried hazard: `database.types.ts` is NOT reproducible from `supabase gen types`** — an undocumented hand-edit for `update_deal_draft`; T05 and T06 both declare that file and now carry an in-place warning. **Scope expansion taken on Muskan's call:** 22 of 35 SQL runners could not execute (host-path `-f` under the psql shim) — all repaired, **all 35 suites now pass on a clean reset**. |
| **G4 · T03** | 2026-08-20 | **PASSED** — Muskan: *"pass"*. Fixes a **live defect**: the card's buy row gated on `!editing` alone, with no price condition anywhere — invisible only because no product had ever been buyer-visible, which T00 changed. 32/32 gate tests (a 16-cell `editing × viewerIsOwner × price_public × price_per_gram` grid) · 407/407 unit · `tsc` clean · `present-card-edit` **12/12** and `present-grid` **2/2** on a clean `db reset`. No blocking findings from `critic` or `consistency`. **The e2e pin was staged as unverified and is now proven** — three earlier attempts failed at three *different* points, every one a timeout and never an assertion, under macOS `peopled` at 75% CPU; re-run on an idle machine, green in 15.5s. Adjudicated: the orchestrator finishing `builder`'s last step by hand, and the six out-of-scope test-file fixes — both accepted. **Known and accepted:** between T02 and T04 a buyer sees a Request-pricing button that does nothing (`critic` K7) — a consequence of the ticket split, not this diff. No visual staging: `viewerIsOwner` defaults to owner, so the new control is unreachable in the running app until T02 supplies the prop; its first visual check belongs at T02's G4. |
| **G4 · T00** | 2026-08-19 | **PASSED** — Muskan: *"yes pass and amend"*. 3/3 SQL suites · 14/14 targeted e2e · 375/375 unit on a clean `db reset`; no blocking findings from `critic` or `security`. Three adjudications: the volume threshold showing while the price is hidden is **accepted, not a defect** (*"it can show the volume with price hidden"* — so **no T03 criterion is added**); the ladder panel overlaying its own Add-to-basket is **accepted**; the duplicated location label is **rejected** and earned T02's fence amendment above. `security` confirmed `seed.sql` **cannot reach production** (`[db.seed]` runs on `db reset` only; `db push` never touches it). **Condition carried to G5: this slug ships as a unit** — T00 reaching `dev` without T06 would put every seller's catalogue into every other seller's deal-line picker. Responsive width is **unverified, not verified-fine** — `resize_window` reported success but the viewport stayed pinned at 1470px. |
| **G1 (spec)** | 2026-08-19 | **PASSED** — Muskan approved the PRD. 11 decisions recorded in PRD §3, taken over a one-question-at-a-time interview. Two shared-doc amendments written under the sync ritual (CONTEXT.md, DECISIONS.md). No researcher claim overruled; decision 6 is a **new** call that amends a locked one. Branch condition fired and was reviewed — call unchanged. |
| **G3 (design)** | 2026-08-19 | **PASSED at rev 6** — a 4th round (Muskan: *"one last check and move to tickets"*) found 9 more blocking, incl. **two live breakages**: the rev-5 column-REVOKE would have broken `addToBasket`'s upsert, and nothing wired `viewerIsOwner`, so AC 3's gate would never have fired — with every test green. Its best finding was structural: **four of the seven permission sites are not on the buyer's read path at all** → scope cut 7 → 3, dissolving the ADR-0004 contradiction, the four-vs-three miscount and most of the behaviour change together. **Convergence answered: 6 → 8 → 9 → 9 blocking across four rounds — the loop never converged; a scope cut ended it, not a clean round.** rev 6's own edits are unchecked by a fresh agent; `critic` + `security` carry them at build. |
| ~~G3 (rev 5)~~ | 2026-08-19 | superseded — **PASSED at rev 5** — re-opened once. rev 4 was accepted, then a 3rd checker round (Muskan's call, past the 2-round budget) found **9 more blocking**, incl. a real security hole (basket `product_id` stayed writable after insert, so the admission policy was ornamental — closed with the DEV-88 column-REVOKE) and a **wrong inventory under a signed decision** (four sites lacked the verified gate, not three — and that policy had been read verbatim during drafting). Muskan then took round 3's *removal* option: **one rule states visibility, four inherit it, two restate it because they bypass RLS** — which dissolves the miscount instead of patching it. Convergence answered empirically: rounds 1→2→3 gave 6→8→9 blocking. **rev 5's own fixes are unchecked by a fresh agent**; `critic` + `security` carry them at build. |
| ~~G3 (rev 4)~~ | 2026-08-19 | superseded — **PASSED** — ADR-0005 rev 4 accepted; 5 sign-offs answered (see Locked). **⚠️ The checker loop did NOT converge**: budget is 2 rounds; r1 = 6 blocking + 16 non-blocking, r2 = 8 **new** blocking + 15; a 3rd ran at Muskan's explicit call. r2 caught 3 real defects in the draft — a price gate that would have broken the seller's own shop, a basket rule that skipped the G1-locked price check, and a `metadata` projection that would have shipped sellers' private notes to buyers. Two researcher claims were overruled on spot-verification (the rule lives in **7** places, not 3; `get_discoverable_shop` could not satisfy AC 7). |
| **G2 (prototype)** | 2026-08-19 | **PASSED** — variant **A (full shop)**. Contract is the in-app route, not the HTML: Muskan's objection — *"if I confirm this html variant then maybe the builder will build this same thing and not follow my real app frontend"* — is correct, and variant A's claim ("reuse the seller's shop") cannot be proven by a mock. Walked on the buyer route **and** on the seller's `/present`. The walk found 4 defects + 2 shape changes in shipped components (NOTES.md). |

## For Muskan
- ✅ **Q2a SETTLED** — a verified buyer *can* read a foreign seller's prices where
  `price_public` is on, connected or not; `anon` is revoked outright. Evidence:
  `RESEARCH.md` § Backend reality, and `DECISIONS.md:114`'s connection-gated rule is
  superseded twice over (`:116`, `:1010`).
- ✅ **Q2b SETTLED — the gap is real.** The basket table is owner-scoped only and never
  checks whether the buyer may *see* the product. Spec closes it server-side (PRD §4.7,
  AC 10).
- ✅ **L0/L1/L2 answered for all three** — PRD §3 decisions 3–7, AC 2–6.
- ⚠️ **Owed, not blocking:** `docs/superpowers/plans/2026-07-07-product-basket.md`
  Tasks 9–11 needs a dead marker (superseded by this PRD), and project `CLAUDE.md`'s
  "Loose ends" still lists it as live work.
- ⚠️ **Still open, ask Marcel:** compliance position for real pharmacies ordering
  (`august-mvp.md:99-100`) — a before-launch question, not a build blocker.
- ⚠️ **DEV-113** (Backlog, unowned) — which shop/location a buyer is shown at connect
  time. Decision 9 takes "all the seller's location tabs" *for now*.

### ▶ Carried into `/design` (G3)
1. **⚠️ THE ADR MUST DECIDE: `BuyerShopView` wrapper vs more knobs on `ShopView`.** Buyer
   mode currently rides three props on the seller's component (`viewerCanManage`,
   `buyerContext`, `emptyState`); a fourth was added and withdrawn during G2. Each new buyer
   difference costs another prop on a **shipped** surface the seller depends on. Do not let
   this default by accretion.
2. **The migration** — decision 6's relationship arm on the catalogue read path
   (`DECISIONS.md` 2026-08-19). Still unwritten; the slug carries it despite triaging
   frontend-only.
3. **Basket admission must be enforced server-side** (PRD §4.7 / AC 10) — `product_basket_line`
   is owner-scoped only and never checks whether the buyer may *see* the product.
4. **Where the buyer strip finally belongs.** It renders above the info boxes via a slot;
   the HTML put it under the tagline inside the banner. Cosmetic, but it is item 1's problem
   in miniature.
5. **Delete `src/app/prototype-0022-buyer-shop/` at `/build`.**
