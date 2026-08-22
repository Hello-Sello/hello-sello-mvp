# PLAN-T06 — The connection override, written once, applied at three sites

Ticket: **T06 · [HEL-60](https://linear.app/hellosello/issue/HEL-60)** · size **M** · depends on T00
ADR: `docs/adr/ADR-0005*` decision 6 + 7 · PRD §4 (2), §7 · slug `0022-buyer-shop-view`

> Rev 1. Base frozen at `claude/muskan/work` (0 behind `origin/dev`, 79 ahead) — no rebase mid-build.

---

## 0. What this ticket actually changes, in one paragraph

Today `product.profile_visible = false` means *nobody but the owner sees it*. After this ticket it
means **"visible to companies I am NOT connected to"** — an accepted company relationship overrides
the flag. Connection reveals **products, never prices**: `price_public` is untouched, so a connected
buyer still gets no price and no tiers on a price-hidden product. Three objects carry the rule; four
neighbouring policies deliberately do not. Two independent hardening items ride along because they
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
security definer
set search_path = ''
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

**Why `least`/`greatest` and not `in (a_id, b_id)`:** the table carries
`CHECK (company_a_id < company_b_id)` — verified live — so the pair is canonically ordered and the
two-column equality is exact and index-friendly. `in (…)` would also match a row pairing the caller
with *itself*, which cannot exist under that CHECK but is a shape worth not writing.

**This is precisely why the helper cannot supply T05's owner arm** (T05's ticket says so, and the
CHECK is the proof): a self-pair row `a < a` is impossible, so `is_connected_to_company(own company)`
is always false. The owner arm stays `p.company_id = public.current_company_id()`, separate.

**NULL safety.** `current_company_id()` is NULL for a companyless caller. `least(NULL, x)` is `x` in
Postgres (it ignores NULLs), so the two equalities would compare against a half-formed pair rather
than short-circuit. Guard explicitly:

```sql
  select public.current_company_id() is not null and exists ( … );
```

> ⚠️ **Write a test for exactly this cell.** A companyless caller must get `false`, not a row. This
> is the class of bug that reads correct and is not.

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

The view is re-created with `create or replace view`. Re-issue its grants explicitly — a replace
does not reset them, but the three-statement ritual is cheap and the one time it was skipped
(`20260618120100`) is how the anon door reopened.

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

**The unfiled clause added at item A must survive.** It is a separate `and (…)` and does not
interact with this one. Assert its behaviour still holds after this migration — the T05 SQL suite
already does, so **run it**, do not just re-read it.

### NOT touched, and why (criterion, round 4 B5)

`pricelist_item`, `product_image`, `product_media` and `pricelist_item_tier` policies do **not**
gain the override: they are not on the buyer's read path (the RPC and the view both bypass RLS), and
`plit_public_select`'s inlined gate is ADR-0004's deliberate defence-in-depth.

> ⚠️ **AMBIGUITY FOR THE CHECKER — flagged, not resolved unilaterally.** The ticket says
> *"`product_media` … policies are NOT touched"* and, four lines later, *"`product_media_public_select`
> shall no longer list `anon`"*. Read literally these contradict. **My reading:** the first sentence
> scopes the *override rule* (no policy there gains `is_connected_to_company`); the second is an
> independent S4 hardening item about the **role list**, not the predicate. I implement both: the
> predicate of `product_media_public_select` stays byte-identical, only `TO anon, authenticated`
> becomes `TO authenticated`. If the checker reads it the other way, the anon revoke moves to T08.

---

## 4. The `anon` revoke on `product_media` (S4)

T05's security review: *"`anon` is blocked from `product_media` only **incidentally** — it fails with
`permission denied for table product`, a privilege error inside the policy expression, not a policy
decision. Re-grant SELECT on `product` and it opens."*

That is a lock that holds because of an unrelated missing grant. Close it deliberately:

