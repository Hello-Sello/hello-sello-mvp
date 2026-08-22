# PLAN-T06 — The connection override, written once, applied at three sites

Ticket: **T06 · [HEL-60](https://linear.app/hellosello/issue/HEL-60)** · size **M** · depends on T00
ADR: `docs/architecture/adr/0005-buyer-shop-view.md` decision 6 + 7 · PRD §4 (2), §7 · slug `0022-buyer-shop-view`

> **Rev 3** — folds `plan-checker` round 2 (3 blocking, 7 non-blocking). **Budget SPENT, did NOT
> converge** — round 2's blocking findings were all NEW and two were defects in round 1's own
> fold-ins, the 5th ticket on this slug to do this. Rev 2 folded round 1 (7 blocking, 11 non-blocking; every blocking finding
> spot-verified against the live DB before acceptance). Base frozen at `claude/muskan/work` (0 behind `origin/dev`, 79 ahead) — no rebase mid-build.

---

## 0. What this ticket actually changes, in one paragraph

Today `product.profile_visible = false` means *nobody but the owner sees it*. After this ticket it
means **"visible to companies I am NOT connected to"** — an accepted company relationship overrides
the flag. Connection reveals **products, never prices**: `price_public` is untouched, so a connected
buyer still gets no price and no tiers on a price-hidden product. Three objects carry the rule; four
neighbouring policies do not gain it **textually — but three of them change BEHAVIOUR anyway, see §3a.** Two independent hardening items ride along because they
are in this migration's blast radius: a signed **verification tightening** on site 1, and an
**`anon` revoke** on `product_media` that T05's security review found is currently closed only by
accident.

---

## 1. Live-state evidence gathered BEFORE planning (S5 — never re-type from a migration)

| object | local | production | drift |
|---|---|---|---|
| `product_public_select` (`polqual`) | captured | captured | **byte-identical** |
| `product_all` | captured | captured | byte-identical |
| `product_media_public_select` | captured | captured | byte-identical |
| `product_media_all` | captured | captured | byte-identical |

Production column captured via the Supabase MCP `execute_sql` against project `byipusuthdlskdxoexkt`
(`select tablename, policyname, roles::text, qual from pg_policies where tablename in
('product','product_media')`) — noted because `plan-checker` has no production access and correctly
flagged it as unverifiable from its seat (N8).

Live `product_public_select` qual, verbatim — this is the base every edit below is a diff against:

```sql
((deleted_at IS NULL) AND (profile_visible = true)
 AND ((visibility_start IS NULL) OR (visibility_start <= CURRENT_DATE))
 AND ((visibility_end   IS NULL) OR (visibility_end   >= CURRENT_DATE)))
```

**Note what is NOT there: no `is_caller_verified()`.** Any member of any authenticated company —
verified or not — can read every `profile_visible` product row in the database today. That is the
hole the signed tightening closes, and it is why `getOwnCatalog` already leaks (§6).

Live `current_pricelist_item` public arm (`pg_get_viewdef`), verbatim:

```sql
pl.company_id = current_company_id()
OR p.deleted_at IS NULL AND p.profile_visible
   AND (p.visibility_start IS NULL OR p.visibility_start <= CURRENT_DATE)
   AND (p.visibility_end   IS NULL OR p.visibility_end   >= CURRENT_DATE)
   AND p.price_public AND is_caller_verified()
```

This arm **already** carries `is_caller_verified()`. Only `p.profile_visible` is relaxed here.

Live `get_discoverable_shop` — rewritten by T05 (`20260822090000`), currently carrying the owner arm
and the unfiled rule. Site 3 is its `p.profile_visible = true` term.

---

## 2. The helper — `is_connected_to_company(uuid)` is NEW

**It does not exist.** Verified: `public.is_connected_to_company(uuid) does not exist`.

`shares_connection_with_company(uuid)` **exists and must NOT be reused.** It is wrong for this
purpose in three separate ways, each of which would silently widen the override:

| what it does | why that breaks this ticket |
|---|---|
| ignores `r.status` entirely | a **suspended** or **ended** relationship would still reveal hidden products — criterion 1 forbids it |
| ignores `r.deleted_at` | a soft-deleted relationship would still reveal them |
| returns true for a **pending** `pending_inbox_item` | criterion "when a connection is pending, the buyer shall see only what the seller made visible" — this alone inverts the rule |

Its actual job is Discover chrome ("do we have any history with this company"), which is a
deliberately looser question. **Leave it alone.** Adding a status check to it would silently change
Discover's listing behaviour, which is a different ticket's contract.

```sql
create or replace function public.is_connected_to_company(p_company_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.relationship r
    where r.status = 'active'
      and r.deleted_at is null
      and r.company_a_id = least(public.current_company_id(), p_company_id)
      and r.company_b_id = greatest(public.current_company_id(), p_company_id)
  );
$$;
```

> ⚠️ **REV 2 — B1. Rev 1 wrote `security definer` and that was a silent reversal of a SIGNED
> decision, to the LARGER privilege.** `SECURITY INVOKER` is locked in two places:
> `STATE.md:112` (`## Locked`, G3) and `adr/0005-buyer-shop-view.md:282` — *"the deviation is
> SIGNED. INVOKER is the smaller privilege."* The ADR's own reasoning: `rel_all`
> (`20260607170000_rls_policies.sql:263-265`) already lets a company member read their own
> `relationship` rows under RLS, **so there is nothing for DEFINER to bypass**. The checker proved
> INVOKER works in the policy context (Bob sees 6 GreenLeaf products; companyless caller → false).
> DEFINER would also have created an S2 obligation ("should every logged-in user be able to call
> this?") that INVOKER does not create at all. **Removed.**

**Why `least`/`greatest` and not `in (a_id, b_id)`:** the table carries
`CHECK (company_a_id < company_b_id)` — verified live — so the pair is canonically ordered and the
two-column equality is exact and index-friendly.

**This is precisely why the helper cannot supply T05's owner arm** (T05's ticket says so, and the
CHECK is the proof): a self-pair row `a < a` is impossible, so `is_connected_to_company(own company)`
is always false. The owner arm stays `p.company_id = public.current_company_id()`, separate.

> ⚠️ **REV 2 — N1. Rev 1's explicit `current_company_id() is not null` guard is REMOVED.** The
> premise was right (`least(NULL, x)` really is `x` in Postgres — verified) but the conclusion was
> wrong. With a NULL caller the predicate collapses to `company_a_id = X and company_b_id = X`, and
> the canonical-order CHECK makes that **unsatisfiable** — so the unguarded function already returns
> `false` for a companyless caller *and* for a NULL argument (both verified live). The guard was
> inert, and §8 requires every new guard be mutation-provable; this one **cannot be made to fail**.
> Removing a mechanism beats keeping a comforting one. **The companyless test cell stays** — it now
> pins the CHECK's load-bearing role rather than a guard.

**Grants:** the three-statement ritual (session 76 rule — `REVOKE … FROM public` does **not** revoke
`anon`):

```sql
revoke all     on function public.is_connected_to_company(uuid) from public;
grant  execute on function public.is_connected_to_company(uuid) to authenticated;
revoke execute on function public.is_connected_to_company(uuid) from anon;
```

---

## 3. The three sites

### Site 1 — `product_public_select` (RLS, table `product`)

Two changes at once, both signed: the override **and** the verification tightening.

```sql
drop policy if exists product_public_select on public.product;
create policy product_public_select on public.product
  for select to authenticated
  using (
    deleted_at is null
    and (profile_visible = true or public.is_connected_to_company(company_id))
    and (visibility_start is null or visibility_start <= current_date)
    and (visibility_end   is null or visibility_end   >= current_date)
    and public.is_caller_verified()
  );
```

Diff against the live base in §1, term by term:
- `profile_visible = true` → `(profile_visible = true or is_connected_to_company(company_id))` — **the override**
- `+ and public.is_caller_verified()` — **the tightening** (new; absent live)
- `deleted_at`, both window terms — **byte-identical, deliberately re-stated in the same order**

**The window stays OUTSIDE the override parenthesis.** Criterion: *"when a product's visibility
window has expired, connection shall not override it."* Putting the `or` around the whole predicate
would break that and every test would still pass on non-expiring seed data. This is the single most
likely way to get this policy wrong.

**`product_all` is NOT touched** — the owner policy is not verification-gated, which is what makes
the criterion *"a seller reads their own catalogue even if their own company is not yet verified"*
hold for free. Assert it anyway; it is an invariant this migration could break by accident.

### Site 2 — the `current_pricelist_item` public arm (view)

```sql
  ... or (p.deleted_at is null
          and (p.profile_visible or public.is_connected_to_company(p.company_id))
          and (p.visibility_start is null or p.visibility_start <= current_date)
          and (p.visibility_end   is null or p.visibility_end   >= current_date)
          and p.price_public
          and public.is_caller_verified())
```

**`p.price_public` stays, un-`or`-ed.** That single term is the whole of decision 7 — connection
reveals the product, never the price. A connected buyer on a price-hidden product gets **no row**
from this view, hence no price and no tiers.

> ⚠️ **REV 2 — B2. The view MUST be re-created `with (security_barrier = true)`.** Live state:
> `current_pricelist_item` carries `reloptions={security_barrier=true}` (verified). **`CREATE OR
> REPLACE VIEW` without a `WITH` clause silently DROPS it** — the checker reproduced this on a
> throwaway view: `{security_barrier=true}` → `NONE`. This is the S5 failure family one level
> deeper than rev 1 looked: the guard is **not in the body**, so a body-to-body predicate diff comes
> back clean while the barrier is gone. Without it the planner may push a user-supplied leaky
> function below the view's `WHERE` — i.e. below `is_caller_verified()` and `price_public`.
>
> ```sql
> create or replace view public.current_pricelist_item
>   with (security_barrier = true) as …
> ```
>
> **Assert it:** `reloptions @> '{security_barrier=true}'` in the suite. A predicate assertion
> cannot see this, which is exactly why it needs its own.

> ⚠️ **REV 3 — B-2. Site 2 was the ONLY site with no S5 instruction.** Site 1 got a `polqual` diff,
> site 3 got an emphatic `pg_get_functiondef` diff — site 2 got neither, and the plan never
> reproduces the full view body (§1 quotes only the public arm). The builder would re-type ~20 lines
> (`DISTINCT ON`, the `tiers` sub-select, three joins, the owner arm,
> `ORDER BY pl.published_at DESC NULLS LAST`) from nothing. **Do the same thing site 3 does:**
> `pg_get_viewdef('public.current_pricelist_item', true)` from the live DB, diff the new body
> against it, change only the `p.profile_visible` term.
>
> Two silent regressions this closes, both measured, both passing every rev-2 cell:
> - drop `is_caller_verified()` from **site 2** → unverified reads 3 prices, **companyless reads 2**,
>   while doors (a) and (c) stay at 0. Every cascade cell is worded about ***`product`* rows**, so
>   none of them look. This is the gate Discover lost once.
> - drop the `pl.company_id = current_company_id()` **owner arm** → Alice loses 4 of her 6 own
>   prices. **No rev-2 cell reads the view as the owner at all.**

Re-issue its grants explicitly — a replace does not reset them, but the ritual is cheap and the one
time it was skipped (`20260618120100`) is how the anon door reopened.

### Site 3 — `get_discoverable_shop`'s `profile_visible` term

T05 currently has:

```sql
and (p.profile_visible = true or p.company_id = public.current_company_id())
```

becomes

```sql
and (p.profile_visible = true
     or p.company_id = public.current_company_id()
     or public.is_connected_to_company(p.company_id))
```

**Three arms, three different questions** — public / owner / connected. Do not collapse them.

**⚠️ S5, and this one is sharp:** the function was rewritten **twice today** (T05 build, then the
G4 item-A amendment). Pull `pg_get_functiondef` from the live DB immediately before writing this
migration and diff the new body against it — this is the class that shipped a lost verified-gate to
production once, and the risk is highest when the base changed hours ago.

**Use `CREATE OR REPLACE FUNCTION`, never `DROP … CREATE`** (N11). Grants survive a replace and the
signature is unchanged; ADR:488 records that a drop resets them.

> 🔴 **REV 3 — B-1. THE T05 SUITE WILL GO RED, AND THAT IS CORRECT.** Rev 2 said *"the T05 SQL
> suite already asserts this, so run it"*. **False, and the framing is the hazard.**
> `discoverable_shop_spec_columns_test.sql:417-425` (TEST7) uses **Bob / StonePharm** as *"a plain
> verified NON-OWNER caller"* and asserts he sees **0** hidden GreenLeaf products. But
> **StonePharm has an ACTIVE relationship with GreenLeaf** (verified live) — so under T06 Bob is a
> *connected* buyer and **must** see it. T05 pins the exact invariant T06 is chartered to break.
>
> Verified by the checker running all 41 suites with the migration injected:
> `*** BREAKS UNDER T06: discoverable_shop_spec_columns_test.sql — LEAK/TEST7`.
>
> **Why this had to be said out loud:** a builder who hits a red security test with a plan claiming
> it should be green has two natural moves — revert site 3, or quietly weaken TEST7. Both are wrong.
> **The fix:** repoint TEST7's negative arm at a verified persona with **no** relationship to
> GreenLeaf (`Bavaria Medical Cannabis GmbH` or `NordCanna Distribution GmbH`), resolved **by
> company name, never by UUID** — those persons' ids regenerate on every `db reset` (the suite's own
> stated convention; the checker got caught by exactly this mid-review). Guard the new persona as
> company'd + verified + **unconnected** + sees a non-zero shop, so the pass cannot be vacuous.
> Proven green that way. **`supabase/tests/discoverable_shop_spec_columns_test.sql` is added to §7.**

