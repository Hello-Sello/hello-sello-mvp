# PLAN — T07 · Server-enforced basket admission · rev 3

**Ticket:** `TICKETS.md` § T07 (HEL-61) · **AC 10** · depends on T06 (✅ G4 PASSED 2026-08-23)
**Base:** `claude/muskan/work` @ `fac1993` — 0 behind `origin/dev`, frozen for this build.

---

## 0. The hole, stated exactly

`product_basket_line` carries **one** policy (`20260707100000:26-30`):

```sql
create policy basket_line_owner_all on public.product_basket_line
  for all to authenticated
  using (owner_person_id = auth.uid())
  with check (owner_person_id = auth.uid());
```

It answers *"is this my line?"* and **nothing else**. It never asks whether the
caller may see the product, or may know its price. Any authenticated caller can
`POST /product_basket_line` with **any** `product_id` — a competitor's hidden
product included — and the row is admitted. Nothing downstream re-checks: the
basket read joins `product` (so RLS hides the *name*), but the **row exists**,
the count is wrong, and `toDraftLines` will carry it into a deal draft.

T06 made this worse in exactly the way the ADR predicted (round 3, B4): widening
site 1 widens what a connected buyer may reference, and the basket never consulted
site 1 at all.

---

## 1. The design — reuse the visibility rule, do not restate it

**The rule already exists** as `product_public_select` (rewritten by T06) plus the
owner policy `product_all`. Restating it here would be a second authoritative copy
of one fact — the exact failure L-031 was written about this morning, and the
class ADR-0005 §2 fences.

**Reuse mechanism, already documented in this slug's own migration:** a policy
subquery is **RLS-filtered as the calling role**. So

```sql
exists (select 1 from public.product p where p.id = product_id)
```

evaluates *through* whichever `product` policy applies to the caller — the buyer
gets T06's rule (visibility window, verified gate, connection override) and the
seller gets `product_all` — with **no predicate duplicated and no edit needed here
when the rule next changes**. This is the same cascade the T06 migration relies on
for `pricelist_item`, `product_image` and `product_media`.

Live confirmation of both arms (`pg_policy`, this stack, today):

| policy | qual |
|---|---|
| `product_all` | `(company_id = current_company_id())` |
| `product_public_select` | `deleted_at IS NULL AND (profile_visible OR is_connected_to_company(company_id)) AND «window» AND is_caller_verified()` |

**Only the price arm needs new text**, because no `product` policy expresses it:
a buyer may not add a product whose price is hidden; the **seller may**, including
a product with no price set at all (ticket, owner arm).

### The predicate

```sql
exists (
  select 1
    from public.product p
   where p.id = product_basket_line.product_id
     and (
          p.company_id = public.current_company_id()   -- owner arm: price rule N/A
       or p.price_public                               -- buyer arm: decision 3
     )
)
```

Visibility rides the EXISTS. Price is the only conjunct written here.

---

## 2. ⚠️ The policy SHAPE — measured, not assumed

The ticket accepts a consequence that constrains the shape:

> *a buyer can no longer edit the pack count of a line whose product became
> invisible to them … **the line stays readable and deletable**.*

A restrictive `FOR ALL` policy **with a `USING` clause** would make that line
**unreadable and undeletable** — it would silently delete-proof rows and shrink
baskets. So the policy must carry **`WITH CHECK` only, and no `USING`**.

**Proven on this stack before planning** (rolled-back transaction, restrictive
`for all … with check (false)` installed alongside the owner policy):

| verb | observed | ticket requires |
|---|---|---|
| `SELECT` | `1` row visible | readable ✓ |
| `INSERT` | `ERROR: new row violates row-level security policy` | refused ✓ |
| `DELETE` | `DELETE 1` → `0 remaining` | deletable ✓ |

And `pg_policy` confirms `polqual` is genuinely **NULL** when `USING` is omitted —
it does **not** default to the `WITH CHECK` expression, and does not default to
`false`. Both halves measured; neither inferred.

`WITH CHECK` runs on `INSERT` and on `UPDATE`'s new row. `SELECT` and `DELETE`
have no `WITH CHECK` phase, so they are untouched by construction — which is why
this shape delivers the accepted consequence exactly rather than approximately.

### Why `FOR ALL` and not `FOR INSERT`

The ticket already records this (round 3): `UPDATE` is granted table-wide, so an
`INSERT`-only policy is ornamental — a buyer inserts a legal line, then `PATCH`es
its `product_id` onto a hidden product. `FOR ALL`'s `WITH CHECK` covers the insert
and the update-to-new-row alike.

