/**
 * App-chrome popovers + external links.
 *
 * The rail's profile card and the top bar's basket open from inside `.glass`
 * bars. Safari applies the glass backdrop-filter, which makes each bar its own
 * stacking context and the containing block for `position: fixed` — so a panel
 * rendered inside one hid behind page content and could not be tapped away.
 * Chromium (our e2e browser) never showed it, because the CSS build keeps only
 * `-webkit-backdrop-filter`, which Chromium ignores. Each test injects the
 * standard property so Chromium lays the page out the way Safari does.
 *
 * The link case: a company website saved without https:// must still link out,
 * not resolve relative to our own page.
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { psqlValue, psqlExec } from "./fixtures/catalog";

test.describe.configure({ mode: "serial" });

const GREENLEAF_COMPANY_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const EMAIL = "alice@greenleaf.test";
const PASSWORD = "password123";

async function openPresent(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  await page.goto("/present");
  await expect(page.getByTestId("product-card").first()).toBeVisible();
  await page.addStyleTag({
    content: ".glass{backdrop-filter:blur(20px)}.glass-strong{backdrop-filter:blur(24px)}",
  });
}

/** True when nothing is painted over the panel at its centre and near its corners. */
async function isOnTop(panel: Locator): Promise<boolean> {
  return panel.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]].every(([fx, fy]) => {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      return !!hit && el.contains(hit);
    });
  });
}

test("the profile card opens above the page and closes on a click outside it", async ({ page }) => {
  await openPresent(page);
  const vp = page.viewportSize()!;

  await page.locator('aside button[aria-haspopup="menu"]').click();
  const card = page.getByTestId("account-popover");
  await expect(card).toBeVisible();
  expect(await isOnTop(card)).toBe(true);

  await page.mouse.click(vp.width * 0.75, vp.height * 0.6);
  await expect(card).toHaveCount(0);
});

test("the basket opens above the page and closes on a click outside it or Escape", async ({ page }) => {
  await openPresent(page);
  const vp = page.viewportSize()!;
  const trigger = page.locator('header button[aria-label="Basket"]');
  const basket = page.getByRole("menu", { name: "Your basket" });

  await trigger.click();
  await expect(basket).toBeVisible();
  expect(await isOnTop(basket)).toBe(true);

  await page.mouse.click(vp.width * 0.3, vp.height * 0.8);
  await expect(basket).toHaveCount(0);

  await trigger.click();
  await expect(basket).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(basket).toHaveCount(0);
});

test("a website saved without https:// links out, not into our own site", async ({ page }) => {
  const before = psqlValue(`select coalesce(website, '') from company where id = '${GREENLEAF_COMPANY_ID}'`);
  psqlExec(`update company set website = 'www.greenleaf-e2e.example' where id = '${GREENLEAF_COMPANY_ID}'`);
  try {
    await openPresent(page);
    await expect(page.getByRole("link", { name: "Website" }).first()).toHaveAttribute(
      "href",
      "https://www.greenleaf-e2e.example",
    );
  } finally {
    const restore = before ? `'${before.replace(/'/g, "''")}'` : "null";
    psqlExec(`update company set website = ${restore} where id = '${GREENLEAF_COMPANY_ID}'`);
  }
});