**The unfiled clause added at item A must survive.** It is a separate `and (…)` and does not
interact with this one. Assert its behaviour still holds after this migration — the T05 SQL suite
already does, so **run it**, do not just re-read it.

### 3a. NOT touched textually — but the tightening CASCADES (REV 2, B4)

`pricelist_item`, `product_image`, `product_media` and `pricelist_item_tier` policies do **not**
gain the override: they are not on the buyer's read path (the RPC and the view both bypass RLS), and
`plit_public_select`'s inlined gate is ADR-0004's deliberate defence-in-depth.

> ⚠️ **REV 2 — B4. Rev 1 said these four are simply "untouched". That was FALSE about behaviour.**
> All four nest `EXISTS (SELECT 1 FROM product p WHERE …)` — verified live:
> `pricelist_item_public_select`, `plit_public_select`, `product_image_public_select`,
> `product_media_public_select`. **A policy subquery is RLS-filtered as the CALLING role**, so
> adding `is_caller_verified()` to site 1 propagates into all four with no edit to them.
>
> Checker's measurement, StonePharm set to `pending`:
> ```
> before: product=4  product_media=1  product_image=1  pricelist_item=2
> after : product=0  product_media=0  product_image=0  pricelist_item=0
> ```
>
> **The converse is safe, and was measured too** — the *override* does NOT propagate, because each
> nested predicate restates `p.profile_visible = true` itself:
> ```
> verified + connected: product = 6 (was 4)   product_media = 1  (NOT 2)
> ```
>
> **Second class rev 1 never named: a COMPANYLESS authenticated caller loses reads.**
> `current_company_id()` is NULL → `is_caller_verified()` is false → 0 rows, where today they read
> 4. (Measured: `companyless HS Reviewer reads product = 4` today.)
>
> 🔴 **REV 3 — B-3. `product_media` and `product_image` are EMPTY REPO-WIDE** (`0` rows each,
> verified). So the numbers above reproduce **only against planted fixtures**, and rev 2's cascade
> cells are **0-before / 0-after — they pass with the migration unbuilt.** That is the same vacuity
> family rev 2 introduced B3 to kill, reintroduced one section earlier. **The cascade cells MUST
> plant `product_media` + `product_image` rows**; §8's *"seed supports this directly, no fixture
> invention needed"* is true for the `product` and `pricelist_item` arms only.
>
> **Consequences taken:** §5's ledger entry names **both** classes explicitly, and §8 gains three
> cascade cells. This is the difference between "adds capability" and "removes reads from live
> users", and only the second kind can break someone on deploy.