And **not** a column-`REVOKE` on `product_id` (round 4, B1): `addToBasket` upserts,
and `ON CONFLICT DO UPDATE` requires `UPDATE` privilege on **every** payload column
— revoking `product_id` breaks the real add path. `FOR ALL` closes the hole with no
privilege surgery. *(This is the mistake ADR-0005 rev 5 shipped and rev 6 caught.)*

---

## 3. Files

| file | change |
|---|---|
| `supabase/migrations/20260823100000_basket_admission.sql` | **new** — restrictive policy + `anon` lockdown |
| `supabase/tests/basket_admission_test.sql` | **new** — pgTAP-style behavioural proof |
| `supabase/tests/run_basket_admission_test.sh` | **new** — runner, copies `run_connection_visibility_override_test.sh` verbatim in idiom |
| `src/modules/basket/supabase/writes.ts` | `addToBasket` maps the RLS refusal to a typed error |
| `src/app/present/ShopView.tsx` | `handleAddToBasket` catches it — **shape ESCALATED, see §6** |
| `src/modules/basket/components/BasketDrawer.tsx` | 🔴 **B2 (round 2)** — the policy's **second** refusal path |
| `docs/deploy/cloud-migrations-pending.md` | the ledger entry (note 8 — §8 required it, Files omitted it) |

> 🔴 **B2 — the accepted consequence lands in production as an unhandled rejection.**
> `BasketDrawer.tsx:264-267` calls `updateBasketLinePackCount` with **no try/catch**, and its
> prop type is `(packCount: number) => void`, invoked inside `onClick` at `:395`/`:400` — the
> Promise is dropped. Identical to the `ProductCard.tsx:852` shape this plan already diagnosed
> for the add path. Proven live with the proposed policy installed and the product's
> `visibility_end` pushed into the past: `SELECT → 1`, **`UPDATE pack_count → 42501`**,
> `DELETE → OK`. So cell 9's "accepted consequence" is not inert — **the buyer clicks the
> stepper and gets a silent no-op plus an unhandled rejection.** DEV-83's shape, for the
> **fourth** time on this slug (DEV-83 · T10 · the add path · now this).
> **The in-file fix already exists:** the sibling `onPackSizeCommit` (`:269-279`) try/catches
> into the drawer's existing error line (`:293`), and its own comment says *"the writer throws
> (**like the pack-count writer**)"* — the throw was known and left unwrapped.
> ⚠️ **L-028 fired again:** rev 2's fixture sweep searched e2e for "Add to basket" — it swept
> by fixture, **not by the verbs the new `WITH CHECK` now gates.** Sweep by verb.

> 🔴 **B1 — rev 1 named `src/modules/basket/actions.ts` as the caller. IT IS NOT ONE.**
> `grep -rn "addToBasket" src/ e2e/` → `writes.ts:19`, `index.ts:3`, `ShopView.tsx:47`,
> `ShopView.tsx:579`. `actions.ts` is `createBasketDraft` — a server action that calls
> `createDeal` and then deletes the drafted lines. No relationship to the add path.
> **rev 1 §6 cited L-031 (*"do not assume the other copy; open it"*) and then did exactly
> that, in the same file, hours after L-031 was written.** Recorded in LEARNINGS as evidence
> under L-031 rather than as a new entry.

**Not touched:** `basket_line_owner_all` (adding a second policy, never re-declaring
the first — so this migration carries **no S5 re-declare risk at all**).
`product_public_select` and `product_all` are read-only inputs here.

---

## 4. Migration steps, in runnable order

