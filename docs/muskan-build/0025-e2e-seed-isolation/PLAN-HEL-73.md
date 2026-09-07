# PLAN — HEL-73 / 0025-e2e-seed-isolation (rev 3)

Written 2026-08-26, `/build` step 2. **rev 3** — round 2 returned REVISE (3 new blocking:
B5, B6, B7; rev 1's B1-B4 mostly closed). All spot-verified true against the live repo
before folding (L-003). Round 1 and round 2's full reports archived at the bottom (§7)
rather than discarded.

Single ticket, no T-breakdown. Every file in scope is `e2e/**` → `builder` not
spawned (L-035, unchanged from rev 1/2).

## §0 — the pattern behind rounds 1 and 2, named once so it isn't repeated a third time

Every blocking finding across both rounds was the same root mistake in different
clothes: **assuming which product `.first()` resolves to, instead of reading it off
the page.** T05 is safe because it filters by name explicitly
(`filter({ hasText: "Pedanios 31/1 COS-CA" })`). Every OTHER test that uses bare
`.first()` is not safe to reason about statically — B5 proved this the hard way,
tracing through `shop.ts` → `locationFilter.ts` → `ShopView.tsx` → the seed's own
name-sort order, and the answer (AUR-1D, not AUR-1A) was genuinely non-obvious.

**Rev 3's rule, applied everywhere: no product identity is ever hardcoded except
where a test already filters by name itself (T05, and the ladder tests via
`aur1b(page)`). Everywhere else, capture the identity dynamically off the DOM,
before mutating, resolve it via SQL by name, and restore by the resolved id.** This
is the present-manage.spec.ts pattern from rev 1/2, now applied uniformly to
present-card-edit.spec.ts too, closing the whole class B5 found rather than patching
one instance of it.

## §1 — shared fixture module: `e2e/fixtures/catalog.ts` (new file)

Addresses B7 (missing `ON_ERROR_STOP`) and N-D (dead symbols after refactor) directly.

```ts
import { execFileSync } from "node:child_process";

const DB_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function psqlBin(): string {
  const candidates = ["psql", "/Applications/Postgres.app/Contents/Versions/latest/bin/psql"];
  for (const bin of candidates) {
    try { execFileSync(bin, ["--version"], { stdio: "ignore" }); return bin; }
    catch { /* try next */ }
  }
  throw new Error("psql not found on PATH or in Postgres.app");
}

/** Single-value query helper — one row, one column, `-At` (no header/border). */
export function psqlValue(sql: string): string {
  return execFileSync(psqlBin(), [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
  }).trim();
}

/** Run a statement for its side effect. `ON_ERROR_STOP=1` (B7) makes psql exit non-zero
 * on a SQL error instead of printing it and continuing — execFileSync then throws. */
export function psqlExec(sql: string): void {
  execFileSync(psqlBin(), [DB_URL, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], { encoding: "utf8" });
}

/** Resolve a product's real id by its CURRENT name (unique among non-deleted rows for
 * a company). Throws on zero or ambiguous matches, named by the query that failed. */
export function resolveProductId(companyId: string, currentName: string): string {
  const row = psqlValue(
    `select id from product where company_id = '${companyId}' ` +
      `and name = '${currentName.replace(/'/g, "''")}' and deleted_at is null`,
  );
  if (!row) throw new Error(`resolveProductId: no product named "${currentName}" for company ${companyId}`);
  if (row.includes("\n")) throw new Error(`resolveProductId: ambiguous name "${currentName}" matched >1 row`);
  return row;
}
```

`present-card-edit.spec.ts`'s EXISTING inline `psqlBin`/`DB_URL`/`aur1aPricePublic`
(added during `/diagnose`) are **deleted**, not left dead (N-D) — replaced by imports
from this module.

## §2 — present-card-edit.spec.ts: dynamic capture for every field, no hardcoded product

**price_public (T05, filters by name — stays a direct lookup, this one IS safe):**
```ts
const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let seededPricePublic: boolean;
test.beforeAll(() => {
  seededPricePublic = psqlValue(
    `select price_public from product where supplier_product_code = 'AUR-1A'`,
  ) === "t";
});
```

**thc_percent / cultivator / country_of_origin — dynamic capture, addresses B5:**

```ts
type FieldSnapshot = { id: string; fields: Record<string, string> };
const capturedFields: FieldSnapshot[] = [];

/** Capture the `.first()` card's real id (by its CURRENTLY-DISPLAYED name — call
 * BEFORE this test's own mutation, and AFTER `await manageShop(page)`: outside edit
 * mode the name renders as plain text, not an input, so `.inputValue()` would throw)
 * plus the named columns' CURRENT values, so the restore target and the restore
 * values are both read fresh, never assumed. MERGES into an existing captured entry
 * for the same id rather than dropping the call — two tests can resolve to the same
 * product with DIFFERENT column sets, and skipping would silently lose the second
 * set's restore (round 3's B8). Keeps the EARLIEST value seen for any column already
 * captured, since a later capture may already be reading a post-mutation value. */
