/**
 * Discover E2E (Lane B, Variant D) — the reworked LinkedIn-style Discover page.
 *
 * Behavior under test: /discover renders the Variant D layout — an ads-leaderboard
 * PLACEHOLDER, the Requests | My Network duo SIDE BY SIDE (equal-height boxes), a
 * "People you may know" card grid, and the Companies directory whose Company-type
 * filter is a multi-select DROPDOWN (not pills). This is the permanent capture of
 * the manual "live-browser pass" the unit tests can't do — those render via
 * `renderToStaticMarkup` with no jsdom, so they see structure but never layout.
 *
 * Data: seeded alice@greenleaf.test (GreenLeaf, verified) — she has connected
 * people + companies (My Network) and discoverable companies, but NO incoming
 * requests, so the Requests box shows its empty state. Assertions avoid exact seed
 * counts except where the empty state is itself the point.
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

/** The <section> a given level-2 section heading lives in. */
const sectionByHeading = (page: Page, name: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name }) });

test("Discover renders every Variant D section", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");

  // Ads = a leaderboard PLACEHOLDER (no fake creatives).
  await expect(page.getByText("Your ad could be here")).toBeVisible();

  // The duo + the two full-width sections are all present.
  await expect(page.getByRole("heading", { level: 2, name: "Connection requests" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "My network" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "People you may know" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Companies" })).toBeVisible();
});

test("Requests | My Network are an equal-height, side-by-side duo", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");

  const requests = sectionByHeading(page, "Connection requests");
  const network = sectionByHeading(page, "My network");
  const reqBox = await requests.boundingBox();
  const netBox = await network.boundingBox();
  expect(reqBox).not.toBeNull();
  expect(netBox).not.toBeNull();

  // Side by side: Requests sits entirely left of My Network (not stacked).
  expect(reqBox!.x + reqBox!.width).toBeLessThanOrEqual(netBox!.x + 4);
  // Same row: their tops align within a small tolerance.
  expect(Math.abs(reqBox!.y - netBox!.y)).toBeLessThanOrEqual(6);
  // Equal height: the fixed-height duo boxes match.
  expect(Math.abs(reqBox!.height - netBox!.height)).toBeLessThanOrEqual(2);

  // Alice has no incoming requests → the box holds its column with an empty state
  // (it does NOT vanish, which is what keeps the duo balanced).
  await expect(requests.getByText(/no pending requests/i)).toBeVisible();
});

test("My Network shows connected people (Message) + verified company logos", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");
  const network = sectionByHeading(page, "My network");

  // Person connections carry a Message affordance (the company-less DM, PG-13).
  await expect(network.getByRole("link", { name: /message/i }).first()).toBeVisible();
  // Company logos carry the verified tick (Discover is verified-only).
  expect(await network.locator('[aria-label="Verified"]').count()).toBeGreaterThan(0);
});

test("Companies directory filters via the multi-select Company-type DROPDOWN", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");
  const companies = sectionByHeading(page, "Companies");

  // Search + BOTH filter dropdowns present (the type filter is a dropdown, not pills).
  await expect(companies.getByPlaceholder(/search companies by name/i)).toBeVisible();
  const typeTrigger = companies.getByRole("button", { name: /^company type$/i });
  await expect(typeTrigger).toBeVisible();
  await expect(companies.getByRole("button", { name: /all countries/i })).toBeVisible();

  // Opening the type dropdown reveals its options.
  await typeTrigger.click();
  const wholesaler = page.getByRole("button", { name: /wholesaler/i });
  await expect(wholesaler).toBeVisible();

  // Selecting one filters live: close the panel, then the trigger reflects the
  // selection and a removable ACTIVE chip appears.
  await wholesaler.click();
  await companies.getByRole("heading", { level: 2, name: "Companies" }).click();
  await expect(companies.getByRole("button", { name: /1 selected/i })).toBeVisible();
  await expect(companies.getByText("Active")).toBeVisible();
});
