/**
 * Phase 7 fast-follow F-04 — Cluster E, "Add-product field parity"
 * (07-FIDELITY-CONTEXT.md, Round 2).
 *
 * Behavior under test: `AddProductsDrawer`'s "Add manually" tab collects the
 * curated subset of spec-row fields that were previously CSV-only — CBG %,
 * CBN %, Region, Lineage A, Lineage B, Packaging, Resealable — so a manually
 * added product shows real values on its card instead of "n.a.".
 *
 * Reuses the existing importProductsFromCsv → import_products validation path
 * (buildCsv keyed by the exact TEMPLATE_COLUMNS header strings); no new RPC.
 *
 * ⚠️ MUTATES the shared seed (inserts one product, no cleanup) — the same
 * posture as present-manage.spec.ts. Uses a unique product name per run.
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

test("F-04 · manual Add-product form collects CBG/CBN/Region/Lineage/Packaging/Resealable and the card shows them", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  // Enter edit mode → open the manual-add drawer via the "+ Add product" tile.
  await page.getByRole("button", { name: /manage shop/i }).click();
  await page.getByTestId("add-product-tile").first().click();
  await expect(page.getByRole("heading", { name: /add products/i })).toBeVisible();

  // Switch to "Add manually".
  await page.getByRole("button", { name: /add manually/i }).click();

  const productName = `E2E Field Parity ${Date.now()}`;

  // Scope to the drawer's manual-add <form> — the shop's product cards are ALSO
  // in edit mode behind the drawer, with their own aria-labelled "Product name" /
  // "THC %" / "CBD %" / "CBG %" / "CBN %" inline-edit inputs, so an unscoped
  // getByLabel would hit the wrong (card) element or resolve ambiguously.
  const form = page.locator("form");

  // Pre-existing required fields.
  await form.getByLabel(/product name/i).fill(productName);
  await form.getByLabel(/supplier code/i).fill(`SKU-${Date.now()}`);
  await form.getByLabel(/^THC %/i).fill("18,5");
  await form.getByLabel(/^CBD %/i).fill("0,4");
  await form.getByLabel(/pack size/i).fill("10");
  await form.getByLabel(/basic price per g/i).fill("5,00");
  await form.getByLabel(/^Unit/i).selectOption("g");
  await form.getByLabel(/^Dominance/i).selectOption("hybrid");
  await form.getByLabel(/^Irradiation/i).selectOption("un_irradiated");

  // NEW fields under test (Cluster E).
  await form.getByLabel(/^CBG %/i).fill("0,8");
  await form.getByLabel(/^CBN %/i).fill("0,3");
  await form.getByLabel(/^Region$/i).fill("Okanagan Valley");
  await form.getByLabel(/^Lineage A$/i).fill("OG Kush");
  await form.getByLabel(/^Lineage B$/i).fill("Durban Poison");
  await form.getByLabel(/^Packaging$/i).fill("Glass jar");
  await form.getByLabel(/^Resealable$/i).check();

  await form.getByRole("button", { name: /add product/i }).click();
  await expect(page.getByText(/imported 1 product/i)).toBeVisible();

  // Close the drawer and reload so the new card renders from a fresh fetch.
  await page.keyboard.press("Escape");
  await page.reload();

  const card = page.getByTestId("product-card").filter({ hasText: productName });
  await expect(card).toBeVisible();
  await expect(card.getByText("Okanagan Valley")).toBeVisible();
  await expect(card.getByText("OG Kush × Durban Poison")).toBeVisible();
  await expect(card.getByText("Glass jar")).toBeVisible();
  await expect(card.getByText("Yes", { exact: true })).toBeVisible();
  // CBG/CBN strip values (5-value strip renders as plain text, not an input, outside
  // edit mode; the card formats numbers with a comma decimal — EU convention, see na()).
  await expect(card.getByText("0,8", { exact: true })).toBeVisible();
  await expect(card.getByText("0,3", { exact: true })).toBeVisible();
});
