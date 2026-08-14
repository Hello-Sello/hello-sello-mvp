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
 * ⚠️ These cases MUTATE the local seed (case 3 persists a THC value on the first
 * card). Run serially so the persist/reload assertions are deterministic; re-run
 * `supabase db reset` to restore the seed. Sign-in mirrors present-edit-model.spec.ts
 * (alice@greenleaf.test — GreenLeaf has products but no seeded images).
 *
 * NOT asserted here (human-UAT): carousel arrow advance (needs ≥2 images) and the
 * native card→location drag (Playwright cannot drive native dataTransfer).
 */
import { test, expect, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

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
// numeric strip. The seeded first card (AUR-1A) carries cultivator="Aurora Inc"
// so the discard case has a real original value to revert to.

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
