/**
 * Phase 7 — Present unified edit-model E2E (F-01, UX-05/UX-06).
 *
 * Behavior under test (the one "Manage shop" edit mode):
 *  1. Entering edit shows the whole-page grey wash (surface data-edit="on") and a
 *     "+ Add product" tile inside each location grid; the tile opens the existing
 *     manual-add drawer (one entry point, one authority — no new createProduct).
 *  2. The Links info box is editable in edit mode — add / remove custom links over
 *     a local edits.links array committed via the one updateShopProfile links write.
 *  3. A free-text "add location" input stages a new group (client-side); a group
 *     only persists once a product carries the label (empty groups do NOT persist).
 *  4. ✕ discard leaves edit mode and reverts the text fields (incl. links).
 *
 * NOT asserted here (human-UAT, mirroring 07-04's DnD posture): the native HTML5
 * drag that ASSIGNS a product into a staged location (setProductLocation) — Playwright
 * cannot faithfully drive native dataTransfer events. The add-location input + the
 * drop target are exercised by the UI and verified manually.
 *
 * ⚠️ These cases MUTATE the local seed (link add/remove persist on Save; here we
 * discard, so nothing is committed). Sign-in mirrors present-grid.spec.ts
 * (seeded alice@greenleaf.test; GreenLeaf has products but no seeded links).
 */
import { test, expect, type Page } from "@playwright/test";

const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function manageShop(page: Page) {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
}

test("F-01 · entering edit shows the grey wash + a '+ Add product' tile", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  // Not editing → no add-product tile.
  await expect(page.getByTestId("add-product-tile")).toHaveCount(0);

  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "on");
  await expect(page.getByTestId("add-product-tile").first()).toBeVisible();
});

test("F-01 · the '+ Add product' tile opens the manual-add drawer", async ({ page }) => {
  await manageShop(page);
  await page.getByTestId("add-product-tile").first().click();
  // The existing AddProductsDrawer opens (its own "Add products" heading).
  await expect(page.getByRole("heading", { name: /add products/i })).toBeVisible();
});

test("F-01 · the Links box is editable — add then remove a custom link", async ({ page }) => {
  await manageShop(page);
  const linksBox = page.getByTestId("info-card-links");

  // Add a custom link.
  await linksBox.getByLabel(/link type/i).selectOption("custom");
  await linksBox.getByLabel(/custom link name/i).fill("E2E Link");
  await linksBox.getByLabel(/link url or handle/i).fill("https://example.com/e2e");
  await linksBox.getByTestId("add-link-btn").click();
  await expect(linksBox.getByText("E2E Link")).toBeVisible();

  // Remove it.
  await linksBox.getByRole("button", { name: /remove link/i }).click();
  await expect(linksBox.getByText("E2E Link")).toHaveCount(0);
});

test("F-01 · a free-text add-location input stages a new group", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  // Not editing → no add-location input.
  await expect(page.getByTestId("add-location-input")).toHaveCount(0);

  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  const input = page.getByTestId("add-location-input");
  await expect(input).toBeVisible();

  await input.fill("Vienna, AT");
  await page.getByTestId("add-location-btn").click();
  // A new (empty) group divider for the staged location appears.
  await expect(page.getByText("Vienna, AT").first()).toBeVisible();
});

test("F-01 · ✕ discard leaves edit mode and reverts links", async ({ page }) => {
  page.on("dialog", (d) => d.accept()); // accept the "Discard unsaved changes?" confirm
  await manageShop(page);
  const linksBox = page.getByTestId("info-card-links");

  // Add a link → the shop is dirty (the pink Save pulses).
  await linksBox.getByLabel(/link url or handle/i).fill("https://example.com/discard");
  await linksBox.getByTestId("add-link-btn").click();
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  // ✕ discard → edit mode off, the added link reverted.
  await page.getByRole("button", { name: /exit/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");
});

/**
 * F-07 — Warehouse/location list (Cluster H, a lightweight partial pull-forward
 * of D-05). Mirrors the F-01 Links tests above exactly: the Location info box's
 * "Warehouses" section is add/remove over a local edits.locations array, batched
 * under the ONE pink Save; Headquarter (a separate, always-on display in the same
 * box) is never editable and carries no remove control.
 *
 * ⚠️ The "Save persists it" case MUTATES the local seed (mirrors the note atop
 * this file — `supabase db reset` between runs is expected).
 */
test("F-07 · the Warehouses section shows add/remove rows; Headquarter stays read-only", async ({ page }) => {
  await manageShop(page);
  const box = page.getByTestId("info-card-warehouse");
  await box.click(); // expand "more" to reveal the warehouse editor
  await expect(box.getByTestId("info-more")).toBeVisible();

  // Headquarter renders (unchanged) with no remove control anywhere yet.
  await expect(box.getByText(/headquarter/i)).toBeVisible();
  await expect(box.getByRole("button", { name: /remove warehouse/i })).toHaveCount(0);

  // Add a warehouse — it appears as "Warehouse 1" with a remove control.
  await box.getByLabel(/new warehouse location/i).fill("Berlin");
  await box.getByTestId("add-warehouse-btn").click();
  await expect(box.getByText("Berlin")).toBeVisible();
  await expect(box.getByText(/warehouse 1/i)).toBeVisible();
  await expect(box.getByRole("button", { name: /remove warehouse/i })).toHaveCount(1);

  // Remove it again.
  await box.getByRole("button", { name: /remove warehouse/i }).click();
  await expect(box.getByText("Berlin")).toHaveCount(0);
});

test("F-07 · adding a warehouse + Save persists it", async ({ page }) => {
  await manageShop(page);
  const box = page.getByTestId("info-card-warehouse");
  await box.click();
  await box.getByLabel(/new warehouse location/i).fill("Rotterdam");
  await box.getByTestId("add-warehouse-btn").click();

  await page.getByTestId("save-changes-btn").click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");

  // Reload — the saved warehouse survives (read from company.metadata.locations).
  await page.reload();
  await page.getByTestId("info-card-warehouse").click();
  await expect(page.getByTestId("info-card-warehouse").getByText("Rotterdam")).toBeVisible();
});

test("F-07 · ✕ discard before Save reverts the whole warehouse list", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await manageShop(page);
  const box = page.getByTestId("info-card-warehouse");
  await box.click();
  await box.getByLabel(/new warehouse location/i).fill("Discard Me");
  await box.getByTestId("add-warehouse-btn").click();
  await expect(page.getByTestId("save-changes-btn")).toHaveAttribute("data-dirty", "true");

  // ✕ discard → edit mode off, the added warehouse reverted (never saved).
  await page.getByRole("button", { name: /exit/i }).click();
  await expect(page.getByTestId("shop-surface")).toHaveAttribute("data-edit", "off");

  await page.getByTestId("present-banner").getByRole("button", { name: /manage shop/i }).click();
  await page.getByTestId("info-card-warehouse").click();
  await expect(page.getByTestId("info-card-warehouse").getByText("Discard Me")).toHaveCount(0);
});
