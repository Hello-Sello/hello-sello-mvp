---
status: accepted   # G3 PASSED 2026-08-19 (Muskan) · rev 6 — four checker rounds folded in.
                   # Rounds 1→2→3→4 gave 6→8→9→9 blocking. The loop never converged; what
                   # ended it was round 4 finding that FOUR OF THE SEVEN SITES ARE NOT ON
                   # THE BUYER'S READ PATH AT ALL. rev 6 drops them → scope went 7 sites → 3,
                   # which dissolves ~half the accumulated findings outright.
                   # rev 6's own edits are UNCHECKED by a fresh agent; `critic` + `security`
                   # carry them at build, against real code rather than prose.
                   # All five G3 sign-offs answered — see "G3 decisions" below.
                   # r1: 6 blocking + 16 non-blocking · r2: 8 blocking + 15 non-blocking
                   # ⚠️ THE LOOP DID NOT CONVERGE. Budget is 2 rounds (PIPELINE.md §5);
                   # round 2 still produced NEW blocking findings. A third round is
                   # Muskan's explicit call — the 0021 dry run ran 7 and never reached
                   # zero, which is why the budget exists. Everything below is folded in;
                   # the four items needing Muskan are marked ⚠️ G3.
                   # bias applied throughout: prefer the fix that REMOVES a mechanism
#
# G3 decisions — Muskan, 2026-08-19, all five taken on the recommendations as written:
#   1. The structural fork  → WIDEN THE FIVE base-table policies (§3). One rule, one meaning,
#      every door. The one-helper alternative is recorded in §3 and was not taken.
#   2. The verification tightening → YES (§3). Three policies gain `is_caller_verified()`;
#      unverified authenticated members lose reads they have today. Deliberate, not incidental.
#   3. AC 3 wording → AMENDED (§8), and the shop-level Request-pricing CTA is RETIRED.
#   4. `supplier_product_code` → OMITTED from the buyer payload (§4).
#   5. AC 9 → SPLIT to its own slug (§9). Not built here.
---

# The buyer's shop is the seller's shop, widened by one relationship predicate

**Spec:** `docs/PRD/0022-buyer-shop-view.md` (G1-approved 2026-08-19) ·
**Prototype:** variant A, contract = `src/app/prototype-0022-buyer-shop/page.tsx` (G2 2026-08-19) ·
**Research:** `docs/muskan-build/0022-buyer-shop-view/RESEARCH.md` (spec sweep + `## Approaches (design)`)

## ⚠️ Round 3 — why this ADR went back to `proposed`

Muskan called a third checker round past the 2-round budget, *"just to see what happens"*.
It found **9 blocking findings**, which settles the convergence question empirically: this
loop does not converge, and rounds 1→2→3 produced 6, 8 and 9 blocking findings respectively.
Two of the three are load-bearing enough to reverse the gate.

**The two that reverse it:**

- **A security hole (B2).** §7's admission policy is `AS RESTRICTIVE FOR INSERT`, so it never
  fires on UPDATE — and `authenticated` holds table-wide UPDATE on `product_basket_line` with
  no column restriction. A buyer can insert a legal line, then `PATCH` its `product_id` to a
  hidden or price-hidden product. **That is admission by another verb, and it defeats AC 10
  and PRD §6.5 — the one rule the spec insists must be server-side.** The repo already owns
  the fix and it is a *removal*, not a mechanism: the column-REVOKE idiom from
  `20260710120000_person_company_id_lockdown.sql` (DEV-88).
- **A signed decision resting on a wrong count (B1).** §3 says three sites lack
  `is_caller_verified()`. **Four do** — `pricelist_item_public_select`
  (`20260617090100:36-44`) has neither the verified gate nor the visibility window. Muskan
  signed the tightening against that inventory, so the sign-off must be re-taken on the true
  one. Worse: this policy was read verbatim during this ADR's own drafting and still written
  down wrong.

**Also blocking, all verified:** the price gate drops `!editing` and would put the buy row
back into the tier editor's footer (B3) · the blast radius omits `getOwnCatalog`
(`deals/supabase/reads.ts:526-542`), a `product` reader with **no company filter**, which
after §3 gains every connected company's hidden products (B4) · three internal
contradictions where a round-2 fix landed in one section and not the other (B5, B6, B7) ·
a mis-cited ledger line (B8) · and the AC 9 split silently carries **decision 11 and half of
decision 2** with it, leaving a non-connected buyer full basket controls and no way to send
(B9).

**The better option round 3 surfaced, and it is a removal.** §7 argues — correctly — that a
policy's subquery is itself RLS-filtered, so visibility need not be restated. That same fact
means sites 2, 3 and 4 could have their duplicated `profile_visible`/window conjuncts
**deleted** rather than widened with an `OR`. Strictly less predicate, permanently
drift-proof, and it is exactly the bias this document claims to apply. The ADR weighed "one
helper vs five rewrites" and never weighed "five rewrites vs three deletions".

**Corrected on the record:** round 3 confirmed the seven-site inventory is exactly complete,
the §4 metadata-leak catch, the §6 `writeStandardPrice` catch and the §5 location-tabs
correction are all true, and ADR-0004 is not contradicted.

**✅ Resolved in rev 5, Muskan 2026-08-19 — she took the removal.** §3 is rewritten around
round 3's insight: **one rule states the truth, four inherit it, two restate it because they
bypass RLS by construction.** That answers B1 (the four-not-three inventory stops mattering —
the sites that lacked the verified gate now inherit it) and takes the deletion option in one
move. B2's hole is closed with a column-REVOKE, which is also a removal. Every other round-3
blocking finding is folded in at its section.

---

## ⚠️ Round 4 — the finding that ended the loop

Muskan authorised a fourth round. It found 9 blocking, two of them real-world breakages
(below) — but its most valuable finding was **strategic, and it shrinks this ADR**:

