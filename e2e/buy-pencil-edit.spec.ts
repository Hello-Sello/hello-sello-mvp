/**
 * Buy pencil-edit E2E — the Analytics/Sheet block's net/gross resale-price
 * write path (Phase 18, Plans 09-13, BUY-01).
 *
 * Behavior under test: signed in as Bob (StonePharm), on `/buy`'s Analytics
 * section, the net-price pencil cell for a known GreenLeaf product
 * ("Pedanios 31/1 COS-CA", seeded via ALLOC-SEED-01) accepts a typed value on
 * Enter, persists it via the real `saveBuyerResalePrice` server action, and
 * the cell + its DB1/margin rollups reflect the saved value after the
 * server-action write takes effect (mirrors this project's existing
 * `router.refresh()`-driven e2e verification pattern — no custom
 * `waitForResponse` plumbing needed since `PartnersAnalyticsCard` already
 * calls `router.refresh()` on save).
 *
 * The first supplier + its first category render already-expanded by default
 * (`AnalyticsTable.tsx`'s own documented demo affordance) — GreenLeaf is
 * Bob's only seeded supplier, so the net/gross pencil cells for its first
 * product are visible without any manual expand click.
 *
 * Cleans up the row it writes (reverting the field to 0) so a re-run of this
 * spec against the same local DB lands in the same deterministic state —
 * mirrors present-card-edit.spec.ts's own "leave no residue" discipline where
 * a spec creates data.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";

const EMAIL = "bob@stonepharm.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

/**
 * Opens a `PencilEditCell` regardless of its current idle state
 * (PencilEditCell.tsx): when EMPTY, the `data-testid` sits directly on the
 * clickable `<button>` (the dashed "insert" pill) — clicking the locator
 * itself opens it. When FILLED, the same `data-testid` sits on an outer
 * `<span>` wrapping the value text + a small nested edit-icon `<button>` —
 * clicking the wrapper's bounding box mostly hits the value text, not the
 * tiny icon, so the nested button must be targeted by role instead. Checking
 * the resolved element's own tag name distinguishes the two cases without
 * assuming which starting state the DB is in (idempotent across re-runs).
 */
async function openPencilCell(cell: Locator): Promise<void> {
  const tagName = await cell.evaluate((el) => el.tagName);
  if (tagName === "BUTTON") {
    await cell.click();
  } else {
    await cell.getByRole("button", { name: "Edit value" }).click();
  }
}

test("the net-price pencil cell saves a value and DB1/margin update accordingly", async ({ page }) => {
  await signIn(page);
  await page.goto("/buy");

  await page.locator("button", { hasText: "Analytics" }).first().click();
  await expect(page.getByRole("heading", { name: "Analytics" })).toBeVisible();

  // GreenLeaf's first product renders already-expanded (AnalyticsTable's
  // documented default) — the net pencil cell is visible without an extra
  // expand click.
  const netCell = page.getByTestId("pencil-cell-net").first();
  await expect(netCell).toBeVisible();

  await openPencilCell(netCell);
  const input = page.getByLabel("Edit value");
  await expect(input).toBeVisible();
  await input.fill("12.5");
  await input.press("Enter");

  // The pencil cell leaves editing mode and shows the saved value.
  await expect(page.getByTestId("pencil-cell-net").first()).toContainText("12,50");

  // DB1 total (product-level rollup, 6th column: Supplier/Product, Revenue,
  // Avg purchase price, Net, Gross, DB1 total) is no longer the blank dash —
  // a real net price now makes DB1 computable (lib/money.ts: db1Total is null
  // only while net is null). Gross stays untouched/blank on the SAME row
  // (PencilEditCell's "sibling field is never touched" contract), so this
  // asserts the specific DB1-total cell rather than the whole row's text.
  const productRow = page.locator("tr", { hasText: "Pedanios 31/1 COS-CA" }).last();
  const db1TotalCell = productRow.locator("td").nth(5);
  await expect(db1TotalCell).not.toHaveText("–");

  // Clean-up: revert to keep the DB in a deterministic state for a re-run
  // (this spec's own "leave no residue" discipline).
  await openPencilCell(page.getByTestId("pencil-cell-net").first());
  const input2 = page.getByLabel("Edit value");
  await input2.fill("0");
  await input2.press("Enter");
  await expect(page.getByTestId("pencil-cell-net").first()).toContainText("0,00");
});
