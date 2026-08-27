/**
 * Phase 7 — Present card-front fidelity E2E (F-02, UX-02/UX-03).
 *
 * Behavior under test (the card front plugged into F-01's ONE pink Save):
 *  1. The cover is an image carousel; with the seeded GreenLeaf catalogue (which
 *     has NO product images) it renders the cultivar/name placeholder — the
 *     carousel container + placeholder are present (multi-image arrow advance is
 *     human-UAT, mirroring 07-04's native-DnD posture).
 *  2. In edit mode a cannabinoid (THC %) is an inline input. Changing it marks the
 *     shop dirty (the pink Save pulses) but persists NOTHING until Save — reloading
 *     without saving drops the edit.
 *  3. Save flushes the pending edit: the changed value survives a reload.
 *  4. ✕ discard clears the whole pending tree: the edit is not shown and not saved.
 *
 * Seed isolation: these cases MUTATE the shared seed (AUR-1A.price_public
 * via T05's Save flow; AUR-1D's thc_percent/cultivator/country_of_origin via F-02/
 * F-05's Save flow — `.first()` resolves to AUR-1D, not AUR-1A, see fixtures/
 * catalog.ts; and AUR-1B's price ladder via T04). Every mutated row/table is
 * captured before its own mutation and restored in `afterAll`, verified by an
 * independent read-back that re-selects from the DB rather than trusting the
 * write call not to throw — the file is safe to run repeatedly with no
 * `db reset` between runs. Run serially so the persist/reload assertions are
 * deterministic. Sign-in mirrors present-edit-model.spec.ts (alice@greenleaf.test
 * — GreenLeaf has products but no seeded images).
 *
 * NOT restored (accepted residue, not this ticket's fix): T05 ("Add to basket")
 * leaves one persistent basket line for Alice on AUR-1A — confirmed benign on
 * repeat runs (`addToBasket` upserts on (owner_person_id, product_id), so it
 * never duplicates) and out of scope for `seed_visibility_matrix_test.sql` /
 * `basket_admission_test.sql` (this ticket's AC2 targets), which scope to Bob/Eva.
 *
 * NOT asserted here (human-UAT): carousel arrow advance (needs ≥2 images) and the
 * native card→location drag (Playwright cannot drive native dataTransfer).
 *
 * Run via `npm test`, not a bare `npx playwright test` — the relative import from
 * `./fixtures/catalog` needs `PLAYWRIGHT_FORCE_ASYNC_LOADER=1`, which only the npm
 * script sets (`playwright.config.ts`'s own comment explains why).
 */
import { test, expect, type Page } from "@playwright/test";
import { psqlValue, psqlExec, resolveProductId } from "./fixtures/catalog";

test.describe.configure({ mode: "serial" });

// ── Seed isolation — capture + restore ────────────────────────────────────
// See the module docstring above for what's mutated and why the row is safe
// to reuse across runs. No product identity is hardcoded below except
// AUR-1A (price_public, T05 filters by name explicitly) and AUR-1B (the
// ladder, also filtered by name via `aur1b(page)`) — everything `.first()`
// touches is resolved dynamically off the DOM, never assumed statically.
const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

let seededPricePublic: boolean;
test.beforeAll(() => {
  // company_id scoped (matches resolveProductId's convention) — supplier_product_code
  // is only unique per company, not globally.
  seededPricePublic = psqlValue(
    `select price_public from product where company_id = '${GREENLEAF_COMPANY_ID}' and supplier_product_code = 'AUR-1A'`,
  ) === "t";
});

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
    const where = `company_id = '${GREENLEAF_COMPANY_ID}' and supplier_product_code = 'AUR-1A'`;
    psqlExec(`update product set price_public = ${seededPricePublic} where ${where}`);
    const got = psqlValue(`select price_public from product where ${where}`) === "t";
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

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function gotoShop(page: Page) {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
}

async function manageShop(page: Page) {
  await gotoShop(page);
  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "on");
}

test("F-02 · the cover is a carousel; empty catalogue shows the placeholder", async ({ page }) => {
  await gotoShop(page);
  const card = page.getByTestId("product-card").first();
  // The cover container is a carousel; the seed has no images → placeholder.
  await expect(card.getByTestId("card-photo")).toBeVisible();
  await expect(card.getByTestId("card-cover-placeholder")).toBeVisible();
});

test("F-02 · a cannabinoid edit is batched — nothing persists until Save", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  const thc = card.getByLabel("THC %");
  await expect(thc).toBeVisible();

  await thc.fill("38.29");
  // The one pink Save pulses (dirty), but nothing is written yet.
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  // Reload WITHOUT saving → the pending edit is discarded (never persisted).
  await page.reload();
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await expect(page.getByTestId("product-card").first().getByText("38,29")).toHaveCount(0);
});

