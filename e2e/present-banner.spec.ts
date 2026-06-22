/**
 * Phase 7 — Present banner E2E spec (07-01 Wave-0 RED scaffold). UX-06.
 *
 * Behavior: "+Add products" and "Manage shop" live in the banner (top-right); a
 * "Fullscreen" button is present (enters Presentation mode, no left sidebar).
 *
 * RED until 07-04 (banner-mounted controls + Fullscreen button, D-09). The
 * controls are not in the banner yet and there is no Fullscreen button. The
 * fullscreen TRANSITION itself is human-UAT (the browser Fullscreen API is hard
 * to drive reliably in headless Chromium — the requestFullscreen permission +
 * the no-sidebar paint), so we assert only that the BUTTON exists; the live
 * transition is a manual step. Each case is test.fixme() so it registers without
 * executing. Drop the `.fixme` per case as 07-04 lands the banner.
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

// RED until 07-04 — banner-mounted controls do not exist yet.
test.fixme('UX-06 · "+Add products" and "Manage shop" live in the banner', async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const banner = page.getByTestId("present-banner");
  await expect(banner.getByRole("button", { name: /add products/i })).toBeVisible();
  await expect(banner.getByRole("button", { name: /manage shop/i })).toBeVisible();
});

// RED until 07-04 — the Fullscreen button does not exist yet. (Button PRESENCE
// only; the fullscreen transition is human-UAT — see header.)
test.fixme('UX-06 · a "Fullscreen" button is present in the banner', async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const banner = page.getByTestId("present-banner");
  await expect(banner.getByRole("button", { name: /fullscreen/i })).toBeVisible();
  // NOTE (human-UAT, NOT asserted): clicking it must enter Presentation mode
  // (no left sidebar, basket live) for Teams/Zoom presenting. The browser
  // Fullscreen API requires a real user gesture + paint that headless Chromium
  // does not honor reliably — verified manually in the phase human-UAT checklist.
});
