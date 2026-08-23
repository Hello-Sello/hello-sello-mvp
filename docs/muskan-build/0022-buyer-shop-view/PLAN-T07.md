# PLAN — T07 · Server-enforced basket admission · rev 2

**Ticket:** `TICKETS.md` § T07 (HEL-61) · **AC 10** · depends on T06 (✅ G4 PASSED 2026-08-23)
**Base:** `claude/muskan/work` @ `fac1993` — 0 behind `origin/dev`, frozen for this build.

---

## 0. The hole, stated exactly

`product_basket_line` carries **one** policy (`20260707100000:27-31`):

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
| `src/app/present/ShopView.tsx` | `handleAddToBasket` catches it; internal state + internal render slot |

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
   Nothing signed-out touches it. The revoke breaks nothing.
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
| 6 | Alice (seller, owner) | AUR-1D (own, hidden, price-hidden) | **admitted** | owner arm — holds even with GreenLeaf `pending`, since `product_all` is not verification-gated |
| 7 | Bob | insert legal AUR-1B, then **UPDATE** `product_id` → AUR-1D | **REFUSED** | the `FOR ALL` half — an INSERT-only policy passes this test wrongly |
| 8 | Bob | **upsert** path (`on conflict do update`) | **admitted** | the ticket's explicit demand: exercise the statement `addToBasket` actually issues |
| 9 | Bob | line whose product went hidden → `SELECT` + `DELETE` | **both succeed** | pins the accepted consequence so a future `USING` clause fails loudly |
| 10 | `anon` | any | **permission denied** | grant arm |
| **11** | **Bob** | **`update pack_count` on a still-admissible line (AUR-1B)** | **ALLOWED** | 🔴 **B4** — the ADR assigns *"existing lines stay editable"* to a DB test and rev 1 had **no positive cell for the shipped drawer's plain updaters** (`writes.ts:41-60`). rev 1's round-1 B2 was precisely that they broke. Ten cells, every one an attack or a refusal — **L-011's class: the security invariants get remembered, the functional one gets dropped.** Verified allowed under both policies live. |
| **12** | **Bob** | **product with `price_public = true` and NO `pricelist_item` row** | **admitted** | **N2** — the predicate is looser than the shipped UI's own rule (`ProductCard.tsx:408-411`: `priceShown = … && p.price_per_gram != null`). No seed row occupies this corner; planted one and the insert returned `OK`. Benign — `toDraftLines.ts:8-11` documents the price-less send and `createDeal`'s `sumValueNet` handles it — and unreachable from the buyer UI. **Asserted so the gap is pinned, not discovered later.** |

**Mutation proofs — named cells, per conjunct** (N4). rev 1 asked for one blanket mutation,
which cannot tell *which* conjunct is load-bearing. This slug's own precedent is five named
`[MUT: …]` cells (`connection_visibility_override_test.sql:88-98`). Required:

| `[MUT: …]` | remove | must break |
|---|---|---|
| `drop-policy` | the whole restrictive policy | 3, 4, 5, 7 |
| `drop-price-arm` | `or p.price_public` | 1, 2, 8 |
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

### The fix stays inside the ADR fence — no amendment needed

The fence (`0005-buyer-shop-view.md:579-581`) forbids two things: a **fourth edit to a
shipped shared component** (the three card edits are the cap), and **`ShopView` gaining
new props**. It explicitly permits *"handlers internal to the file"*.

`handleAddToBasket` (`ShopView.tsx:574-580`) is `async` and already `await`s
`addToBasket`. Wrapping its body in `try/catch` means **the rejection never escapes to
the dropped Promise at all** — it is handled one frame earlier, inside the handler the
fence already allows. Add local `useState` for the message and an internal render slot.

**No `ProductCard` edit. No new `ShopView` prop. Fence intact.** Checked before choosing
this: `ShopView`'s existing `error` state renders only through `SaveBar`, which is gated
`viewerCanManage && editing` — **unreachable for a buyer**, so it cannot be reused. The
new slot is genuinely needed; it is simply not a fence crossing.

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