1. `create policy basket_line_admission on public.product_basket_line as restrictive for all to authenticated with check (…)` — predicate from §1.
2. `revoke all on public.product_basket_line from anon;` **and** `from public;`

   > 🔴 **B3 — rev 1's stated reason was FALSE.** It said *"revoking only `anon` leaves the
   > `PUBLIC` grant standing and the door open."* Live `pg_class.relacl` for this table:
   > `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`
   > — **there is no PUBLIC entry.** Tables get no default PUBLIC grant; the session-76/77
   > rule is about `EXECUTE ON FUNCTIONS`, which is where `20260817120000` operates and where
   > T06's own header applies it correctly (`20260822100000:102-107`).
   > **The statement stays** (belt-and-braces, and it costs nothing) but the migration header
   > must say *"`relacl` carries no PUBLIC entry today; this is defence in depth, not a
   > closed door"* — never rev 1's sentence.
   >
   > ⚠️ This is **L-010's trigger verbatim**, and it is the **fourth** false claim about
   > database defaults in this slug's migration prose (TRUNCATE "blocked by RLS", the
   > over-counted cascade, the ledger repeating it, now this). The pattern is: a rationale
   > that sounds like a rule gets written without querying the catalog. **Query first.**

   **Enumeration before revoking (N7 — the T09 method, which rev 1 skipped).** `anon` reaching
   this table today: `reads.ts:19-21` returns `{groups: [], totalLineCount: 0}` **before**
   issuing any query when there is no user, and `BasketProvider.tsx:23-25` catches regardless.
   Nothing signed-out touches it. **A third path exists that rev 2 missed** —
   `src/modules/basket/actions.ts:42`, a server-side delete inside `createBasketDraft`, the
   only server-side toucher; conclusion unchanged. Verified live post-`REVOKE`: `anon` loses
   SELECT/INSERT/TRUNCATE (`permission denied`), Bob still inserts `OK`, `relacl` becomes
   `{postgres…,authenticated…,service_role…}`. The revoke breaks nothing.

   ⚠️ **Worth naming: `anon` can TRUNCATE this table TODAY** (`anon TRUNCATE => OK`, measured).
   This revoke closes one **T11** instance early — say so in the header, so T11's sweep does
   not later re-report it as still open.
3. Header comment carrying: why `WITH CHECK`-only (§2, with the measured table),
   why the EXISTS is not a duplicated predicate (§1), and the accepted consequence
   verbatim from the ticket.

⚠️ **No `create or replace` anywhere in this file.** Nothing existing is
re-declared, so the class that once stripped `list_discoverable_companies()`'s
verified gate cannot apply.

---

## 5. Tests — behavioural, per-arm, mutation-proved

**L-009 checked:** `ls supabase/tests/ | grep -i basket` → **no existing basket
suite**. This is a genuinely new file, not a duplicate.

**L-012 checked** — every assertion below names a seed row verified present on a
clean reset, not "as seeded":

| # | caller | product | expect | why this row |
|---|---|---|---|---|
| 1 | Bob (connected buyer) | **AUR-1B** visible + priced | **admitted** | control — proves the policy is not blanket-deny |
| 2 | Bob | **AUR-1C** hidden + priced | **admitted** | T06's override reaches the basket |
| 3 | Bob | **AUR-1D** hidden + **price-hidden** (`price_public=f`, price **5.00** set) | **REFUSED** | price arm |
| 4 | Bob | **AUR-1A** visible + **price-hidden** (`price_public=f`, price **8.00** set) | **REFUSED** | price arm, independent of visibility |
| 5 | Eva (unconnected, verified) | AUR-1C | **REFUSED** | visibility arm via the EXISTS cascade |
| 6 | Alice (seller, owner) | AUR-1D (own, hidden, price-hidden) | **admitted** | owner arm. ⚠️ **The seed ships GreenLeaf `verified`** (`seed.sql:82-83`) — the test must **mutate it to `pending` in-transaction** to exercise this, the idiom being `connection_visibility_override_test.sql:340-354`. rev 2 asserted the outcome without saying the test must create the state. Outcome verified: still `OK`. |
| 7 | Bob | insert legal AUR-1B, then **UPDATE** `product_id` → AUR-1D | **REFUSED** | the `FOR ALL` half — an INSERT-only policy passes this test wrongly |
| 8 | Bob | **upsert** path (`on conflict do update`) | **admitted** | the ticket's explicit demand: exercise the statement `addToBasket` actually issues |
| 9 | Bob | line whose product went hidden → `SELECT` + `DELETE` | **buyer-visible count = 1 BEFORE the delete; privileged count = 0 AFTER** | 🔴 **B4 (round 2) — "both succeed" CANNOT detect the `add-using` mutation.** Measured under the mutation: buyer `SELECT` → **0**, `DELETE` → **OK with no error**, buyer's post-delete count → **0** — every naive assertion stays green while `rows_left_privileged` → **1**, i.e. the row was never deleted. Only the *pre*-delete buyer-visible count and a *privileged* post count split the two worlds. The plan's own closing line — *a suite that stays green with the mechanism removed is asserting nothing* — applied to itself. Same class as session 81's four RPC guards firing with **zero assertions**. |
| 10 | `anon` | any | **permission denied** | grant arm. ⚠️ **Assert on `SQLERRM ~ 'permission denied'`, NOT on `42501`** — grant refusal and RLS refusal raise the *same* SQLSTATE (proven: pre-revoke `42501 new row violates…`, post-revoke `42501 permission denied`). |
| **13** | **Alice (owner)** | **own product with NO `pricelist_item` row at all** | **admitted** | the ticket says *"including one that is hidden, **or has no price set**"* and ADR `:856` assigns it a DB test; cell 6 only covers price-**hidden**. One cheap line, not a hole. |
| **11** | **Bob** | **`update pack_count` on a still-admissible line (AUR-1B)** | **ALLOWED** | 🔴 **B4** — the ADR assigns *"existing lines stay editable"* to a DB test and rev 1 had **no positive cell for the shipped drawer's plain updaters** (`writes.ts:41-60`). rev 1's round-1 B2 was precisely that they broke. Ten cells, every one an attack or a refusal — **L-011's class: the security invariants get remembered, the functional one gets dropped.** Verified allowed under both policies live. |
| **12** | **Bob** | **product with `price_public = true` and NO `pricelist_item` row** | **admitted** | **N2** — the predicate is looser than the shipped UI's own rule (`ProductCard.tsx:407`: `priceShown = … && p.price_per_gram != null`). No seed row occupies this corner; planted one and the insert returned `OK`. Benign — `toDraftLines.ts:8-11` documents the price-less send and `createDeal`'s `sumValueNet` handles it — and unreachable from the buyer UI. **Asserted so the gap is pinned, not discovered later.** |