> The buyer page reads through `get_discoverable_shop`, a `SECURITY DEFINER` function running
> as `postgres` with RLS bypassed. **Sites 2-5 are not on the buyer's read path at all.**
> Site 1 is needed (§7's basket predicate leans on it). Sites 6 and 7 are needed. Sites 2-5
> are pure housekeeping — and they carried the slug's widest live behaviour change.

**rev 6 drops sites 2-5 from this slug.** Scope goes from seven sites to **three**, and that
single cut resolves, with no further argument:

- **the ADR-0004 contradiction** (round 4, B5) — `plit_public_select`'s inlined gate was
  ADR-0004's deliberate *"defense in depth for future direct reads"*
  (`0004-tier-ladder.md:122-127`, a recorded G4 decision). rev 5 deleted exactly that. rev 6
  does not touch it.
- **the four-versus-three miscount** (round 3, B1) — it stops existing; only site 1 changes.
- **the unsatisfiable drift invariant** (round 4, B3), the site-5 self-contradiction (N5),
  and the child-table performance multiplier (N4).
- **most of the behaviour change** — unverified members keep their reads of images, media,
  prices and ladders; only the `product` door tightens.

**What rev 6 still changes, each load-bearing:**

| Site | Why it cannot be dropped |
|---|---|
| **1** `product_public_select` | §7's basket admission reads `product` under the buyer's own RLS. Without site 1 the buyer cannot add the very products decision 6 reveals |
| **6** `current_pricelist_item` | owner-rights view — bypasses RLS, so it must state the rule itself or a connected buyer's hidden-but-priced product returns a NULL price |
| **7** `get_discoverable_shop` | `SECURITY DEFINER` — bypasses RLS; this IS the buyer's read path |

**The two real-world breakages, both verified in code, both fixed below:**

- **B1 — the column-REVOKE breaks the shipped basket.** `addToBasket` is a PostgREST upsert
  whose payload includes `owner_person_id` and `product_id`
  (`src/modules/basket/supabase/writes.ts:28-34`); `ON CONFLICT DO UPDATE` generates a `SET`
  list over **every payload column**, and Postgres checks UPDATE privilege against it
  statically. rev 5's `revoke update … grant update (pack_count, …)` would make every *re-add*
  of an already-basketed product fail `42501`. Fixed in §7 — and the fix is a removal.
- **B2 — nothing wires `viewerIsOwner`.** `ShopView.tsx:660-673` passes no such prop to
  `ProductCard`, and rev 5 insisted `ShopView` gets "zero behavioural change". The gate would
  default to owner in buyer mode and **never fire** — AC 3 silently failing while every T03
  component test passed. Fixed in §6.

---

## Plain English — the options, and why the winner wins

**What we are building.** A buyer opens a seller from Discover and gets the seller's real
shop — same banner, same cards, same prices — with nothing they could edit. Most of it
already exists. The work is plumbing plus two gaps nobody had measured.

**Option 1 — build a buyer's shop.** A second page, second card, second price reader.
*Product cost:* the two shops drift; the seller changes something and the buyer's copy shows
last month's design. *Reversibility:* worst of the three — two codebases both in use, neither
deletable without a rewrite. **This is what the never-built July plan proposed**
(`docs/superpowers/plans/2026-07-07-product-basket.md`, Tasks 9–11), and it is why that plan
is marked dead.

**Option 2 — keep adding switches to the seller's shop.** Every buyer difference becomes one
more on/off prop on the component the seller depends on. *Product cost:* cheap for one or
two, then it compounds — and it has already bitten us. Four of the six defects the G2 walk
found were exactly this: seller controls leaking into the buyer's view because a switch was
missed. *Reversibility:* each switch is easy to remove alone; the habit is not.

**Option 3 — one shop, and a thin buyer wrapper around it (chosen).** The seller's shop
component stays the single shop. A small buyer-only file sets it read-only, drops in the
buyer's Connect strip, and nothing else. *Product cost:* near zero — the buyer sees whatever
the seller's shop became, automatically. *Reversibility:* best — the wrapper is a file you
can delete.

**How this is normally done.** The React community has a name for option 2: the **"boolean
trap"** — components that accrete one toggle per mode until nobody can predict what a given
combination does. The standard remedy, once a component passes roughly five toggles, is
composition, not more toggles. The seller's shop is at three. **We are choosing to wrap at
three rather than discover the limit at six.**

**What breaks if we picked wrong.** If buyer and seller shops later need to look genuinely
different, the wrapper cannot express that and we would split the shop component in two — a
day's work we would have spent anyway. That is the cheap mistake. The expensive mistake is
option 1, which we discover only after the two shops have silently disagreed in front of a
customer.

### The second decision: who may see which product

Today the rule is *"a product is visible if the seller ticked 'visible' and the person
looking is from a verified company."* G1 decision 6 adds one word: **or connected.** A
seller's "visible" tick now means *"visible to companies I am **not** connected to."*

That sentence is written out **seven times** in the database — but only **three** of those
are on the buyer's path (§3, and the round-4 note above). We change those three, write the new
condition **once** as a small named function, and leave the other four alone.

Editing copies by hand is how this project lost Discover's security gate once already: a copy
was re-declared from a stale source and the gate silently vanished. That is why the condition
is a function rather than three more copies — and why the four untouched sites are better left
untouched than "made consistent" for its own sake.

**How the scope moved, honestly.** rev 1 changed two sites and argued the rest were off the
path. That was wrong in one specific way — the basket's permission check reads `product` under
the buyer's own permissions, so site 1 was needed too. rev 2-5 over-corrected to all seven.
Round 4 established the accurate line: **three**. Site 1 because the basket depends on it;
sites 6 and 7 because they bypass permissions and must speak for themselves.

**Cost later:** a named function is the cheapest thing here to change — the rule moves by
editing one body. Seven inline copies means the next change updates six and nobody notices
the seventh until it is a security finding.

### ⚠️ Three things the spec did not know

All three make the work **bigger**. They are recorded, not absorbed.

1. **Neither Discover RPC returns what the shop needs.** `get_discoverable_shop` returns 15
   columns; the product card consumes 32. `get_discoverable_company` returns 11 and includes
   **no links, locations, tags or address** — all named by AC 1. Two RPCs need columns, not
   one (§4, §5).
2. **The card offers "Add to basket" on price-hidden products.** rev 1 claimed the card had
   no such control, and used that to justify leaving price out of the server rule. The
   control exists (`ProductCard.tsx:755-782`, no price condition). AC 3 fails today, and
   `ProductCard` therefore **is** in scope — rev 1's "don't touch it" fence was wrong (§6).
3. **AC 9 does not need the mechanism rev 1 said was missing.** Muskan's sequencing — accept
   the connection first, *then* the order lands in chat — means nothing has to be a deal
   until the relationship exists. rev 1 overstated this as blocked (§9).

**Recommendation in one sentence:** wrap, don't fork and don't switch; write the widened
permission rule once and apply it everywhere; fix the card's missing price gate; and split
AC 9 into its own slug so August ships.

## Context

`/discover/[companyId]` shows a hand-written 2-up teaser. `/present` shows the real shop.
`ShopView` already carries a `viewerCanManage` prop which, until the G2 walk, **had no caller
anywhere in the app** — buyer mode had never once executed. That walk is why four owner-chrome
leaks were found and fixed before this ADR existed.

## Decision

### 1. One shop component; a `BuyerShopView` wrapper, not a fourth prop

`ShopView` stays where it is. A new `BuyerShopView` composes it, fixing
`viewerCanManage={false}` and filling the two existing slots (`buyerContext`, `emptyState`).
Buyer-only chrome lives in the wrapper.

**Counted, and independently re-counted by the checker:** `viewerCanManage` gates exactly
**6 shallow top-level render sites** — `ShopView.tsx:587` SaveBar · `:611` `PresentBanner
canManage` · `:612` `canEditLogo` · `:627` → `EmptyShop`'s own branch · `:635` the
Add-shop/Assign pill row · `:678` AddProductTile. All owner *logic* (the `pendingProductEdits`
draft tree, batch CRUD, ladder validation `:305-324`, Present mode `:367-389`) is unreachable
from buyer mode. The component is **file-entangled, not logic-entangled** — which is what
makes wrapping sufficient and a split premature.

**Correction from round 1 (N6):** the Present-mode door is `onPresent`, passed
**unconditionally** at `ShopView.tsx:614`. The actual gate is `PresentBanner.tsx:73` —
`{canManage && !presenting && !editing && (…)}` — which wraps both the Manage and Present
buttons. The conclusion holds; rev 1 named the wrong prop. **`PresentBanner`'s `canManage`
is therefore part of the buyer-mode interface contract** and is listed as such in Reused.

**Placement, and the debt it accepts.** The wrapper lives beside the route it serves
(`src/app/discover/[companyId]/`), importing `ShopView` from `@/app/present/ShopView`. That
is one more **app-route → app-route** import edge — **an existing pattern, not a new one**
(round 3, B5): `ShopView.tsx:43`, `BrandingEditForm.tsx:20` and `present/page.tsx:2` all
already import `@/app/account/actions`. We accept it rather than move 1100 lines of seller edit
machinery into `src/modules/catalog/` — that would make a shared module fat with one role's
logic, the worse trade.

**The trigger to revisit, written down so it is not a judgement call later:** extract a
presentational core into `src/modules/catalog/components/` when **either** a third consumer of
the shop appears, **or** a buyer need requires a 4th `viewerCanManage`-shaped boolean on
`ShopView`. Slots do not count — `buyerContext` and `emptyState` are additive; behaviour
booleans compound.

**One stale comment is fixed despite the "no modifications" rule (N15):**
`ShopView.tsx:6-7` and `:209` name a visitor route `/present/[companyId]` that does not exist
and never will — the real one is `/discover/[companyId]`. Leaving it freezes a wrong pointer
onto the file that is now the buyer contract. Comment-only; no behaviour change.

### 2. The widened visibility rule, written once

```sql
create or replace function public.is_connected_to_company(p_company_id uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (
    select 1 from public.relationship r
    where r.deleted_at is null
      and r.status = 'active'
      and r.company_a_id = least(public.current_company_id(), p_company_id)
      and r.company_b_id = greatest(public.current_company_id(), p_company_id)
  );
$$;

revoke all     on function public.is_connected_to_company(uuid) from public;
grant  execute on function public.is_connected_to_company(uuid) to authenticated;
revoke execute on function public.is_connected_to_company(uuid) from anon;
```

Four deliberate choices:

- **`SECURITY INVOKER` (the default), not `DEFINER` — and it is the first of its kind here.**
  `rel_all` (`20260607170000_rls_policies.sql:263-265`) already lets a company member read
  their own `relationship` rows under RLS, so there is nothing to bypass, and round 2
  confirmed INVOKER works correctly in all three calling contexts (owner-rights view,
  `search_path = ''` DEFINER RPC, and an RLS policy on `product` — no recursion, since
  nothing in `relationship`'s policy chain reads `product`).
  **Stated honestly (round 2, N3): every one of the seven existing policy helpers in this
  tree is `SECURITY DEFINER`** — `current_company_id`, `is_caller_verified`, `is_hs_team`,
  `is_person_connected`, `is_relationship_member`, `owns_pricelist`, `owns_pricelist_item`.
  So this is a deliberate *departure* from local precedent, not a continuation of it. The
  trade: INVOKER keeps the attack surface smaller and needs no bypass; it costs a nested
  RLS evaluation on `relationship` per row. ADR-0004 argued the same direction for
  `save_price_ladder`, but that is an app-called RPC, not a policy helper — the analogy is
  directional, not exact. **✅ G3, Muskan 2026-08-19 — the deviation is SIGNED.** INVOKER is the smaller privilege and
  round 3 confirmed it returns correct results in all three calling contexts. One honest
  correction (round 3, N2): inside the owner-rights view and the DEFINER RPC the function runs
  as `postgres`, so RLS on `relationship` is bypassed there and `rel_all` is **not** what makes
  those two work — only the policy-on-`product` context matches the stated model. Results
  correct in all three; the rationale applies to one.
- **`STABLE`.**
- **Three-statement grant ritual**, not two. A two-statement copy is how `20260618120100`
  reopened the anon door (`20260816190000:152-154` records the rule).
- **`status = 'active'` needs no "not pending" clause.** `relationship_status` seeds exactly
  `active | suspended | ended` (`20260607090001:326-329`) — **there is no pending relationship
  row at all**; a pending request lives in `pending_inbox_item`. The PRD's "pending ≠
  connected" edge case is satisfied structurally, by the absence of a row.

**Performance, stated accurately (rounds 1 and 2 both trimmed an overclaim here).** The
research's ~10× benchmark is for **argument-less** helpers that fold to a once-per-statement
InitPlan. Two corrections on top of that: Postgres does **not** memoise `STABLE` results, and
InitPlan folding needs an explicit `(select …)` wrapper — a bare call does not hoist, not even
with a constant argument. And `uq_relationship_pair_active` is
`(company_a_id, company_b_id) WHERE deleted_at IS NULL`, so `status = 'active'` is **not**
covered: it is an index probe **plus a heap fetch**, per row, plus `rel_all` and one
`current_company_id()` under INVOKER.
**Net: this is a per-row cost, not a free one.** Still small — one indexed probe against a
table with one row per company pair — and no new index is warranted. If a shop page ever
measures slow, wrapping the call as `(select public.is_connected_to_company(...))` inside
`get_discoverable_shop` is the first lever, because there the argument really is constant.

### 3. The rule is applied at all seven sites — uniformly

Every current enforcement site, each read at its *latest* declaration:

| # | Object | Kind | Latest declaration |
|---|---|---|---|
| 1 | `product_public_select` | RLS on `product` | `20260617090100:28-31` |
| 2 | `pricelist_item_public_select` | RLS on `pricelist_item` | `20260617090100:37-44` |
| 3 | `product_image_public_select` | RLS on `product_image` | `20260617090100:48-53` |
| 4 | `product_media_public_select` | RLS on `product_media` | `20260705120100:47-51` |
| 5 | `plit_public_select` | RLS on `pricelist_item_tier` | `20260814120000:71-82` |
| 6 | `current_pricelist_item` public arm | view (owner-rights) | `20260816190000:62` |
| 7 | `get_discoverable_shop` WHERE | `SECURITY DEFINER` RPC | `20260816190000:143` |

**Three sites change. Four do not. Here is the whole map.**

| # | Object | On the buyer's path? | rev 6 |
|---|---|---|---|
| 1 | `product_public_select` (RLS on `product`) | **yes, via the basket** | **CHANGED** |
| 2 | `pricelist_item_public_select` | no — prices reach the buyer through the view | untouched |
| 3 | `product_image_public_select` | no — images ride the RPC | untouched |
| 4 | `product_media_public_select` | no — media rides the RPC | untouched |
| 5 | `plit_public_select` | no — ladders reach the buyer through the view. **ADR-0004 keeps this deliberately** (`0004-tier-ladder.md:122-127`) | untouched |
| 6 | `current_pricelist_item` public arm (view) | **yes** — bypasses RLS | **CHANGED** |
| 7 | `get_discoverable_shop` WHERE (RPC) | **yes** — bypasses RLS; this *is* the read path | **CHANGED** |

**Site 1** — the one base-table change, and the only place verification tightens:

```sql
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to authenticated
  using (
    deleted_at is null
    and public.is_caller_verified()                                       -- the tightening
    and (profile_visible or public.is_connected_to_company(company_id))   -- decision 6
    and (visibility_start is null or visibility_start <= current_date)
    and (visibility_end   is null or visibility_end   >= current_date)
  );
```

**Why site 1 at all, when the buyer reads through the RPC?** Because §7's basket admission
deliberately does **not** restate the visibility rule — it reads `product` and lets RLS
answer. That is the thin-predicate design, and it only works if site 1 is the truth. This is
the one dependency that survived every round.

**✅ G3, Muskan 2026-08-19 — the tightening is SIGNED, and rev 6 narrows what it costs.**
`is_caller_verified()` lands on site 1 only. Every one of the five catalogue tables also
carries an **owner policy** — `product_all` (`20260607170000:331-333`),
`product_image_all`, `product_media_all` (`20260705120100:39-41`), `pli_all`
(`20260607170000:346`), `plit_all` (`20260814120000:62`) — each scoped
`company_id = current_company_id()` and **none verification-gated**. Permissive policies OR
together, so:

- **A seller reading their own catalogue is unaffected**, hidden products included, even
  before their company is verified. They keep managing their shop throughout onboarding.
- **What changes:** an authenticated member of an **unverified** company loses direct reads of
  **other companies'** `product` rows. Images, media, prices and ladders are untouched by
  rev 6.

That is the HWG "verified members only" posture, already true of the view and the RPC. Still a
live behaviour change, and it belongs in the G4 walk.

**Site 1 is diffed against `pg_policy.polqual` on the live database before it is rewritten** —
never re-typed from the migration that first declared it (SECURITY-CHECKLIST S5). Three
separate stale-copy slips happened inside this ADR's own drafting; the rule exists because
this repo lost Discover's verified gate exactly that way.

**Sites 6 and 7** must restate the rule because both bypass RLS by construction. Both are
needed: a connected buyer looking at a product the seller hid but priced
(`profile_visible = false`, `price_public = true`) must see the product *and* its price. Site 7
returns the product; the price arrives via a `LEFT JOIN` onto the view, whose public arm still
demands `profile_visible` — so patching 7 without 6 yields a visible product with a silently
NULL price. At both, the override widens `profile_visible` **only**:

```sql
  AND (p.profile_visible OR public.is_connected_to_company(p.company_id))   -- widened
  AND (p.visibility_start IS NULL OR p.visibility_start <= current_date)    -- window: NOT widened
  AND (p.visibility_end   IS NULL OR p.visibility_end   >= current_date)
  AND p.price_public                                    -- price sites only: NOT widened
  AND public.is_caller_verified()                       -- verification: still required
```

The conjuncts outside the `OR` are each a PRD requirement: `price_public` (decision 7 —
connection never reveals a price), the window (an expired window is not overridden), and
`is_caller_verified()` (§4.2). **The HWG argument is untouched:** the audience only ever
widens to a company that is both verified *and* in an accepted relationship — narrower than
the public arm beside it, not broader.

**Grant ritual on the view.** `current_pricelist_item` changes via `CREATE OR REPLACE VIEW`
(the column list is unchanged). If anything ever forces `DROP … CREATE`, the migration **must**
re-issue `GRANT SELECT … TO authenticated; REVOKE ALL … FROM anon` — Supabase's default ACL
still hands `anon` everything on new *relations* (session 77's event trigger covers functions
only), so a drop-and-recreate silently re-opens the anon door.

**Round 3, N1 — one of rev 4's three reasons was unsound and is withdrawn.** rev 4 argued that
widening site 6 without site 5 would make the view admit a ladder `plit_public_select` denies.
It would not: the view is owned by `postgres` (`rolbypassrls`), so its `tiers` sub-select never
consults that policy — different access paths, and ADR-0004's invariant is a one-way
containment that holds either way. The decision stands on the remaining reasons.

**Grant ritual on the view (N1).** `current_pricelist_item` is changed with `CREATE OR REPLACE
VIEW` where the column list is unchanged. If any change forces `DROP … CREATE`, the migration
**must** re-issue `GRANT SELECT … TO authenticated; REVOKE ALL … FROM anon` — Supabase's
default ACL still hands `anon` everything on new *relations* (session 77's event trigger covers
functions only), so a drop-and-recreate silently re-opens the anon door.

### 4. `get_discoverable_shop` gains the product columns the card needs

**The gap, measured and corrected (round 1, N7).** The RPC returns **15** columns
(`20260816190000:84-99`). `ShopProduct` — the type `ShopView` and `ProductCard` consume
(`src/modules/catalog/shop.ts:43-86`) — carries **32**. Every one of the 17 is accounted for:

| Field | Disposition |
|---|---|
| `cbg_percent`, `cbn_percent`, `cultivator`, `lineage_parent_a`, `lineage_parent_b`, `irradiation_code`, `packaging_material`, `resealable` | **add** — AC 7 names each verbatim |
| `terpPercent` | **add, derived in SQL** — AC 7 ("terpene percentage") |
| `location` | **add** — AC 1 / decision 9: the tabs group by it |
| `packSizes` | **add** — PRD §4.4, the pack bubbles |
| `media` | **add** — card-back "Documents & Media"; absent → the section renders empty |
| `supplier_product_code` | **OMIT — ✅ G3, Muskan 2026-08-19.** The seller's own supplier code; AC 7 does not list it, and showing it to buyers is a commercial-confidentiality call. Non-optional on `ShopProduct`, so the buyer mapper emits `null` |
| `profile_visible` | **OMIT from the payload; the field becomes optional on `ShopProduct`** — see below |
| `batches` | **omit, return `[]`** — AC 7 forbids a batch or lot list |
| `bundle_threshold_grams`, `bundle_price_per_gram` | **not returned by the RPC; still emitted by the mapper**, derived from `tiers[0]` exactly as `shop.ts:246-247` does. They are non-optional on `ShopProduct` (`shop.ts:78-79`), so "omit" would not typecheck (round 2, N14). Migration C dropped the underlying columns |

**`terpPercent` — rev 1 stated the rule wrong (round 1, B6).** The real rule is
`shop.ts:241`: `r.terpene_percent ?? deriveTerpPercent(repBatch)` — **the manual
`product.terpene_percent` column wins**; the representative batch's terpene sum is only the
fallback, rounded to 2dp (`shopMap.ts:47-52`), with the representative batch picked by
`ready_for_sale_date DESC NULLS LAST, created_at DESC`. An RPC implementing rev 1's stated
rule would show the buyer a different Terp% from the seller on every product with a manual
value. The RPC must reproduce **this** rule, in SQL — which is also why the derivation stays
server-side: AC 7 forbids handing the buyer the batches it would otherwise need.

**`profile_visible` and the "Hidden" badge (round 1, N8).** `ProductCard.tsx:475-479` stamps a
"Hidden" badge whenever `!p.profile_visible` in read mode. After decision 6 a connected buyer's
view is largely made of such products, so every one would carry the seller's private state.
`profile_visible` is non-nullable on `ShopProduct`, so this decision gets made by accident
unless stated. rev 2 chose: **the buyer mapper sets `profile_visible: true` for every row.**
Round 2 traced every consumer and confirmed that is safe today — the only read-mode use is the
badge at `:475-479`; `:252` and `:442-448` sit in the `editing` branch, unreachable at
`editing={false}`.

**But round 2 is right that it is a lie to maintain where a removal was available (N15).** The
alternative: make `profile_visible` **optional** on `ShopProduct`, render the badge on
`p.profile_visible === false`, and have the buyer mapper simply **omit the field**. No lie, and
no future reader can be misled by one. That is one fewer mechanism, and the bias says take it.
**Chosen: omit the field.** The `ShopProduct` type change is one `?` and one badge condition.

**`packSizes` contract — and a leak rev 2 would have shipped (round 2, B4).** rev 2 said the
RPC returns "the raw `metadata` slice". **It must not.** `product.metadata` is a grab-bag: the
CSV template maps the seller's free-text **Note** into `product.metadata.note`
(`template.ts:58`), `import_products` writes it, and `manage.ts:407` records that metadata
"may carry other per-company custom columns". Returning it whole hands the buyer the seller's
private notes.

**The RPC returns `metadata -> 'pack_sizes'` and nothing else** — one key, explicitly
projected. The mapper parses it with the **same** `parsePackSizes` (`shop.ts:249`, `number[]`
in **grams**) so buyer and seller cannot disagree. Distinct from `pricing.ts`'s
`packSizes(product, tiers)`, which ADR-0004 made the owner of bubble/rung agreement — that
function is unchanged and still runs in the card.

**The same rule applies to §5's company chrome:** project the named keys out of
`company.metadata` (`links`, `locations`), never the whole object.

This is a `DROP + CREATE` of a `SECURITY DEFINER` function, so **grants reset** and the
three-statement ritual re-applies. The §3 connection arm and this column expansion ride the
**same** `DROP + CREATE` — the function is touched once.

### 5. `get_discoverable_company` gains the shop chrome — new in rev 2 (round 1, B3)

AC 1 names *"banner, information, **links** and location tabs."* `get_discoverable_company`
returns 11 columns (`20260617090000:112-124`): id, name, tagline, about, country, website,
logo_path, cover_path, type_codes, connection_state, pricing_requested. `Shop["company"]`
(`shop.ts:96-113`) needs **links, locations, tags, address, warehouse_location, updated_at** —
none of which it returns.

**⚠️ Correction, round 2 (B1) — rev 2 got the reason half wrong, and it was the half carrying
the slicing decision.** rev 2 claimed that without this migration there are "no location tabs
at all". Untrue: `LocationTabs` (`ShopView.tsx:875-888`) derives its options from **each
product's** `p.location`, which is assigned to `get_discoverable_shop` — **slice 2**.
`company.metadata.locations` feeds the *warehouse row inside the info box*
(`ShopView.tsx:834`), a different thing entirely.

**What this migration actually buys, stated correctly:** the links row, the company tags, the
address/warehouse line in the info box. **Location tabs arrive with the product columns in
slice 2 regardless of what happens here.**

`links`, `locations` and `tags` live in `company.metadata` and on existing columns; the RPC
projects the **named keys only** (§4's leak rule) and the mapper reuses `parseLinks` /
`deriveInitialLocations` (`shop.ts`, `catalog/locations.ts`) so buyer and seller parse
identically.

**Muskan's call, 2026-08-19, made on the corrected facts:** this migration ships **with the
page**, in slice 1. The links row and info box are AC 1 surface and a page missing them is not
walkable at G4 — the reasoning holds on the links half, which is the half that was right.

### 6. The card gains a price gate and a request-pricing slot — new in rev 2 (round 1, B1, B5)

rev 1 fenced `ProductCard` as untouchable. That fence was wrong, and it hid a real defect.

**The price gate.** `ProductCard.tsx:755-782` renders the quantity stepper and "Add to basket"
whenever `editing === false`, with **no price condition anywhere**. `priceShown` (`:351`) gates
only the price *text*, so a price-hidden product renders "Price on request" **and** a working
buy row beneath it. AC 3 and decision 3 both fail.

**The fix — and rev 2 got the condition wrong (round 2, B5).** rev 2 gated on
`p.price_per_gram != null`, reasoning that "the owner always has a price". **The owner does
not.** `writeStandardPrice` returns `{ ok: true }` on a null price — `manage.ts:440` is
explicit: *"price_per_gram is NOT NULL, so a null price is a no-op — hide a price via
price_public=false."* A product with **no `pricelist_item` row at all** is a supported seller
state, mapped to `price_per_gram: null` (`shop.ts:244`). rev 2's gate would therefore have
removed the stepper and Add button from the seller's own unpriced products on `/present` — a
live regression on the very flow it claimed to protect. It also collapsed a distinction the DB
keeps deliberately (`20260816190000:96-97`: `price_public` exists *"so the UI can tell 'price
on request' from 'price not set yet'"*), which would have shown Request-pricing on an unpriced
**public** product — outside AC 3's scope.

**The concept already exists in the card.** `ProductCard.tsx:351` computes
`priceShown = !editing && pricePublic && p.price_per_gram != null`. The buy row gates on the
same condition, with the owner exempt:

```
gate the buy row on   !editing && (priceShown || viewerIsOwner)
```

**The `!editing` guard is not optional (round 3, B3).** The buy row is `{!editing && (…)}`
today (`ProductCard.tsx:755`), and `:752-754` records why: *"In edit mode it was dead chrome …
its ~48px is exactly what the tier editor needs inside the fixed-height footer (G4
feedback)."* Since `viewerIsOwner` defaults true for `/present`, dropping `!editing` would put
the buy row back into the space ADR-0004's tier editor now occupies. The invariant below
passes under **both** forms — so the component test must assert the edit-mode case explicitly,
or nothing catches this.

`viewerIsOwner` is known inside `ShopView` — it is `viewerCanManage` — and **`ShopView` must
pass it down. Round 4 (B2) caught that rev 5 both required this prop and forbade the change
that supplies it**: `ShopView.tsx:660-673` passes no such prop, so with a default of `true`
the gate would never fire in buyer mode and AC 3 would fail silently while every component
test passed.

**So `ShopView` gains exactly one line — `viewerIsOwner={viewerCanManage}` on the
`ProductCard` call — and this ADR's "no behavioural change to `ShopView`" claim is corrected
to "one prop pass-through, no new state, no new branch."** The prop defaults to `true`, so
`/present` behaviour is unchanged and no other caller is affected. Request-pricing renders on the complement **only where the seller
has hidden the price** — never on merely unpriced products.

**The request-pricing slot.** `ProductCard`'s props (`:174-186`) carry no request-pricing hook.
Decision 4 requires the ask to be **per product**, so it must live on the card. The card gains
one optional callback beside the existing `onAddToBasket` — `onRequestPricing?: (productId) =>
void` — rendered in the same footer slot the buy row occupies, and only when the buy row is
gated off. Symmetric with the prop that is already there; no new component.

**These three card edits (price gate, request-pricing hook, badge suppression via the mapper)
are the only modifications to shipped shared components in this ADR.** `ShopView` gains no new
props (amended 2026-08-21 — see *Reused*); handlers internal to the file are allowed, and
beyond those it keeps only the stale-comment fix in §1.

### 7. Basket admission: one restrictive INSERT policy

**What rev 1 got wrong (round 1, B2 and B4).** Two separate errors:

- rev 1 extended `basket_line_owner_all`, which is `FOR ALL`. Under `FOR ALL`, `WITH CHECK`
  applies to **INSERT and UPDATE**. `addToBasket` is an **upsert** (`writes.ts:26-37`,
  `onConflict: "owner_person_id,product_id"`), and `updateBasketLinePackCount` / `…PackSize`
  (`:41-50`) are plain updates on the shipped drawer. rev 1's *"only admission is gated"* was
  simply false — a buyer holding a line for a product that later went invisible would have been
  unable to change its pack count, contradicting the PRD's own edge case.
- The check read `product` under the buyer's RLS, which §3 now widens. Fixed there, not here.

**rev 2 adds one restrictive policy and leaves the shipped one untouched:**

```sql
create policy basket_line_admission on public.product_basket_line
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.product p
      where p.id = product_basket_line.product_id
        and (
          p.company_id = public.current_company_id()   -- the seller's own basket
          or p.price_public                            -- buyer arm: decision 3, PRD §6.5
        )
    )
  );

revoke all on public.product_basket_line from anon;   -- never closed at birth
```

**The policy is `FOR ALL`, not `FOR INSERT` — and that is rev 6 removing a mechanism, not
adding one.** Round 3 correctly found that an INSERT-only rule is ornamental: `authenticated`
holds table-wide UPDATE, so a buyer inserts a legal line and then PATCHes its `product_id`
onto a hidden product — admission by another verb. rev 5 answered with a column-REVOKE
(the DEV-88 idiom). **Round 4 proved that breaks the shipped basket** (B1): `addToBasket` is a
PostgREST upsert whose payload includes `owner_person_id` and `product_id`
(`writes.ts:28-34`); `ON CONFLICT DO UPDATE` generates a `SET` list over every payload column
and Postgres checks UPDATE privilege against it **statically**, so re-adding an
already-basketed product would fail `42501` — and the new error translation would report it to
the user as "you may not add this product".

Scoping the restrictive policy to `FOR ALL` closes the same hole with **no privilege
surgery**: the upsert keeps its grants, and the `WITH CHECK` runs on both the insert and the
conflict-update path, so a `product_id` that fails admission is rejected either way.

**What it costs, and why the PRD already accepted it:** a buyer holding a line for a product
that later becomes invisible to them can no longer edit that line's pack count. PRD §7 puts
exactly this case **out of scope for v1** (*"the price simply resolves as unavailable"*), so
this is the spec's own trade, not a new one. The line remains readable and deletable —
`USING` is untouched.

- **The predicate is deliberately thin — and shrank again in rev 3 (round 2, N6).** rev 2
  re-inlined `profile_visible`, both window conjuncts *and* `is_caller_verified()` here,
  writing the visibility rule an **eighth** time in a document whose whole thesis is that
  writing it repeatedly is the failure mode. It is unnecessary: a policy's subquery is
  RLS-filtered — that is exactly why §3 widens site 1 — so `product_public_select` **already**
  applies visibility, the window and (after §3) the connection arm to this very `select`.
  What remains here is only what RLS cannot say: the owner arm, and the price rule.
- **`price_public` is now IN the buyer arm — rev 2 left it out and that broke the spec
  (round 2, B6).** PRD §6.5 requires §4(3) — the price rule — to be enforced on the server, and
  decision 3 is G1-locked: *"Price hidden — can the buyer still add it to a basket? **No.**"*
  rev 2 relied on the card hiding the control, which is precisely what §6.5 forbids. One
  conjunct meets the spec; there is no reason to argue for a narrower reading.
- **The owner arm is load-bearing, not defensive** — without it a seller cannot add their own
  hidden **or unpriced** product to their own basket, breaking a shipped flow.
- **`AS RESTRICTIVE`** — restrictive policies AND with the permissive one, so this genuinely
  tightens; a second *permissive* policy would have OR'd and tightened nothing. The pgTAP
  cases must exercise **the upsert path** (`addToBasket`), not only the plain updaters —
  the upsert is the statement every real add goes through.
- **`revoke … from anon`** closes a door never closed at birth: `anon` still holds full DML on
  `product_basket_line` (`20260707100000` issues no revoke). Not exploitable today — the
  policy is `TO authenticated` — but the ADR asserts an anon invariant over this table, so the
  assertion should be true.

`addToBasket` keeps its shape and gains one thing: translating Postgres `42501` into the
user-facing refusal, so AC 10's "no line appears" is legible rather than a raw database error.

### 8. Request pricing reuses the inbox that exists — with one honest gap

No new table, no new type. `pending_inbox_item` already seeds `type = 'pricelist_request'`
(`20260607090001:38`), and `src/app/discover/actions.ts:15-17` already records that a pricing
request is a *different ask* from a connect and **may coexist with a pending connect** —
exactly decision 4's shape. `pending_inbox_item.metadata` is `JSONB NOT NULL DEFAULT '{}'`
(`20260607090002:203`), so the product reference rides there — **no migration**. The existing
per-ask dup-guard (`actions.ts:41`) narrows to per-ask-**per-product**, or a buyer asking about
a second product is silently swallowed.

**The gap, and Muskan's resolution of it (2026-08-19).** Decision 4 says *"the exchange
happens in chat; everything goes through chat"*, and AC 3 says the action *"opens a
conversation with the seller."* But a chat thread hangs off a `relationship`
(`chat_thread.relationship_id`), which a non-connected buyer does not have — the same
dependency that governs AC 9. `createPairInboxItem` writes an inbox row, and an inbox row is
not a conversation. rev 2 conceded this and then declared AC 3 green anyway, which round 2
correctly called out as re-reading an AC to mean its negation (B7).

**Muskan's call, in her words:** *"the connection request will land on discover now and when
connected, relationship can be formed and the order can come in chat."* Applied to pricing,
that gives two arms — and the pre-connection arm is exactly how Connect already behaves:

| Viewer | The ask lands as | Why |
|---|---|---|
| **Not connected** | an inbox item on Discover, naming the product | no relationship exists, so no thread can exist. `createPairInboxItem` already allows a pricing ask to coexist with a pending connect (`actions.ts:15-17`) |
| **Connected** | **also an inbox item, naming the product** | see below — rev 6 collapses this to one mechanism |

**⚠️ rev 6 collapses both arms to the inbox (round 4, B8).** rev 5 specified the connected arm
as *"post the ask into the existing chat thread"* — and then gave it no design at all: no
thread lookup, no `chat_message` insert, no message type, no file, in a ticket sized **S**,
under a section headed *"no new table, no new type… no migration"*. It was unbuildable as
written.

**One mechanism serves both arms.** The ask lands in the seller's inbox naming the product,
connected or not. Once the two companies are connected, the conversation continues in chat
because they are connected — which is Muskan's own sequencing (*"when connected, relationship
can be formed and the order can come in chat"*) applied to pricing. Decision 4's requirement
that *the seller must know which product is being asked about* is fully met; what defers is
only **which surface the reply is typed into**.

**Deferred with the messaging slice, recorded so it is not lost:** a pricing ask from a
connected buyer posting directly into the existing thread. It is a genuine improvement and it
needs the design rev 5 skipped.

**✅ G3, Muskan 2026-08-19 — AC 3 is AMENDED.** G4 walks acceptance criteria verbatim, so the
words move with her sign-off rather than being reinterpreted at walk time:

> *"Using it opens a conversation with the seller that names that product"*
> → *"Using it sends the seller a request naming that product; the conversation happens in
> chat once the two companies are connected."*

**Also to be settled, not silently absorbed (round 2, B7 second half):**
`src/app/discover/[companyId]/RequestPricingActions.tsx` **already exists** as a shop-level
Request-pricing CTA writing the same `pricelist_request`. Narrowing the dup-guard to
per-product changes how the two interact. Either the shop-level CTA is retired in favour of
the per-product one (decision 4 says the seller must know *which* product), or both stay and
the guard must treat them as distinct asks. **✅ G3, Muskan 2026-08-19: the shop-level CTA is RETIRED.** One control removed rather than
two kept in sync, and decision 4 already rules that the ask names a product. The dup-guard
therefore has only the per-product ask to reason about.

### 9. AC 9 — buildable as Muskan sequenced it; recommended as its own slug

**rev 1 said this was blocked. It is not, and the correction is Muskan's** (2026-08-19):

> The buyer is just sending the order **and** a connection request. The connection request is
> accepted first, then the order is sent in chat, which is then accepted.

That sequencing dissolves the problem. rev 1 reasoned that an order is a `deal_card` hung off a
`relationship`, that `createDeal` requires a `relationshipId` (`basket/actions.ts:25`,
`deals/actions.ts:149`), and that no pending relationship status exists — all three true, and
all three irrelevant, because **nothing has to be a deal until the connection is accepted.**

The flow: buyer sends → the seller's inbox receives the connection request **and** a marker
that an order is waiting → the seller accepts the connection → the relationship row now exists
→ the order is born as a normal deal card and lands in chat → the seller accepts it there.

**What it still costs — rev 2 called this mechanism-free and round 2 was right to reject that
(B8).** Three concrete costs, recorded so the follow-up slug is scoped honestly:

- **The accept path knows nothing about baskets, and cannot.** `acceptItem`
  (`src/modules/connect/supabase/inbox.ts:258-340`) → `acceptInbox` is client-side TypeScript
  running as the **seller**, in a non-atomic sequence. The buyer's lines are gated by
  `basket_line_owner_all USING (owner_person_id = auth.uid())` — the seller literally cannot
  read them. Birthing the deal at accept therefore needs a `SECURITY DEFINER` RPC or a
  server-side job. **That is a new mechanism, on the flow the whole product runs on.**
- **AC 9 wants the order *visible* before acceptance** — PRD §4.8, *"visible, not openable."*
  "Store it nowhere the seller can read" satisfies *not openable* and fails *visible*. The
  seller needs a marker row carrying enough to say "an order is waiting", and nothing more.
- **Nothing pins the order between send and accept.** `createBasketDraft` deletes the lines at
  draft birth today (`basket/actions.ts:41-44`); leaving them live means what materialises at
  accept is whatever the cart happens to hold then, not what was sent. The held order needs a
  snapshot, or an explicit rule that the cart is frozen for that seller-group.

None of this makes the flow wrong — Muskan's sequencing is still the cheapest correct shape,
and it avoids the status-code change outright. It makes it **a slug, not a footnote.**

**✅ G3, Muskan 2026-08-19: SPLIT to its own slug — not built in 0022.** Not because it is
blocked, but because it is the only
part of this spec that is not on Marcel's demo path — his ask is *log in → connect → order*,
which is connect-**then**-order. AC 9 is the reverse and gates no demo step. Splitting it keeps
August's risk in the three slices that do gate the demo.

**⚠️ What the split takes with it, named rather than left implicit (round 3, B9).** G4 walks
the §3 decisions as well as the ACs, so these are recorded as deferred or they read as
silently dropped:

- **Decision 11** entirely (*"both at once… the order cannot be opened until the connection
  request is accepted"*).
- **Decision 2, second half** (*"sending the order also sends a connection request, and the
  buyer is told so before they send"*).
- **PRD §4.8** and the §2 In-scope line *"Ordering without a connection."*

**And it leaves a live dead end this slug must close.** Decision 2's *first* half — "full
controls" for a non-connected buyer — stays in scope, but `BasketDrawer.tsx:198` sets the
recipient to `null` when there is no relationship. So a non-connected buyer can fill a basket
they cannot send, with nothing explaining why. **In scope here:** the drawer states that
connecting comes first and offers the Connect action, instead of a dead Send. That is the
honest v1 of decision 2 — the buyer is told before they invest effort, which was the
decision's intent.

**Rejected alternative, recorded:** adding `relationship_status = 'pending'` and creating the
relationship early. It works, but it changes the accept path from INSERT to status-flip on the
connection flow the entire product runs on, and `is_relationship_member` ignores status — so a
pending relationship would silently grant deal visibility. Muskan's sequencing gets the same
outcome touching nothing.

## Reused — already built; we feed it, don't touch

- `ShopView` (`src/app/present/ShopView.tsx`) — composed; **gains no new props; internal
  handlers are allowed** (amended 2026-08-21 at T04's G4; was "no behavioural modification").
  The *prop* is what costs: every buyer difference expressed as one more knob turns the
  seller's shipped component into a mode switch, and each knob is permanent. A private
  handler beside the existing `handleAddToBasket` costs nothing outside the file and is
  already that file's own pattern. Its `viewerCanManage` / `buyerContext` / `emptyState`
  contract remains the interface. (This retires build deviations 1 and 7.)
- `PresentBanner`'s `canManage` (`PresentBanner.tsx:73`) — the **real** owner-chrome gate, part
  of the buyer-mode contract (N6). Shipped at G2; consumed, not changed.
- `EmptyShop`'s audience heading and `InfoBox` — G2 walk fixes; consumed.
- `ProductCard` — reused as **the** card. **A new card component is a build failure** (G2 lock).
  Three additive edits only (§6); its spec-row rendering, flip, ladder panel and layout are
  untouched.
- `resolveTierPrice`, the "See all prices" panel (HEL-50), and `pricing.ts`'s `packSizes()`
  (ADR-0004 §5) — the tier reveal and bubble/rung agreement are not rebuilt.
- `current_pricelist_item` + `resolveTierPrice` — **the one price door**
  (`ARCHITECTURE-NOTES.md:423`). Widened at one conjunct; not replaced, not paralleled.
- `parseLinks`, `deriveInitialLocations`, `parsePackSizes`, `pickRepresentativeBatch`,
  `deriveTerpPercent` (`shop.ts`, `shopMap.ts`, `locations.ts`) — the buyer mapper reuses these
  so the two viewers cannot parse the same data differently.
- `is_caller_verified()` — untouched; the new helper sits beside it and mirrors its grant ritual.
- `relationship`, `rel_all`, `uq_relationship_pair_active` — read only; no schema, no index.
- `pending_inbox_item`, `pricelist_request`, `createPairInboxItem` — reused via `metadata`;
  no new table, no new type, no migration.
- `basket_line_owner_all` — **untouched**; §7 adds a restrictive policy beside it.
- `addToBasket` / `getMyBasket` / `BasketDrawer` — already group by foreign seller.

## Blast-radius — what this can break, traced

| Surface | Files / objects | Risk |
|---|---|---|
| **Discover company page** | `src/app/discover/[companyId]/page.tsx:33` | 576 px → 1400 px. The page has **no hero/catalogue boundary today** — anything left at the old width inside the new one stretches. The defect class the G2 walk hit 4× |
| **Discover read layer** | `src/app/discover/companies.ts:127-207` | `DiscoverProduct` gives way to a `ShopProduct` mapper; both RPC shapes change under it. Currently **drops `tiers` on the floor** |
| **`product` base RLS** | `product_public_select` (site 1) | The widest-reaching edit in the ADR — it changes what *every* direct product read returns for a connected buyer. Intended (decision 6), but it is the base table the other policies close over transitively |
| **⚠️ The deal-line product picker** | `src/modules/deals/supabase/reads.ts:526-542` (`getOwnCatalog`) | **Round 3, B4 — the highest-value unlisted consequence of §3's widest edit.** Its own doc comment admits *"the product query has no company filter and `product_public_select` is unscoped, so the picker currently returns EVERY company's visible products (known issue)"*. After site 1 widens, the seller's picker additionally lists every **connected** company's **hidden** products. Pre-existing bug, made worse here. **Fix belongs in this slug** — one `.eq("company_id", …)`, a one-line narrowing of a query that was always meant to be own-catalogue |
| **The one price door** | `current_pricelist_item` | Public arm widens; every reader inherits it — `readCurrentPrices` (`catalog/pricelist.ts:62-67`), basket reads, the seller's own shop. Intended; live view under a shipped basket |
| **Discover RPCs ×2** | `get_discoverable_shop`, `get_discoverable_company` | `DROP + CREATE` → **grants reset**; 3-statement ritual mandatory on both. Shapes grow → `database.types.ts` regenerates |
| **`ProductCard`** | `:475-479`, `:755-782`, `:174-186` | Shared by the seller's shop. The price gate must not regress the seller's own add-to-basket — the null-price gate is chosen precisely for that (§6) |
| **Basket writes** | new restrictive policy, `basket/supabase/writes.ts` | Tightens a shipped path on INSERT only. **The seller's own add-to-basket is the regression risk** — owner arm required |
| **Request pricing** | `src/app/discover/actions.ts:15-41` | Dup-guard narrows to per-product; get it wrong and a second product's ask is silently swallowed |
| **`ShopView` consumers** | `src/app/present/page.tsx` | The seller path must stay behaviourally byte-identical; the wrapper adds no prop |
| **Local seed** | `supabase/seed/seed.sql` | **Zero products are `profile_visible` today** (round 1, N11) — AC 1-4 are unwalkable and the pgTAP matrix unwriteable on a fresh `db reset` until the seed carries one of each combination |
| **Prototype route** | `src/app/prototype-0022-buyer-shop/` | **Delete at `/build`** — it is throwaway and imports real components |
| **Cloud ledger** | `docs/deploy/cloud-migrations-pending.md` | Entries per slice; app code + migrations are **same-deploy** (RPC shape changes break the old client). ⚠️ The ledger currently contradicts itself — the `## PENDING (local only)` header at `:320` is immediately followed at `:322` by `✅ APPLIED 2026-08-16 (Release 2)`. **Reconcile before using it for ops** (round 1, N13) |
| **ADR-0004** | its invariant table | Uniform application (§3) keeps *"ladder readable only where the base price is"* literally true — **no amendment needed**, where rev 1 would have required one |

## Invariants — sorted by enforcement

| Invariant | Enforced by |
|---|---|
| A buyer sees a product **iff** verified **and** (`profile_visible` **or** connected), window unexpired | **DB test** (pgTAP, all four combinations + expired window) |
| Connection **never** reveals a price — `price_public` governs alone | **DB test** (pgTAP: connected + `price_public=false` → price and tiers NULL) |
| A pending connection is not a connection | **DB test** (pgTAP: `pending_inbox_item` present, no `relationship` row → hidden products stay hidden) |
| No basket line may be **inserted** for a product its owner may not see **or whose price is hidden from them**; the **seller may always add their own**, including unpriced ones; existing lines stay editable | **DB test** (pgTAP: both arms, a price-hidden refusal (decision 3), and an update-after-hide case exercised **on the upsert path** — round 2, N5) |
| The three changed doors agree — a connected buyer sees a hidden product through **each**, an unverified caller through **none** | **DB test** (pgTAP asserting *behaviour*, not substrings: a direct `product` read for site 1, a view read for site 6, an RPC call for site 7. *Round 4, B3: a "must contain `is_connected_to_company`" grep is unsatisfiable by design now — four sites deliberately will not contain it. Round 3, N7: a substring check could never detect a missing window or verified gate anyway.*) |
| `anon` reads nothing new; every new/redeclared function carries the 3-statement ritual, every recreated **view** re-issues its grants | **Test** (`anon_execute_lockdown_test.sql`, extended to relations — round 1, N1) |
| Buyer and seller derive `terpPercent`, `packSizes` and links from the **same** rule | **Test** (unit: RPC-shaped fixture through the buyer mapper vs `getMyShop`'s mapper, same output) |
| No owner chrome renders in buyer mode — no save, manage, present, or banner/logo edit | **Test** (component test on `BuyerShopView`: AC 11 as assertions) |
| A price-hidden product offers no quantity control and no add-to-basket — **and an unpriced product on the seller's own shop still does** | **Test** (component tests on `ProductCard`: `price_public: false` → no buy row; `price_per_gram: null` + owner → buy row present, the round-2 B5 regression) |
| The local seed carries at least one product per visibility × price combination | **Test** (pgTAP count assertion on a fresh `db reset` — round 1, N11) |
| Prices read through the one door — no parallel price reader | **Already enforced, free**: `pricelist.guard.test.ts` already scans all of `src/**`. *Round 1, N14: rev 1's "extend it to `src/app/discover/`" was a no-op.* |
| The buyer surface renders `ProductCard`, not a second card component | **Judgment** — `consistency` agent's brief |
| Buyer mode gains no 4th `viewerCanManage`-shaped boolean on `ShopView`; slots don't count | **Judgment** — `critic`'s brief, with §1's split trigger as the test |
| The buyer never receives batch/lot data, including as terpene-derivation input | **Judgment** — `critic`'s brief (the RPC derives `terpPercent`; `batches` returns `[]`) |
| Seller-private state never renders in buyer mode (the "Hidden" badge is the known instance) | **Judgment** — `critic`'s brief; the mechanism is that `profile_visible` is optional on `ShopProduct` and the buyer mapper omits it |

## Consequences

- **Three migrations**, one per slice, each same-deploy with its app code:
  1. `get_discoverable_company` chrome columns (**slice 1, with the page** — Muskan, 2026-08-19)
  2. `get_discoverable_shop` product columns (slice 2)
  3. `is_connected_to_company` + the seven sites + the restrictive basket policy + the
     `product_basket_line` anon revoke (slice 3)
- **One new SQL function**, `SECURITY INVOKER` — the **first** INVOKER policy helper in the
  tree; all seven existing ones are DEFINER (§2, a signed deviation).
  **No new table, no new index, no new lookup row, no new status code.**
- **One seed change** — without it AC 1-4 are unwalkable on a fresh `db reset`.
- **One new React file** (`BuyerShopView`), one rewritten page, three additive `ProductCard`
  edits, zero behavioural change to `ShopView`.
- **One more app-route → app-route import edge.** *(Round 2, N2: rev 2 called this the first of
  its kind — wrong. Three already exist: `ShopView.tsx:43`, `BrandingEditForm.tsx:20` and
  `present/page.tsx:2` all import `@/app/account/actions`.)* So this is an existing pattern,
  not a new debt — which strengthens the choice and weakens the "accepted debt" framing. The
  split trigger in §1 stands regardless.
- **AC 9 splits to its own slug** (§9) — Muskan's call at G3.
- **Deferred, and caused by this ADR:** decision 6 repurposes `profile_visible`, so a seller
  loses the only switch that hides a product from **everyone**. The visibility-window columns
  survive as the un-overridden escape hatch but have no UI and are the wrong shape for
  "out of stock". A **deactivate / unavailable** control is owed (Muskan, 2026-08-19); worth
  deciding then whether delisted and out-of-stock are one concept or two.
- **Two doc amendments the PRD itself requires and rev 2 omitted (round 2, N8):**
  `DECISIONS.md` records decision 6 as an amendment to the 2026-06-14 soft-openness lock
  (PRD §6.1), and `CONTEXT.md`'s **Buyer Shop View** entry is corrected (PRD §6.2). Both were
  in fact written at G1 — the ADR must not imply they are still owed.
- **One AC amendment (⚠️ G3, §8):** AC 3's *"opens a conversation"* → *"sends the seller a
  request naming that product; the conversation happens in chat once connected."*
- **✅ Spec edge case, now DECIDED (round 4, B7 — an unresolved recommendation is not a
  decision).** PRD §7 says a member of the **seller's own** company "sees their own shop".
  `get_discoverable_shop` has no owner arm, and `is_connected_to_company(ownCompanyId)` is
  false by construction: `relationship_canonical_order CHECK (company_a_id < company_b_id)`
  makes a self-pair row impossible. **Decision: add the owner arm to site 7** —
  `or p.company_id = public.current_company_id()` — mirroring what the view already does. One
  conjunct, satisfies a PRD row, costs nothing. Built in **T05**.
- **Slice ordering is a review convenience, not a deploy gate (round 2, N13):** `supabase db
  push` applies every file in `supabase/migrations/`, so prose cannot hold one back (ADR-0004
  §3 needed a `.hold` file for exactly this). Here the DB-first order is harmless — each
  migration is additive and backward-compatible with the older client — so the three slices
  can land as three PRs against one deploy. **No slice is independently walkable**: slice 1
  gives chrome without cards, slice 2 cards without the widened rule. G4 walks the union.
- The July Product-Basket plan's Tasks 9–11 stay dead; this ADR is the reason.
- `ADR-INDEX.md` gains this ADR's line.