## 4. The `anon` revoke on `product_media` (S4)

T05's security review: *"`anon` is blocked from `product_media` only **incidentally** — it fails with
`permission denied for table product`, a privilege error inside the policy expression, not a policy
decision. Re-grant SELECT on `product` and it opens."*

That is a lock that holds because of an unrelated missing grant. Close it deliberately:

```sql
-- ONLY the role list changes. ALTER POLICY makes "predicate byte-identical"
-- true BY CONSTRUCTION rather than by inspection — a drop+create would re-type
-- the predicate, which is the exact S5 family, for no gain (N4).
alter policy product_media_public_select on public.product_media to authenticated;

revoke select on public.product_media from anon;
```

**Test the mechanism, not the symptom.** The current block already *looks* like a pass — `anon` gets
an error either way. The assertion must distinguish *"denied by policy/grant"* from *"denied because
a table inside the predicate is unreadable"*. Assert the **grant** directly:

```sql
has_table_privilege('anon', 'public.product_media', 'SELECT') = false
```

…and assert `anon` is absent from `pg_policies.roles` for that policy. A behavioural `select` alone
cannot tell the two failures apart, which is exactly how this was miscounted as closed.

**Stated rather than left unremarked (N5), since this whole section is "incidental vs deliberate":**
`anon` also holds INSERT/UPDATE/DELETE/TRUNCATE on `product_media`, `product` and `product_image`.
Those are blocked by RLS with **no policy naming `anon`** — that is a real policy decision, not an
accident, so they are left alone. Only the SELECT grant is the accidental one.