**Mutation proofs — named cells, per conjunct** (N4). rev 1 asked for one blanket mutation,
which cannot tell *which* conjunct is load-bearing. This slug's own precedent is five named
`[MUT: …]` cells (`connection_visibility_override_test.sql:81-93`). Required:

| `[MUT: …]` | remove | must break |
|---|---|---|
| `drop-policy` | the whole restrictive policy | 3, 4, 5, 7 |
| `drop-price-arm` | `or p.price_public` | 1, 2, 8, **12**, and cell 11's setup insert (measured — rev 2 under-listed) |
| `drop-owner-arm` | `p.company_id = current_company_id()` | 6 |
| `add-using` | add a `USING` clause mirroring the check | **9** — the shape guard |

A suite that stays green with the mechanism removed is asserting nothing.

⚠️ Test 9 is the one that protects the *shape* decision. Without it, someone
"tightening" this policy by adding `USING` gets a green suite and a broken basket.

---

## 6. Client arm — 🔴 B2: `writes.ts` alone CANNOT surface anything

rev 1 said `addToBasket` should "surface a user-facing refusal". Measured, that is not
where the rejection escapes:

- `ProductCard.tsx:181` — `onAddToBasket?: (productId, qty, packIndex) => **void**`
- `ProductCard.tsx:852` — `onClick={() => onAddToBasket?.(p.id, qty, pack)}` — **the
  Promise is dropped at the DOM handler.**

So the unhandled rejection originates in the click handler, and no change confined to
`writes.ts` can reach it. rev 1 specified neither a Promise-returning signature nor a
render slot, and listed **no test** for this arm.

### 🔴 B1 (round 2) — THE FENCE READING WAS INCOMPLETE. ESCALATED TO MUSKAN.

rev 2 said the fence "forbids two things" and concluded **"Fence intact."** It read
ADR-0005 `:579-581` and **never opened STATE.md's `Locked` entry**, which is stricter:

> `STATE.md:114-118` — **G4 · T02's `ShopView` fence AMENDED** (2026-08-19, Muskan:
> *"amend"*): was *"no new state and no new branch"*; now **no new state, exactly one
> new branch**.
> `TICKETS.md:113-121` says the same.

**That one branch is already spent** — T02's header conditional is shipped at
`ShopView.tsx:677-696`. rev 2 proposed *"local `useState` for the message and an internal
render slot"*: **new state AND a second new branch.** Both halves of the Locked rule.

The ADR amendment rev 2 leaned on (`0005:790-796`) permits *"internal handlers"*, justified
as *"a private handler beside the existing `handleAddToBasket` costs nothing outside the
file"*. **A handler is not state, and not a render slot.** The catch is permitted; the
surfacing is not.

**This is Muskan's ruling, not a planner's** — the same shape T02, T04 and T09 each brought
to G4. It blocks the build, so it is asked before, not at, the gate. Options in `blocked.md`.

**Verified sound and NOT to be churned:** the catch genuinely does prevent the unhandled
rejection (`ProductCard.tsx:181` is `=> void`, `:852` drops the Promise; handling one frame
earlier resolves it); `ShopView`'s existing `error` state really is buyer-unreachable (renders
only at `:610` under `viewerCanManage && editing`); `ShopView` is the only `ProductCard`
consumer (`:702`) and `BuyerShopView.tsx:42` wraps it, so the buyer's add does route here.

