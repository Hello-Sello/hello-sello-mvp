/**
 * Phase 7 — Present mode E2E spec (07-06, DEV-119 + DEV-127 / UX-06).
 *
 * Behavior under test:
 *  1. A "Present mode" control lives in the banner. Entering it hides the app
 *     chrome (IconRail + TopBar) from view while the shop stays visible — an
 *     in-app view that stays Zoom/Teams-shareable, NOT the OS Fullscreen API.
 *  2. Exit / ESC leave present mode and restore the chrome.
 *  3. The top-right company name/logo is a chip that opens your own /present page.
 *
 * How "chrome hidden from view" is asserted: present mode renders an opaque
 * full-window layer that COVERS the still-mounted chrome (the self-contained
 * approach — no shared AppShell edit). A covered element does NOT flip Playwright's
 * toBeVisible(), so we assert real visual occlusion via document.elementFromPoint:
 * the topmost element over the chrome's own box must be the present layer.
 *
 * The subjective "shares cleanly in Zoom, no cutoff, flip/pulse feel" is the
 * human-verify item (07-06 Task 3), not asserted here.
 *
 * Sign-in mirrors present-grid.spec.ts (seeded alice@greenleaf.test).
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

/**
 * True when the topmost element over `selector`'s own centre is the present layer
 * (i.e. the chrome element is visually occluded by present mode). `false` when the
 * chrome paints on top (normal mode) — which is what un-occlusion looks like.
 */
async function occludedByPresentLayer(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const target = document.querySelector(sel);
    const layer = document.querySelector('[data-testid="present-layer"]');
    if (!target) return false;
    if (!layer) return false;
    const r = target.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!top && (layer === top || layer.contains(top));
  }, selector);
}

test("DEV-119 · Present mode hides the app chrome; Exit restores it", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  const banner = page.getByTestId("present-banner");
  const presentBtn = banner.getByRole("button", { name: /present mode/i });
  await expect(presentBtn).toBeVisible();

  // Before: chrome paints normally (not occluded), no present layer yet.
  expect(await occludedByPresentLayer(page, "header")).toBe(false);
  expect(await occludedByPresentLayer(page, "aside")).toBe(false);

  // Enter present mode.
  await presentBtn.click();
  await expect(page.getByTestId("present-layer")).toBeVisible();

  // The shop is still on screen…
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  // …but the TopBar (header) and IconRail (aside) are now covered by the layer.
  expect(await occludedByPresentLayer(page, "header")).toBe(true);
  expect(await occludedByPresentLayer(page, "aside")).toBe(true);

  // Exit control restores the chrome.
  await page.getByTestId("exit-present").click();
  await expect(page.getByTestId("present-layer")).toHaveCount(0);
  expect(await occludedByPresentLayer(page, "header")).toBe(false);
  expect(await occludedByPresentLayer(page, "aside")).toBe(false);
});

test("DEV-119 · ESC leaves present mode", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  await page.getByTestId("present-banner").getByRole("button", { name: /present mode/i }).click();
  await expect(page.getByTestId("present-layer")).toBeVisible();
  expect(await occludedByPresentLayer(page, "header")).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("present-layer")).toHaveCount(0);
  expect(await occludedByPresentLayer(page, "header")).toBe(false);
});

test("DEV-127 · the company chip opens your own /present page", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");

  const chip = page.getByTestId("company-chip");
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("href", "/present");

  await chip.click();
  await expect(page).toHaveURL(/\/present$/);
  // Still the seller's own shop (banner + at least one card render).
  await expect(page.getByTestId("present-banner")).toBeVisible();
});