---

## 5. `docs/deploy/cloud-migrations-pending.md`

Ledger entry for this migration. **Shared file → sync ritual** (lock, commit sync alone, edit,
release).

The entry must name **both** read-removing classes explicitly (B4), because this is the one kind of
change that can break a live user rather than merely add capability:
1. members of an **unverified** company lose cross-company reads of `product` **and**, via the
   cascade, `product_image` / `product_media` / `pricelist_item`;
2. **companyless** authenticated callers lose them too (`current_company_id()` NULL).

Production check to run before shipping, not now: 4 companies hold products, 3 verified, 1 pending
(`CNG Berlin`). Name in the entry who actually loses a read.

---

## 6. `getOwnCatalog` — the cross-lane leak this migration makes worse

`src/modules/deals/supabase/reads.ts:538-542` selects from `product` with **no `company_id` filter**,
relying on RLS. `product` carries `product_all` *and* `product_public_select`, so the seller's
deal-line product picker already lists every other company's `profile_visible` products.

> ⚠️ **REV 2 — B5. Rev 1 pointed at the wrong docstring.** `:570-572` is inside
> **`getProductBatches`'s** docstring (and its claim is *correct* there — `batch_all` is the only
> policy on `product_batch`, company-scoped). `getOwnCatalog`'s own docstring is **`:524-534`**, and
> it already describes the leak accurately: *"the picker currently returns EVERY company's visible
> products (known issue, Ayush's lane — **flagged, not fixed here**)"*. **This ticket fixes it, so
> that sentence becomes false and must be rewritten** — rev 1 aimed its own "a comment asserting a
> false safety property is worse than no comment" rule at the wrong lines.

**It is already live** — T00 shipped, so buyer-visible products exist. Widening site 1 adds every
connected seller's hidden products to that picker.

```ts
    .from("product")
    .select("id, name, cultivar, unit_code, pack_size_grams, thc_percent, cbd_percent, local_code_pzn")
    .eq("company_id", companyId)      // ← the filter it always intended
    .is("deleted_at", null)
```

`companyId` comes from the caller's own `person.company_id`, the same way the other reads in this
file resolve it — **not** from an argument (that would make it forgeable). **Include the null-company
guard its five sibling reads all use** (N-7): `if (!viewerCompanyId) return [];` —
`.eq("company_id", null)` is not "no rows". Fix the wrong docstring
in the same pass; a comment asserting a false safety property is worse than no comment.

---

## 7. Files

| file | change |
|---|---|
| `supabase/migrations/<ts>_connection_visibility_override.sql` | new — helper, 3 sites, media role list, grants |
| `supabase/tests/connection_visibility_override_test.sql` | new — behavioural suite |
| `supabase/tests/discoverable_shop_spec_columns_test.sql` | **edit — TEST7's negative arm (B-1). Expected to go RED under this migration; that is correct, not a regression** |
| `supabase/tests/run_connection_visibility_override_test.sh` | new — runner (stdin, **not** host-path `-f` — L-013/T01) |
| `src/modules/deals/supabase/reads.ts` | `getOwnCatalog` company filter + docstring correction |
| `src/types/database.types.ts` | regenerate for the new function |
| `docs/deploy/cloud-migrations-pending.md` | ledger entry (**shared — sync ritual**) |

> ⚠️ **`database.types.ts` is NOT reproducible from `supabase gen types`** (T01, 2026-08-20): an
> undocumented hand-edit gives `update_deal_draft`'s four `Args` a `| null` the generator does not
> emit. After regenerating: `git diff -U0 src/types/database.types.ts` and confirm the only hunks
> are this ticket's. Any other hunk is pre-existing drift to surface, not a ride-along.

**Declared now, per item F's ruling** — if the build needs a file outside this table, it is recorded
as an inline `⚠️ AMENDED` block in `TICKETS.md` at the moment it happens, not at G4.

---

## 8. Tests — behaviour, not substrings (round 4, B3)

A substring check on `polqual` is unsatisfiable now (the predicate is a function call) and could
never have detected a missing window term anyway.

**Three doors × the matrix.** For each of: (a) a direct `product` read, (b) a `current_pricelist_item`
read, (c) a `get_discoverable_shop` call:

| caller | seller's product | expected |
|---|---|---|
| connected + verified buyer | `profile_visible = false` | **visible** (AC 5) |
| connected + verified buyer | hidden, `price_public = false` | product visible, **no price, no tiers** (AC 6) |
| connected + verified buyer | hidden, **window expired** | **not** visible |
| **pending** connection, verified | hidden | not visible |
| relationship `status <> 'active'` | hidden | not visible |
| relationship soft-deleted | hidden | not visible |
| unconnected verified buyer | hidden | not visible |
| connected + verified buyer | **hidden, `price_public = true`** (AUR-1C) | doors b+c: **price = 4.00 AND `tiers = '[]'::jsonb`** — **B3**. ⚠️ N-1: AUR-1C has **0 rungs** (`seed_visibility_matrix_test.sql:148` pins it), so "tiers present" is unsatisfiable; assert the empty array, or plant a rung |
| **unverified** company member | any other company's product | **none** (the tightening) |
| unverified member | cross-company `product_image` / `product_media` / `pricelist_item` | **none** — the cascade, **B4** |
| **companyless** authenticated caller | any other company's product | **none** — reads 4 today, **B4** |
| unverified **and** companyless callers | **`current_pricelist_item` rows** (door b) | **0** — **B-2**; the cascade cells all say *product*, so nothing else looks here |
| **Alice (owner)** | **`current_pricelist_item`**, her own catalogue | **all 6**, price-hidden ones included — **B-2**; no rev-2 cell read the view as owner |
| companyless caller | anything | none, **and** `is_connected_to_company(x)` = false (pins the canonical-order CHECK — N1) |
| **Alice (GreenLeaf = `company_a`)** | `is_connected_to_company(StonePharm)` | **true** — the direction cell, **B7** |
| the **owner**, own company unverified | own hidden product | **visible** (`product_all` untouched) |

> ⚠️ **REV 2 — B3, the cell that would have hidden a real bug.** The checker widened site 3 ONLY,
> left site 2 untouched, and ran the whole rev-1 matrix as Bob (connected, verified). **Every single
> cell passed** — including *"connected, hidden + price hidden → no price"*, which passed
> **vacuously**. Measured:
> ```
> AUR-1C pv=false price_public=true  price=NULL tiers=NULL   ← the bug, invisible to rev 1
> ```
> A build that forgot site 2 **entirely** would have gone fully green. This is the ADR's own named
> failure mode (`0005-buyer-shop-view.md:399-405`: *"patching 7 without 6 yields a visible product
> with a silently NULL price"*). Seed already carries the fixture — **AUR-1C is `profile_visible =
> false`, `price_public = true`** — so no invention needed.

> ⚠️ **REV 2 — B6. The new function needs its own S1 grant assertion**, which rev 1 omitted
> (§4's grant assertions are *table* grants on `product_media`). SECURITY-CHECKLIST S1 makes it
> mandatory for any change adding a function or a grant:
> `has_function_privilege('anon','public.is_connected_to_company(uuid)','EXECUTE') = false`
> **and** `= true` for `authenticated`. Note the `revoke_anon_execute_on_new_function_trg` event
> trigger is enabled and will fire — assert the end state anyway; the trigger is what we are
> trusting, and S7 says a guard nobody has watched fail proves nothing.

> ⚠️ **REV 2 — N3. "pending" is NOT a relationship status.** Live `relationship_status` is exactly
> `active | suspended | ended`. Rev 1 lumped pending in with the ephemeral *relationship* fixtures;
> a pending connection is a **`pending_inbox_item` row with NO `relationship` row at all**. Written
> as a relationship fixture it would fail on the FK — loudly, so not blocking, but the builder must
> write the right shape.

Plus the grant assertions of §4, and a **re-run of the T05 suite** to prove the unfiled rule and the
owner arm survive site 3's rewrite.

⚠️ **Which door each cell applies to (N-3).** "Three doors × the matrix" is not a well-formed grid:
the AC-6 cell (*no price, no tiers*) is meaningless on door (a) — `product` has no price column.
Tag every cell with its doors; do not run the grid blind.

⚠️ **The media/image cascade cells need PLANTED rows (B-3)** — `product_media` and `product_image`
are empty repo-wide, so those two cells are vacuous against the seed. `pricelist_item` and `product`
are seeded and need nothing.

Seed supports the rest directly — no fixture invention needed for the happy path:
GreenLeaf ↔ StonePharm is `active`, both `verified`; **AUR-1C and AUR-1D are GreenLeaf products with
`profile_visible = false`**; Bob is StonePharm. Rows for suspended / ended / soft-deleted / pending /
unverified are ephemeral fixtures inside `BEGIN … ROLLBACK`, mirroring
`discoverable_shop_spec_columns_test.sql`.

**Mutation-prove every new guard — and name the DOOR each mutation goes red on (N-2).** Minimum five:

| mutation | goes red on |
|---|---|
| drop `is_caller_verified()` from **site 1** | doors a + c |
| drop `is_caller_verified()` from **site 2** | door b only — **added at rev 3 (B-2)** |
| drop the **owner arm** from site 2 | door b, owner cell — **added at rev 3 (B-2)** |
| move the **window** inside the override parenthesis | doors a + c (`cell_expired_*|VISIBLE`) |
| drop `p.price_public` from **site 2** | ⚠️ **door b ONLY** — the RPC's `case when p.price_public then v.price_per_gram end` **masks** the view's leak on door c (measured: `doorB|5.0000`, `doorC|NULL`). Asserting this on door c would pass against a broken build |

A guard that has never failed proves nothing — and a mutation asserted on the wrong door is a guard
that cannot fail.

---

## 9. Order of work

1. Pull `pg_get_functiondef('get_discoverable_shop')` live; diff base (S5).
2. Write the migration: helper → grants → site 1 → site 2 → site 3 → media role list → media revoke.
3. Write the suite + runner. **Verify RED** — the orchestrator runs it, `test-writer` has no Bash (L-023).
4. `supabase db reset`; suite GREEN.
5. Re-run `discoverable_shop_spec_columns_test.sql`, then **every runner**, reporting the real
   census — **41 suite files, 36 runners** (N7). **Five** suites have no runner and never execute:
   `rls_isolation_test` (already filed as DEV-161), `announcement_projection_test`,
   `change_reason_log_test`, `onboard_company_categories_test`, `pending_change_lock_test`.
   ⚠️ **Rev 2 said six and named `auth_gate_test` — wrong (N-4):** its runner exists as
   `run_auth_gate_test.sql.sh`, which matches `run_*.sh`, so it does execute. 41 − 36 = 5. **Rev 1 said "the full 38-suite
   set", which does not exist** — and earlier gate claims on this slug reporting "38/38 SQL suites"
   counted *runners that ran*, not suites that exist. Report both numbers; do not say "all".
   ⚠️ Count with `python3 -c "import glob; …"`, **not** `ls | wc -l` — the shell filter here returns
   unstable counts for that idiom (same family as L-024).
6. `getOwnCatalog` filter + docstring; regenerate types with the `git diff -U0` check.
7. Mutation pass (§8).
8. `tsc` · eslint · unit · e2e `discover-shop` + `present-*`.
9. Reviewers: **`critic` + `security`** (migration · RLS · RPC · cross-company reads).

## 10. Risks, named

| risk | why it bites | mitigation |
|---|---|---|
| window folded inside the override | tests pass on non-expiring seed | explicit expired-window fixture + mutation |
| site 3 re-declared from a stale base | it changed twice today | `pg_get_functiondef` diff immediately before writing |
| `least/greatest` with a NULL company | `least(NULL,x) = x` — no short-circuit | explicit `is not null` guard + its own test |
| media revoke "already passing" | current block is an incidental privilege error | assert the **grant**, not a failed select |
| **performance cliff (N-6)** | the helper is **not inlined** — it appears literally in the `Filter:` — so it runs per row and `idx_product_company_profile_visible` is lost to a Seq Scan. Measured on 20 000 rows: **1.7 ms → 1327 ms**. Removing `SET search_path` does **not** restore inlining. No cheap fix; prod holds 13 products today, so this is a scaling cliff, not a live problem. **Named for G4, not solved here.** |
| **read-ADDING side unanalysed (N-5)** | site 1 hands a connected buyer the seller's **private columns** on hidden products via a direct `product` read — proven: `AUR-1C metadata={"note": "PRIVATE-SELLER-NOTE", …} rrp=9.9900`. In tension with the G3 lock on `supplier_product_code` and with the ADR's reason for projecting `metadata -> 'pack_sizes'` only. Pre-existing for *visible* products; T06 widens it to deliberately-hidden ones. **Escalate at G4 — this is a scope question, not a build decision.** |
| `getOwnCatalog` unfixed | picker gains every connected seller's hidden products | in this ticket, tested |
| tightening breaks a live user | unverified **and companyless** callers lose reads, and it **cascades** to media/images/prices | both classes in the ledger entry; 3 cascade cells in §8 |
| `create or replace view` drops `security_barrier` | invisible to a predicate diff — the guard is a reloption, not a term | `with (security_barrier = true)` + a `reloptions` assertion |
| site 2 forgotten entirely | rev 1's whole matrix went green with site 2 unbuilt — measured | the B3 cell (`pv=false` + `price_public=true` → price **and** tiers) |
| helper written without `least`/`greatest` | seed only exercises one direction | the B7 direction cell (Alice → StonePharm) |