### 🔴 B3 (round 2) — the test rev 2 promised CANNOT BE WRITTEN against this runner

rev 2 owed *"a component/unit test that a refused add **renders the refusal**"* and gated on
`unit > 458`. Measured: `vitest.config.ts:36` → `environment: "node"`; `grep -n
"testing-library\|jsdom\|happy-dom" package.json` → **no matches**. Components render via
`renderToStaticMarkup` only (`BasketDrawer.test.tsx:29` *"Initial paint only"*;
`ProductCard.panel.test.tsx:6` *"pure-node vitest env … no jsdom"*). There is **no `ShopView`
or `BuyerShopView` test in the tree at all.**

Static markup cannot click, cannot await an async handler, and cannot observe a state-driven
re-render. **L-018's trigger verbatim** — a gate that cannot be satisfied by the harness that
exists. **Replaced with tests this runner can actually run:**
- the `42501 → typed error` mapping in `writes.ts`, mocked client — precedent
  `basket/actions.test.ts:23`;
- the refusal **render** assertion, if wanted, needs **e2e or a jsdom dependency decision** —
  named as a decision, not smuggled in as a unit test.

⚠️ **Do not** hide the Add control as the enforcement — decision 3 is explicit that the
rule is server-side and the control is not the gate.

**Tests this arm owes** (rev 1 had none; `npx vitest run` is **458 pass / 0 fail**, so the
gate's `unit ≥ 458` was satisfiable by adding nothing — a bar that measures nothing):
a component/unit test that a refused add renders the refusal and leaves no basket line,
and that a successful add still refreshes.

## 7. Gate

`supabase db reset` clean · new suite PASSED + **all four mutation cells proved** ·
SQL suites: report **both numbers** (N9) — expect **39 runners over 44 suite files**, the
**5 runner-less suites unchanged**; never "all" · `tsc` 0 · eslint no new · unit **> 458**
(a refusal test must exist, so parity with 458 is a failure) · targeted e2e green ·
`security` S1–S8 · `critic`.

## 8. Recorded deviations and owed items

- 🔴 **ADR §7 CONTRADICTS ITSELF AND THE CODE BLOCK IS THE STALE HALF (round 2, note 7).**
  Heading `:584` reads *"one restrictive **INSERT** policy"* and the SQL block `:600` reads
  `as restrictive **for insert** to authenticated` — while `:615` states *"The policy is
  `FOR ALL`, not `FOR INSERT` — and that is rev 6 removing a mechanism"*. **A builder who
  copies the ADR's code block ships the ornamental policy rev 6 spent a round removing**
  (`UPDATE` is granted table-wide → insert a legal line, PATCH it onto a hidden product).
  Corrected in the ADR as part of this build; recorded here so the correction is not silent.
- **N6 — this migration splits from the ADR's plan.** ADR-0005's Consequences put the
  restrictive basket policy and the `anon` revoke **inside slice 3's single migration**.
  T06 shipped `20260822100000` without them, so a separate file is now the only option.
  The split is correct; it is recorded here rather than left to look like drift.
- **N5 — the ledger entry ships with this migration.** `docs/deploy/cloud-migrations-pending.md`
  currently ledgers `20260820090000` (T01) and `20260822100000` (T06) and is **missing
  `20260822090000` (T05) and `20260823090000` (T09)**, against its own instruction to
  *"push the slug as one batch, in timestamp order"*. **T08 owns closing that gap**, but
  `20260823100000` must not become the third omission — write its entry in this build.
- **N8 — the owner arm admits a soft-deleted own product.** `product_all`
  (`20260607170000_rls_policies.sql:331-333`) carries no `deleted_at` filter, and this plan
  adds none. Verified: as Alice, inserting a soft-deleted own AUR-1B returns `OK`. Buyers are
  unaffected (`product_public_select` carries `deleted_at is null`). **Pre-existing, not
  worsened, not fixed here** — stated because §1's *"owner arm: price rule N/A"* was the only
  thing rev 1 said about what that arm admits.
- **Fixture sweep (L-028), which rev 1 did not do.** The only live e2e clicking Add to basket
  is `e2e/present-card-edit.spec.ts:274`, driven as Alice on `/present` against AUR-1A —
  **owner arm, survives**. `e2e/present-basket.spec.ts` is three `test.fixme`s.

**Reviewers to spawn:** `critic` + `security` (migration · RLS · write path).