test("F-02 · Save flushes the pending field edit (persists across reload)", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardFields(page, ["thc_percent"]);
  const card = page.getByTestId("product-card").first();
  await card.getByLabel("THC %").fill("41.7");

  await page.getByTestId("save-changes-btn").click();
  // Save commits + exits edit mode (router.refresh re-pulls the shop).
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");

  await page.reload();
  await expect(page.getByTestId("product-card").first().getByText("41,7")).toBeVisible();
});

test("F-02 · ✕ discard clears the pending edit", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // accept "Discard unsaved changes?"
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await card.getByLabel("THC %").fill("29.4");
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  await page.getByRole("button", { name: /exit/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");
  // Nothing was saved and the draft was cleared → the discarded value is not shown.
  await expect(page.getByTestId("product-card").first().getByText("29,4")).toHaveCount(0);
});

// ── F-05 — spec-row inline editing (Cultivator, Origin) ──────────────────────
// Extends the SAME pending-edit tree (onEditField → pendingProductEdits → Save
// flush → updateProductFields) to the card's other spec rows, not just the
// numeric strip. The seeded first card (AUR-1D — see the module docstring)
// carries a non-empty cultivator so the discard case has a real original value
// to revert to.

test("F-05 · a Cultivator (text spec-row) edit is batched — nothing persists until Save", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  const cultivator = card.getByLabel("Cultivator");
  await expect(cultivator).toBeVisible();

  await cultivator.fill("Northern Grow Co");
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  // Reload WITHOUT saving → the pending edit is discarded (never persisted).
  await page.reload();
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await expect(page.getByTestId("product-card").first().getByText("Northern Grow Co")).toHaveCount(0);
});

test("F-05 · Save flushes the Cultivator + Origin spec-row edits (persists across reload)", async ({ page }) => {
  await manageShop(page);
  await captureFirstCardFields(page, ["cultivator", "country_of_origin"]);
  const card = page.getByTestId("product-card").first();
  await card.getByLabel("Cultivator").fill("Northern Grow Co");
  await card.getByLabel("Origin").fill("Netherlands");

  await page.getByTestId("save-changes-btn").click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");

  await page.reload();
  const savedCard = page.getByTestId("product-card").first();
  await expect(savedCard.getByText("Northern Grow Co")).toBeVisible();
  await expect(savedCard.getByText("Netherlands")).toBeVisible();
});

test("F-05 · ✕ discard reverts the Cultivator spec-row edit to its original value", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // accept "Discard unsaved changes?"
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await card.getByLabel("Cultivator").fill("Someone Else Farms");
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  await page.getByRole("button", { name: /exit/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");
  // Discarded → the card shows its persisted value again (Save flushed
  // "Northern Grow Co" in the previous test), never the just-typed one.
  await expect(page.getByTestId("product-card").first().getByText("Someone Else Farms")).toHaveCount(0);
  await expect(page.getByTestId("product-card").first().getByText("Northern Grow Co")).toBeVisible();
});

test("F-05 · Dominance and Irradiation spec rows render as selects, not free text", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").first();
  await expect(card.getByLabel("Dominance")).toHaveJSProperty("tagName", "SELECT");
  await expect(card.getByLabel("Irradiation")).toHaveJSProperty("tagName", "SELECT");
});

// ── 0021 T04 — seller tier editor (edit-mode ladder → the ONE pink Save) ─────
// Tier rows join the SAME pending-edit tree as every other card field; Save
// flushes them atomically per product via saveLadder. Cards are located by
// product NAME (not .first()) — the ladder cases target specific seed rows:
//   AUR-1B "Pedanios 31/1 PND-CA" (base 6.00, no seeded rungs — the blank slate;
//     the first case PERSISTS a 2-rung ladder on it, which the invalid case
//     then reuses as its pre-populated starting state), and
//   AUR-1A "Pedanios 31/1 COS-CA" (base 8.00, one seeded rung 2000 g → 6.50).
// Aria-labels are 1-based (`Tier 1 minimum grams`).

/** AUR-1B's card — the seeded no-rungs product the ladder cases build on. */
function aur1b(page: Page) {
  return page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 PND-CA" });
}

test("T04 · tier rows save through the ONE pink Save and round-trip a reload", async ({ page }) => {
  await manageShop(page);
  const card = aur1b(page);
  // Blank slate: AUR-1B has no seeded rungs.
  await expect(card.getByText("Volume price tiers")).toBeVisible();
  await expect(card.getByLabel("Tier 1 minimum grams")).toHaveCount(0);

  // Build the ladder under the 6.00 base: 500 g → 5, 1000 g → 4.5.
  await card.getByRole("button", { name: /add tier/i }).click();
  await card.getByLabel("Tier 1 minimum grams").fill("500");
  await card.getByLabel("Tier 1 price per gram").fill("5");
  await card.getByRole("button", { name: /add tier/i }).click();
  await card.getByLabel("Tier 2 minimum grams").fill("1000");
  await card.getByLabel("Tier 2 price per gram").fill("4.5");
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  await page.getByTestId("save-changes-btn").click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");

  // Round-trip: the saved rungs come back from the DB into the editor.
  await page.reload();
  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "on");
  await expect(card.getByLabel("Tier 1 minimum grams")).toHaveValue("500");
  await expect(card.getByLabel("Tier 1 price per gram")).toHaveValue("5");
  await expect(card.getByLabel("Tier 2 minimum grams")).toHaveValue("1000");
  await expect(card.getByLabel("Tier 2 price per gram")).toHaveValue("4.5");
});