```sql
-- predicate byte-identical to live; ONLY the role list changes
drop policy if exists product_media_public_select on public.product_media;
create policy product_media_public_select on public.product_media
  for select to authenticated
  using ( exists (
    select 1 from public.product p
    where p.id = product_media.product_id
      and p.deleted_at is null
      and p.profile_visible = true
      and (p.visibility_start is null or p.visibility_start <= current_date)
      and (p.visibility_end   is null or p.visibility_end   >= current_date)
  ));

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

---

## 5. `docs/deploy/cloud-migrations-pending.md`

Ledger entry for this migration. **Shared file → sync ritual** (lock, commit sync alone, edit,
release). Flag in the entry that this migration **removes reads** from unverified companies — the
one class of change that can break a live user rather than merely add capability.

---

## 6. `getOwnCatalog` — the cross-lane leak this migration makes worse

`src/modules/deals/supabase/reads.ts:538-542` selects from `product` with **no `company_id` filter**,
relying on RLS. Its docstring (`:570-572`) claims the same discipline as `getProductBatches`. That
claim is **true for `product_batch`** (`batch_all` is the only policy, company-scoped) and **false
for `product`**, which carries `product_all` *and* `product_public_select`. So the seller's deal-line
product picker already lists every other company's `profile_visible` products.

**It is already live** — T00 shipped, so buyer-visible products exist. Widening site 1 adds every
connected seller's hidden products to that picker.

```ts
    .from("product")
    .select("id, name, cultivar, unit_code, pack_size_grams, thc_percent, cbd_percent, local_code_pzn")
    .eq("company_id", companyId)      // ← the filter it always intended
    .is("deleted_at", null)
```

`companyId` comes from the caller's own `person.company_id`, the same way the other reads in this
file resolve it — **not** from an argument (that would make it forgeable). Fix the wrong docstring
in the same pass; a comment asserting a false safety property is worse than no comment.

---

## 7. Files

| file | change |
|---|---|
| `supabase/migrations/<ts>_connection_visibility_override.sql` | new — helper, 3 sites, media role list, grants |
| `supabase/tests/connection_visibility_override_test.sql` | new — behavioural suite |
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
| **unverified** company member | any other company's product | **none** (the tightening) |
| companyless caller | anything | none, **and** `is_connected_to_company(x)` = false |
| the **owner**, own company unverified | own hidden product | **visible** (`product_all` untouched) |

Plus the grant assertions of §4, and a **re-run of the T05 suite** to prove the unfiled rule and the
owner arm survive site 3's rewrite.

Seed supports this directly — no fixture invention needed for the happy path:
GreenLeaf ↔ StonePharm is `active`, both `verified`; **AUR-1C and AUR-1D are GreenLeaf products with
`profile_visible = false`**; Bob is StonePharm. Rows for suspended / ended / soft-deleted / pending /
unverified are ephemeral fixtures inside `BEGIN … ROLLBACK`, mirroring
`discoverable_shop_spec_columns_test.sql`.

**Mutation-prove every new guard** (three at minimum): drop `is_caller_verified()` from site 1 · move
the window inside the override parenthesis · drop `p.price_public` from site 2. Each must fail a
named assertion. A guard that has never failed proves nothing.

---

## 9. Order of work

1. Pull `pg_get_functiondef('get_discoverable_shop')` live; diff base (S5).
2. Write the migration: helper → grants → site 1 → site 2 → site 3 → media role list → media revoke.
3. Write the suite + runner. **Verify RED** — the orchestrator runs it, `test-writer` has no Bash (L-023).
4. `supabase db reset`; suite GREEN.
5. Re-run `discoverable_shop_spec_columns_test.sql` + the full 38-suite set.
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
| `getOwnCatalog` unfixed | picker gains every connected seller's hidden products | in this ticket, tested |
| tightening breaks a live user | unverified members lose reads they have today | called out in the ledger entry; prod has 4 companies with products, 3 verified |
