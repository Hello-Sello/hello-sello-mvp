# PLAN — T01 · `get_discoverable_company` gains the shop chrome

**Ticket:** [HEL-55](https://linear.app/hellosello/issue/HEL-55) · **M** · depends on T00 ✅
**Rev:** 3 — `plan-checker` rounds 1 **and 2** folded in (4 + 4 blocking, all accepted).
**⚠️ The 2-round budget is SPENT and the loop did NOT converge** — round 2's four blocking were
all NEW, and two were defects *introduced by rev 2's own fixes*. Same non-convergence as T00 and
ADR-0005. `critic` + `security` carry rev 3's edits at build; a 3rd round is Muskan's call.

## The base — established before writing anything

`get_discoverable_company`'s live body was dumped from the running DB and diffed against
`supabase/migrations/20260617090000_sec01_caller_verified_discover_gate.sql:112-184`:
**identical** (normalised for whitespace/case). No later migration redefines it — the one
mention in `20260617150000` is a comment. **That file's body is the base**; the new body is
that text plus projections, never a re-type from memory.

**Invariants that MUST survive the re-create** (this is the class that silently dropped
`list_discoverable_companies`'s verified gate — see the seed of L-00x / the 2026-08-16 ledger):

| # | invariant | where |
|---|---|---|
| I1 | `and public.is_caller_verified()` | WHERE clause |
| I2 | `and c.verification_status = 'verified'` | WHERE clause |
| I3 | `and c.deleted_at is null` | WHERE clause |
| I4 | `SECURITY DEFINER` · `STABLE` · `LANGUAGE sql` · `SET search_path TO ''` | header |
| I5 | `cta.deleted_at is null` on the type-assignment join | FROM |
| I6 | all four `connection_state` arms + `pricing_requested`, unchanged | SELECT |
| I7 | grants end as `postgres=X, authenticated=X, service_role=X` — no PUBLIC, no anon | ACL |
| **I8** | **`and c.id = p_company_id`** — the primary filter (round 2 B3) | WHERE |
| **I9** | **`left join`**, not `join`, on `company_type_assignment` (round 2 B4) | FROM |
| **I10** | **`coalesce(array_agg(distinct …) filter (where … is not null), '{}')`** (round 2 B4) | SELECT |
| **I11** | the parameter is named **`p_company_id`** — PostgREST's contract (`companies.ts:102`) | signature |

**Why I8–I11 were missing, and why that mattered.** Rev 2's table covered the three *security*
predicates and stopped. I8 is the **primary** filter: lose it and a `SECURITY DEFINER` function
grouped on `c.id` returns *every verified company, one row each*, to any verified caller — and
step 2's "grep I1–I7 individually" would have passed, as would `cross_tenant_lockdown_test.sql:111`
(which asserts row-count for an **unverified** caller only). I9's LEFT-ness is load-bearing: an
inner join returns **zero rows** for a company with no type assignment. I10 was tolerable in rev 1
and is not now — **deviation 1 promoted that expression to the source of `Shop.company.tags`**;
drop the `filter` and a company with no assignments yields `{NULL}`, drop the `coalesce` and it
yields NULL, both rendering a stray `#` chip. The deviation that removed a column added an
invariant, and the table didn't move.

Live ACL today is exactly I7. Verified by `pg_proc.proacl`.

## ⚠️ DROP is forced — and why the ritual still ships (corrected, N1)

Adding columns to a `RETURNS TABLE` changes the return type, and Postgres refuses
`create or replace` across a return-type change. So the migration must
`drop function if exists public.get_discoverable_company(uuid);` first — which **discards the
ACL**.

**Rev 1 claimed that without the ritual the function reverts to PUBLIC-executable and `anon`
regains it. That is stale.** Since `20260817120000_anon_execute_lockdown.sql`,
`ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM anon` (`:8-9`) plus the
`revoke_anon_execute_on_new_function` event trigger firing `REVOKE EXECUTE … FROM PUBLIC, anon`
at `ddl_command_end` (`:46,:57`) mean a freshly created function is **born** at
`postgres=X, authenticated=X, service_role=X` — I7 — ritual or no ritual.

Two consequences the builder must not miss:
- **The ritual still ships** — it is criterion 3 and the repo rule (`20260817120000:161`). It
  costs nothing and states the intent locally instead of relying on a trigger three months away
  in the log.
- **A `proacl` grep therefore proves I7, NOT criterion 3.** Criterion 3 is verified by grepping
  the *migration file* for all three statements. Rev 1 conflated them.

**Three caveats round 2 added to this (d):** the `ALTER DEFAULT PRIVILEGES` supplying
`authenticated`/`service_role` is scoped `FOR ROLE postgres` (`:167`), so the "born correct" claim
holds only where the migration runs as `postgres`; step 2's `proacl` check is **local only** —
**production's ACL is a separate environment and must be re-verified at `/ship`**; and the
`service_role` citation `20260617094400_verif_revoke_anon.sql:7` is a **comment** describing
Supabase defaults, not a `GRANT` — the claim is true, the citation is not a source.

## Deviation 1 — `tags` is NOT added as a column (criterion 1 narrowed)

The criterion lists `tags` among the new columns. **It already ships as `type_codes`**:
`array_agg(distinct cta.company_type_code)` — the identical source the seller's shop reads
(`shop.ts:276`, `company_type_assignment.company_type_code`). Adding `tags` would put one fact
in two columns, and the mapper needs both shapes anyway — raw codes for `ShopView`'s tag chips
and `categoryLabel`-mapped strings for the existing `categories` field, both derivable from
`type_codes`.

**Decision: reuse `type_codes`, add no `tags` column.** The ticket's intent — "the mapper can
supply `Shop.company.tags`" — is met. Recorded here for G4; `plan-checker` may overrule.

## Deviation 2 — `shop.ts` gains one word, outside T01's declared file list

`parseLinks` (`shop.ts:131`) is module-private, but criterion 4 mandates the buyer mapper reuse
it *"so buyer and seller parse identical data identically."* Duplicating it into `companies.ts`
would satisfy the file list and violate the criterion — two parsers, one fact, drifting apart
the first time a link shape changes.

**Decision: add `export` to `shop.ts:131`.** One keyword, no behaviour change. `shop.ts` is
already in this slug's diff (T03 touched its header and `profile_visible`), so it is not a new
file to the slug. Note `manage.ts:62` has a **different** `parseLinks` that parses `FormData` —
same name, different job. The one to export is `shop.ts`'s.

## The metadata leak rule (criterion 2)

The RPC returns **two named jsonb columns**, never `c.metadata`:
`c.metadata -> 'links'` and `c.metadata -> 'locations'`. The mapper re-wraps them for the
existing helper signatures: `parseLinks({ links: r.links })`,
`deriveInitialLocations({ locations: r.locations }, r.warehouse_location)`. No helper changes
shape; the wrap is one expression each and keeps the leak rule enforced **in SQL**, where a
future column addition cannot quietly widen it.

## Files

| file | change |
|---|---|
| `supabase/migrations/20260820090000_discoverable_company_shop_chrome.sql` | new — DROP + CREATE from the verified base + the 3-statement grant ritual |
| `src/app/discover/companies.ts` | `ProfileRow` + `DiscoverCompanyProfile` gain the new fields; company mapper only |
| `src/types/database.types.ts` | regenerated |
| `src/modules/catalog/shop.ts` | **deviation 2** — `function parseLinks` → `export function parseLinks` (one keyword) |
| `src/app/discover/companies.test.ts` | new — the mapper unit spec (test-writer) |
| `supabase/tests/discoverable_company_chrome_test.sql` + `run_…sh` | new — the NEW projections only (B3: no restating the lockdown suite) |

**Not touched:** the product mapper (T02 owns it), `getDiscoverableShop` (T05), `ShopView`,
any policy, any other RPC.

## Steps, in runnable order

1. **Write the migration.** Copy `20260617090000:112-183` verbatim as the body, then append
   **five** projections (B4 — rev 1 said "six" and listed five; deviation 1 removed the sixth)
   to both the `RETURNS TABLE` list and the `select`, in this order and with these declared
   types, appended **after** `pricing_requested` so no existing column's position moves:

   | # | `RETURNS TABLE` | `select` expression |
   |---|---|---|
   | 12 | `address text` | `c.address::text` |
   | 13 | `warehouse_location text` | `c.warehouse_location::text` |
   | 14 | `updated_at timestamptz` | `c.updated_at` |
   | 15 | `links jsonb` | `c.metadata -> 'links'` |
   | 16 | `locations jsonb` | `c.metadata -> 'locations'` |

   **Leave the `group by` exactly as it is (N3).** `company.id` is the PRIMARY KEY
   (`20260607090002_phase1_core.sql:38`) and is already grouped (`20260617090000:`**`182`** —
   rev 2 cited `:183`, which is `$$;`), so Postgres's functional-dependency rule permits every
   other `c.*` column to project ungrouped, including `c.metadata -> 'links'`; the
   `left join … array_agg` doesn't affect it, since the dependency is per-table on `company`.
   **Rev 2's stated reason was wrong** (round 2 (c)): in a `LANGUAGE sql` body a column name takes
   precedence over an identically-named OUT parameter — it does **not** raise "ambiguous" (that is
   plpgsql). The base body proves it: `where c.id = p_company_id` and `group by c.id, c.name` sit
   under OUT params named `id` and `name` and work today. Stay `c.`-qualified anyway; the
   justification is functional dependency alone.

   Prepend the `drop function if exists`. Append the three grant statements. **`service_role`
   is not granted by any of them (N2)** — it is reconstituted by Supabase's default
   `GRANT … ON FUNCTIONS TO service_role` (`20260617094400_verif_revoke_anon.sql:7`), and the
   identical drop+create precedent is `20260814120000:298` for `get_discoverable_shop`. If step
   2 finds `service_role` absent, that is a finding to surface, not a grant to invent.
2. **Apply + prove the invariants.** `supabase db reset`, then re-dump `pg_get_functiondef`
   and `proacl` and check I1–I7 by grep, each one individually. A missing `is_caller_verified`
   is the failure this whole plan exists to prevent.
   **Then run the guard that already exists (B3):** `supabase/tests/run_cross_tenant_lockdown_test.sh`
   already asserts I1 as *behaviour* (`cross_tenant_lockdown_test.sql:111-113`, unverified caller
   → 0 rows through this exact function) and I7's anon half (`:92-93`), with `ON_ERROR_STOP=1` in
   its runner. Also run `run_anon_execute_lockdown_test.sh` — ADR §:836 names it as the
   enforcement mechanism for the grant-ritual invariant. **Neither is optional, and the new suite
   must not restate them.**
3. **Export `parseLinks`** in `shop.ts` (deviation 2). `deriveInitialLocations` is already
   exported — it needs nothing.
4. **Regenerate types** — must come BEFORE steps 5-6, which type off them. **Scope the diff:**
   any hunk outside `get_discoverable_company` is **pre-existing drift and a finding to surface**,
   not a ride-along to commit silently.
5. **Extract the mapper (B1).** `getDiscoverableCompany` currently inlines its mapping inside a
   function that opens `await createClient()`, so nothing can drive it from a unit test. Follow
   the repo's shipped pattern — `mapDiscoverPersonRow(r, urlFor)` at
   `src/app/discover/people.ts:46`, imported directly by `people.test.ts:12` — and extract:

   ```ts
   export function mapDiscoverCompanyRow(
     r: ProfileRow,
     urlFor: (bucket: string, path: string) => string,   // MATCH people.ts:46 — round 2 (a)
   ): DiscoverCompanyProfile
   ```

   `getDiscoverableCompany` keeps the `createClient` + `rpc` call and passes its storage resolver
   in. Its **one** caller (`src/app/discover/[companyId]/page.tsx:27`) is untouched — the async
   function keeps its signature.

   **Signature must match the precedent.** `mapDiscoverPersonRow` keeps null-handling *inside*
   the mapper; rev 2's `(path: string|null) => string|null` pushed it into the injected function,
   forcing every unit test to reimplement null-handling to get a correct answer.

   **What the extraction is actually for (round 2 corrected rev 2's reasoning).** It is *not*
   what makes the N4 fixtures testable — `parseLinks` and `deriveInitialLocations` are already
   pure and exported, drivable with no extraction at all. What it buys is **wiring proof**: that
   `r.links` reaches `parseLinks` and `r.locations` reaches `deriveInitialLocations`, and not the
   reverse. **So the unit test asserts the wiring, and must not re-test the helpers** — they have
   their own specs.
6. **Type `ProfileRow` off the generated types, dropping the cast — with ONE narrowing (round 2 B1).**
   `companies.ts:101-103` reads the RPC through `as never` / `as unknown as {…}`. That cast means
   `tsc` **cannot** catch `r.warehouse_location` if the column shipped as `warehouse`. Derive it
   instead — **but the naive derivation does not compile.** The generator emits
   `connection_state: string` (`database.types.ts:4732`), while `DiscoverCompanyProfile.connectionState`
   is the `ConnectionState` union (`companies.ts:17`). Round 2 probed it: `error TS2322: Type
   'string' is not assignable to type 'ConnectionState'`. Write exactly:

   ```ts
   import type { Database } from "@/types/database.types";   // not currently imported

   type RpcRow = Database["public"]["Functions"]["get_discoverable_company"]["Returns"][number];
   type ProfileRow = Omit<RpcRow, "connection_state"> & { connection_state: ConnectionState };
   ```

   > ⚠️ **Builder fence.** On hitting TS2322 the cheapest "fix" is to restore
   > `as unknown as {…}` — which reinstates precisely the blindness this step exists to remove.
   > **That is a rejection, not a fix.** Narrow the one domain column; never re-widen the row.

   Two further facts about the generated types, both verified: `Database` **is** exported
   (`:9`), `Returns` **is** an array (`:4742`), `jsonb` arrives as `Json` which both helpers
   accept (they take `unknown`), and dropping `as never` **does** compile — the client is
   `createServerClient<Database>` (`src/shared/db/server.ts:11`); precedent `admin/layout.tsx:16`.
   **But the generator marks every `RETURNS TABLE` column non-null** — `tagline: string`,
   `about: string`, `logo_path: string` — which is a false contract in the *other* direction:
   `r.about.trim()` would now compile and throw at runtime. Keep the existing null-tolerant
   mapping; do not "simplify" away a `?? null`.

   Then extend `DiscoverCompanyProfile` and map the new fields through the two reused helpers;
   `tags` comes from `type_codes` alongside the existing `categories`.
7. **Run:** `tsc --noEmit` · full unit suite · the two SQL guards from step 2 · the new SQL
   suite · **and the two Present e2e pins** (`present-grid.spec.ts`, `present-card-edit.spec.ts`)
   **after a `supabase db reset`**. Rev 1 called these "the two e2e pins" without naming them and
   without a reason (N5): **no e2e touches `/discover/[companyId]` at all** — grep of `e2e/*.spec.ts`
   for `discover/` returns zero. They are run because **step 3 edits `shop.ts`, which is on the
   seller's path**, not because they exercise T01.

## Test surface (for `test-writer`)

Criteria 1–4 are all server-side or mapper-level, and this repo has a live pgTAP-style harness
for exactly this:

- **Existing guards, re-run not rewritten (B3):** `run_cross_tenant_lockdown_test.sh` covers
  I1-as-behaviour and the anon EXECUTE check; `run_anon_execute_lockdown_test.sh` covers the
  grant-ritual class. **The new suite must not duplicate either.**
- **New SQL suite** — the *new projections only*. ⚠️ **Rev 2 said "populated as seeded". The
  seed populates NONE of them** (round 2 B2, verified: zero `warehouse_location`, zero `links`;
  company metadata is only `jsonb_build_object('seed','demo-2d')` at `seed.sql:282,288`, and
  T00's diff touched only products/tiers/pricelist rows). Four of five would come back NULL, so
  the assertion was unsatisfiable **and the failure it exists to catch was invisible**: swap
  `address` and `warehouse_location` in the projection and `tsc` can't see it (both `string`),
  the suite can't see it (NULL = NULL), the unit test can't see it (hand-typed fixture).
  **So the suite plants its own row and asserts each of the five against a DISTINCT sentinel
  value:**
  `update public.company set address='PLANT-ADDR', warehouse_location='PLANT-WH',
   metadata = metadata || '{"links":[…],"locations":[…],"private_note":"PLANT-LEAK"}' where id=<seeded seller>`.
  Distinct values are the point — identical ones would pass a transposition.
- **The leak assertion must be a WHOLE-ROW scan** (round 2 N-leak), not a per-named-column check:
  `select to_jsonb(t)::text from public.get_discoverable_company(:id) t` asserted `not like
  '%PLANT-LEAK%'`. A per-column check is shape-blind to the column that hasn't been added yet —
  i.e. to the only thing ADR §4's leak rule is for.
- **Also in the SQL suite, not the unit test** (round 2 N4): assert that a key **absent** and a
  key **explicitly JSON null** both come back as JSON null. Rev 2 planned these as two unit
  fixtures, but they arrive at the mapper byte-identical as JS `null` — the distinction is a
  SQL/PostgREST fact and was asserted nowhere.
- Modelled on `run_seed_visibility_matrix_test.sh`, **including `\set ON_ERROR_STOP on`** — the
  false-green T00 caught.
- **Unit** (`companies.test.ts`, driving `mapDiscoverCompanyRow`): **wiring** assertions —
  `r.links` → `parseLinks`, `r.locations` → `deriveInitialLocations`, `type_codes` → both `tags`
  (raw) and `categories` (labelled) — plus the malformed-shape fixture. Not a re-test of the
  helpers.

## Owed elsewhere — recorded, not fixed here

- **`categories` becomes dead at T02** (round 2 N-dup). `DiscoverCompanyProfile.categories` has
  exactly one consumer, `page.tsx:60` — the line T02 replaces with `ShopView`. Carrying both
  `tags` and `categories` is one fact in two representations, the very thing deviation 1 rejects,
  one level down. T01 cannot remove it (that file is T02's). **Owed to T02.**
- **`TAG_LABEL` is 5 codes behind the live taxonomy** (round 2 N-tags). `ShopView.tsx:79-87,801`
  renders `TAG_LABEL[t] ?? titleCase(t)` and knows 5 legacy codes; `taxonomy.ts:9-18` has 8. A
  seller tagged `eu_gmp_cultivator` renders **`#Eu Gmp Cultivator`** in the buyer's info box
  where Discover's directory renders "EU-GMP Cultivator". Pre-existing `ShopView` gap, **newly
  reachable** because of deviation 1. **Surface at G4** rather than let Muskan find it.
  *(Note: deviation 1's wording in `TICKETS.md` says `ShopView` renders "raw codes" — it renders
  `TAG_LABEL[t] ?? titleCase(t)`. The conclusion — pass raw `type_codes`, don't pre-map through
  `categoryLabel` — is unaffected and still correct.)*

## Risks

- **The invariant re-verification is the sharp edge** — though not for the reason rev 1 gave.
  The event trigger protects the *grants*; nothing protects the **body**. I1's
  `is_caller_verified()` can still be lost to a careless re-type, and only step 2 catches that.
- `updated_at`'s type is `timestamptz`; the mapper must keep it a string, not a `Date`, to match
  `Shop.company.updated_at: string | null`.
- **The RPC's return type changes, so app code and migration are same-deploy** (ADR `:818`).
- `company.metadata` is `JSONB NOT NULL DEFAULT '{}'` (`20260607090002_phase1_core.sql:49`), so
  it is never SQL NULL — but `c.metadata->'links'` **is** SQL NULL when the key is absent, and
  `'null'::jsonb` when the key is explicitly JSON null. PostgREST renders both as JS `null`.
  Three fixtures, per N4.