test("T04 · an invalid rung reds the row and disables Save; fixing re-enables it", async ({ page }) => {
  await manageShop(page);
  const card = aur1b(page);
  // Pre-populated from the previous case's persisted ladder (500 / 1000).
  await expect(card.getByLabel("Tier 2 minimum grams")).toHaveValue("1000");

  // Break the ascending rule: 400 is not above the 500 g tier.
  await card.getByLabel("Tier 2 minimum grams").fill("400");
  await expect(card.getByText("Must be higher than the tier above (500g)")).toBeVisible();
  await expect(page.getByTestId("save-changes-btn")).toBeDisabled();
  await expect(page.getByText("Fix the highlighted price tiers first.")).toBeVisible();
  // Exit stays usable while Save is blocked (only Save is disabled).
  await expect(page.getByRole("button", { name: /exit/i })).toBeEnabled();

  // Fix it → Save re-enables.
  await card.getByLabel("Tier 2 minimum grams").fill("1000");
  await expect(page.getByTestId("save-changes-btn")).toBeEnabled();
});

test("T04 · a seeded rung pre-populates the tier editor (AUR-1A)", async ({ page }) => {
  await manageShop(page);
  const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
  await expect(card.getByLabel("Tier 1 minimum grams")).toHaveValue("2000");
  await expect(card.getByLabel("Tier 1 price per gram")).toHaveValue("6.5");
});

// ── 0021 T05 — buyer "See all prices" panel (Variant B) ──────────────────────
// AUR-1A read mode (base 8.00, seeded rung 2000 g → 6.50, pack size 1000 g):
// reveal → base + rung rows → Choose pre-fills the rung's bubble (2000g+) with
// qty 1 → the availability chip flips to "from 2000g applied" → add to basket
// → the drawer line prices the rung (6,5 € — formatMoney's NBSP, the drawer's
// own convention; the card shows 6,50€ — deliberate delta, PLAN-T05 am. 5).

test("T05 · reveal → Choose a rung → chip applies → drawer prices the rung (AUR-1A)", async ({ page }) => {
  await gotoShop(page);
  let card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });

  // Seed ships price_public=false — the reveal must be absent until the seller
  // opts the price in (criterion 4's negative space, driven the real way).
  await expect(card.getByRole("button", { name: "See all prices" })).toHaveCount(0);
  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "on");
  await card.getByLabel("Show price to buyers").check();
  await page.getByTestId("save-changes-btn").click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");
  await page.goto("/present"); // already signed in — plain re-navigation to read mode
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });

  // Closed by default; the reveal opens the popover with base + rung rows.
  // The popover is PORTALED to document.body (it opens below the link and may
  // poke past the card's bottom edge), so it is located page-wide by its
  // dialog role — NOT inside the card's subtree.
  const reveal = card.getByRole("button", { name: "See all prices" });
  await expect(reveal).toBeVisible();
  await reveal.click();
  const panel = page.getByRole("dialog", { name: "Volume prices" });
  await expect(panel.getByText("Base price", { exact: true })).toBeVisible();
  // The rung row's label embeds the savings ("from 2000g · −19%") — assert the
  // row via its unambiguous Choose button instead of the composed label text.
  await expect(panel.getByRole("button", { name: "Choose from 2000g" })).toBeVisible();

  // Choose the rung: panel closes, the rung bubble is selected at qty 1, the
  // chip applies, and the headline shows the rung price.
  await panel.getByRole("button", { name: "Choose from 2000g" }).click();
  await expect(panel).toHaveCount(0); // panel closed
  await expect(card.getByRole("button", { name: "2000g+" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText("from 2000g applied")).toBeVisible();
  await expect(card.getByText("6,50€")).toBeVisible();

  // Add to basket → open the drawer from the TopBar icon; no testids in the
  // drawer — locate it by its visible structure/text (PLAN-T05 amendment 8).
  await card.getByRole("button", { name: /add to basket/i }).click();
  await page.getByRole("button", { name: "Basket", exact: true }).click();
  const drawer = page.getByRole("menu", { name: "Your basket" });
  await expect(drawer.getByText("Pedanios 31/1 COS-CA")).toBeVisible();
  // The rung price in the line row: formatMoney = "6,5" + NBSP + "€".
  await expect(drawer.getByText("6,5\u00a0€/g")).toBeVisible();
});