async function captureFirstCardFields(page: Page, columns: string[]): Promise<void> {
  const card = page.getByTestId("product-card").first();
  const name = await card.getByLabel(/product name/i).inputValue();
  const id = resolveProductId(GREENLEAF_COMPANY_ID, name);
  const row = psqlValue(`select ${columns.join(",")} from product where id = '${id}'`);
  const values = row.split("|");
  const existing = capturedFields.find((c) => c.id === id);
  if (existing) {
    columns.forEach((col, i) => {
      if (!(col in existing.fields)) existing.fields[col] = values[i];
    });
  } else {
    const fields: Record<string, string> = {};
    columns.forEach((col, i) => { fields[col] = values[i]; });
    capturedFields.push({ id, fields });
  }
}
```

Called, **always `await`ed** (round 3's B9 — every capture call in rev 2 was a bare,
un-awaited call, racing the test's own DOM interactions that follow it), at the top
of each test body, right after `await manageShop(page)`:
- F-02 "Save flushes the pending field edit" — `await captureFirstCardFields(page, ["thc_percent"])`, before `.fill("41.7")`.
- F-05 "Save flushes the Cultivator + Origin spec-row edits" — `await captureFirstCardFields(page, ["cultivator", "country_of_origin"])`, before either `.fill(...)`.

These resolve to the SAME product id in practice (nothing between the two tests
changes any product's name or location, so the sort/group order is unchanged) — the
merge-by-id logic above handles this correctly now, restoring both `thc_percent` AND
`cultivator`/`country_of_origin` on that one row, rather than only the first-captured
column (B8).

**Restore + read-back verification (addresses B1/B7's "vacuous assert" and "no
read-back" findings, applied to BOTH the price_public hook and the new fields):**

```ts
test.afterAll(() => {
  // All restores run FIRST, every failure collected into one array, ONE assert at
  // the end (round 4's N1: an early-failing assert must not abort restores that
  // come after it in the hook — that would leave e.g. the AUR-1B ladder leak in
  // place because a price_public mismatch threw before reaching it).
  const failures: string[] = [];

  // price_public — restore then verify against the DB, not against our own write
  // blindly: the read-back is a SEPARATE select, so a wrong `id`/WHERE clause would
  // still be caught (it would read back whatever the row's REAL current value is,
  // not whatever we intended to write).
  try {
    psqlExec(`update product set price_public = ${seededPricePublic} where supplier_product_code = 'AUR-1A'`);
    const got = psqlValue(`select price_public from product where supplier_product_code = 'AUR-1A'`) === "t";
    if (got !== seededPricePublic) failures.push(`AUR-1A.price_public: expected ${seededPricePublic}, got ${got}`);
  } catch (e) {
    failures.push(`AUR-1A.price_public: ${e instanceof Error ? e.message : String(e)}`);
  }

  // dynamically-captured fields
  for (const snap of capturedFields) {
    const setClause = Object.entries(snap.fields)
      .map(([col, val]) => `${col} = '${val.replace(/'/g, "''")}'`)
      .join(", ");
    try {
      psqlExec(`update product set ${setClause} where id = '${snap.id}'`);
      const cols = Object.keys(snap.fields);
      const readBack = psqlValue(`select ${cols.join(",")} from product where id = '${snap.id}'`).split("|");
      cols.forEach((col, i) => {
        if (readBack[i] !== snap.fields[col]) {
          failures.push(`${snap.id}.${col}: expected "${snap.fields[col]}", got "${readBack[i]}"`);
        }
      });
    } catch (e) {
      failures.push(`${snap.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // AUR-1B price ladder — resolved by CODE, not a frozen id (addresses B6:
  // pricelist_item.id has no `id` column in the seed insert, so it's
  // gen_random_uuid() on every reset, never stable to hardcode). Guarded the same
  // way resolveProductId is (N2) — a miss or a duplicate fails loudly, named, rather
  // than an empty/ambiguous string reaching the DELETE below.
  try {
    const aur1bRow = psqlValue(
      `select pi.id from pricelist_item pi join product p on p.id = pi.product_id ` +
        `where p.supplier_product_code = 'AUR-1B' and pi.deleted_at is null`,
    );
    if (!aur1bRow) throw new Error("no live pricelist_item found");
    if (aur1bRow.includes("\n")) throw new Error("ambiguous pricelist_item match");
    psqlExec(`delete from pricelist_item_tier where pricelist_item_id = '${aur1bRow}'`);
    const remaining = psqlValue(
      `select count(*) from pricelist_item_tier where pricelist_item_id = '${aur1bRow}' and deleted_at is null`,
    );
    if (remaining !== "0") failures.push(`AUR-1B tier rows: expected 0 remaining, got ${remaining}`);
  } catch (e) {
    failures.push(`AUR-1B ladder restore: ${e instanceof Error ? e.message : String(e)}`);
  }

  expect(failures, `restore failed: ${failures.join("; ")}`).toEqual([]);
});
```

**What this proves, stated honestly (still true from rev 2, restated for the new
code):** the read-back re-selects are a genuinely independent check — a wrong `id`
or a no-op `UPDATE`/`DELETE` (B6/B7's exact failure mode) now surfaces as a mismatch
between what was captured and what's actually in the DB, not just "the write call
didn't throw."

## §3 — present-manage.spec.ts: unchanged from rev 2's design, `ON_ERROR_STOP` now
   inherited from §1's fixed `psqlExec`

The capture-at-all-8-mutating-tests design, the per-product try/catch isolation, and
the `deleted_at`-only restore (no dead `deletedAt` field, per rev 2's N1) all carry
forward unchanged — round 2 confirmed B4 (all 8 tests correctly targeted) and N-C/N-G/
N-H (guards, ladder RPC behavior, soft-delete reversibility) as already correct.
**One addition:** the restore loop now also re-reads and asserts `name`/`deleted_at`
after each `UPDATE`, matching §2's read-back pattern, so B7's "no read-back" finding
is closed here too, not just in §2.

```ts
import { psqlValue, psqlExec, resolveProductId } from "./fixtures/catalog";

const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
type CapturedProduct = { id: string; name: string };
const captured: CapturedProduct[] = [];

async function captureFirstCardIdentity(page: Page): Promise<void> {
  const card = page.getByTestId("product-card").first();
  const name = await card.getByLabel(/product name/i).inputValue();
  const id = resolveProductId(GREENLEAF_COMPANY_ID, name);
  if (!captured.some((c) => c.id === id)) captured.push({ id, name });
}

test.afterAll(() => {
  expect(captured.length, "at least one product identity must have been captured").toBeGreaterThan(0);
  const failures: string[] = [];
  for (const p of captured) {
    try {
      psqlExec(
        `update product set name = '${p.name.replace(/'/g, "''")}', deleted_at = null where id = '${p.id}'`,
      );
      psqlExec(`delete from product_media where product_id = '${p.id}'`);
      psqlExec(`delete from product_image where product_id = '${p.id}'`);
      const readBack = psqlValue(`select name, deleted_at is null from product where id = '${p.id}'`).split("|");
      if (readBack[0] !== p.name || readBack[1] !== "t") {
        failures.push(`${p.name} (${p.id}): read-back mismatch — got name="${readBack[0]}" not-deleted=${readBack[1]}`);
      }
    } catch (e) {
      failures.push(`${p.name} (${p.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Storage objects are NOT cleaned here — uuid-suffixed paths never collide with a
  // later run (MediaManager.tsx:117,146). Declared, not fixed (N8) — this ticket's
  // ACs are about the database seed, not storage.
  expect(failures, `restore failed for: ${failures.join("; ")}`).toEqual([]);
});
```

Call `await captureFirstCardIdentity(page)` — **always awaited** (round 3's B9: a
bare, un-awaited call races the test's own DOM interactions right after it) — in all
8 mutating tests (unchanged list from rev 2, independently re-verified by round 2's
and round 3's checkers against the live file): rename, soft-delete, upload-image,
video-link, COA-empty-state, upload-COA, upload-custom-doc, download-a-file.
**Exact placement (N3):** right after `await manageShop(page)`, and for tests 3-8,
**before** `await flipToBack(card)` — the card's front face (where the name input
lives) leaves the DOM once flipped, so capturing after the flip would fail to find
the name field at all.

## §4 — docstrings (unchanged intent from rev 2, now honest about what's still deferred)

Both files' top-of-file comments get rewritten to state the row is now restored and
safe, per AC1's "cite why the row is safe to use." **Explicitly declared as NOT
covered by this fix, named in the docstring rather than left implicit (closes N-E,
N-F):**
- `present-card-edit.spec.ts` T05 leaves one persistent basket line for Alice
  (`:318-319`, "Add to basket") — doesn't affect either SQL suite this ticket's AC2
  targets (they scope to Bob/Eva), left as accepted residue. **Confirmed genuinely
  benign on a second run too** (round 3, N6): `addToBasket` upserts on
  `(owner_person_id, product_id)`, so re-running doesn't duplicate the line.
- **Named, not left implicit (N5):** `present-manage.spec.ts`'s soft-delete test
  targets **AUR-1A** specifically — after the rename test moves AUR-1D's name to
  "Renamed by E2E", AUR-1A becomes the sort-first product in the Toronto group. This
  makes the `deleted_at = null` restore load-bearing for `seed_visibility_matrix_test.sql`,
  which requires all of AUR-1A-1E present and non-deleted.
- `e2e/present-grid.spec.ts` — reader-only, already defensively written around this
  exact leak; out of scope for this ticket (L-039), simplifying it is a future
  opportunity, not this ticket's job.
- `e2e/present-add-product-fields.spec.ts` and `e2e/present-edit-model.spec.ts` —
  both also leak (insert-without-cleanup, edit-without-restore respectively),
  neither affects `seed_visibility_matrix_test.sql`'s AC2 pass/fail (verified:
  the matrix query counts `DISTINCT location` and explicitly excuses a sixth
  product / ignores NULL locations). Out of scope for this ticket — the ticket
  named 3 files, these are 2 more found along the way, deferred by name rather than
  silently dropped.

## §5 — acceptance criteria this plan closes

1. Both edited files restore every field/table they mutate, in `afterAll`, verified
   by an independent read-back, with a comment stating why the row is safe to use.
2. Run the full local suite twice with no reset between → same result both times, for
   `present-card-edit.spec.ts`, `present-manage.spec.ts`,
   `seed_visibility_matrix_test.sql`, and `basket_admission_test.sql`. **Verified by
   the orchestrator at step 6/10 by actually running it twice, not claimed by
   `test-writer`** (L-023).
3. Two more pre-existing leaks (`present-add-product-fields.spec.ts`,
   `present-edit-model.spec.ts`) are named as deferred, not silently missed — §4.

## §6 — files `test-writer` creates/edits

- **New:** `e2e/fixtures/catalog.ts` (§1).
- **Edit:** `e2e/present-card-edit.spec.ts` — delete the old inline psql helper +
  `price_public`-only hooks, add the §2 design (import from fixtures, dynamic capture
  for 2 more fields, AUR-1B ladder cleanup, docstring rewrite).
- **Edit:** `e2e/present-manage.spec.ts` — add the §3 design (import, capture calls
  at all 8 mutating tests, restore-with-read-back `afterAll`, docstring rewrite).

## §7 — prior rounds' findings archive

<details>
<summary>Round 1 (rev 1 → rev 2): B1-B4, N1-N12</summary>

B1: widened hook asserted without restoring. B2: `cultivar` isn't editable; the real
fields are `country_of_origin`/`thc_percent`/`cultivator`. B3: an AUR-1B price-ladder
leak invisible to `/diagnose` because serial mode skips tests after F-05's failure.
B4: 8 mutators in `present-manage.spec.ts`, not 5.
N1-N12: dead `deletedAt` field, no empty-row guard, non-isolated restore loop, valid
`expect`-in-`afterAll` placement, stale "still original" comment, correct
injection/citation claims, storage-object leftovers (declared), duplicated `psql`
helper (now shared), AC1's "safe to use" comment obligation.

</details>

<details>
<summary>Round 2 (rev 2 → rev 3): B5-B7, N-A through N-H</summary>

B5 — THE SHARP ONE: `.first()` in `present-card-edit.spec.ts`'s F-02/F-05 tests is
**AUR-1D**, not AUR-1A (traced through `shop.ts`'s name-sort → `locationFilter.ts`'s
first-seen group order → the seed's actual name ordering, where "Pedanios 10/10
MBE-CA" / AUR-1D sorts before "Pedanios 31/1 COS-CA" / AUR-1A). rev 2's hardcoded
`supplier_product_code = 'AUR-1A'` restore for `thc_percent`/`cultivator`/
`country_of_origin` would have silently restored a row that was never mutated,
while the actually-mutated row (AUR-1D) stayed corrupted forever — green suite,
wrong reason.
B6: AUR-1B's `pricelist_item.id` has no seeded `id` column → `gen_random_uuid()` on
every reset; rev 2 hardcoded a snapshot of the current value, which goes stale the
moment anyone resets the DB.
B7: `psqlExec` didn't pass `-v ON_ERROR_STOP=1` (a bad statement wouldn't throw), and
neither `afterAll` re-read its own writes to confirm they landed — a wrong/stale id
would silently no-op and still report success.
N-A through N-H: a factually-wrong code comment about which product gets captured
when (mechanism was fine, the narrative was wrong), confirmed-correct guards/
isolation/RPC-behavior claims, one more unrestored mutation (a basket line), and two
more pre-existing leaking spec files found but out of this ticket's declared scope.

</details>
