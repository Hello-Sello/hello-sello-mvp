/**
 * Phase 7 — Present info-card E2E spec (07-05, UX-05).
 *
 * Behavior: equal-height info boxes clamp overflow and reveal it on click; the
 * expanded panel is solid-white and sits ABOVE the flip-card grid (own stacking
 * context); it collapses on the ✕ or a click-away. The company description is
 * hard-capped at 2600 characters in edit mode.
 *
 * These drive the ABOUT box: it is the one that implements UX-05's reveal.
 * `InfoBox` offers an expander only when `more` is set AND (for `moreOnOverflow`)
 * the preview is measurably clipped — and the Location box passes `more` only
 * while editing, so in read mode it has nothing to expand.
 *
 * ⚠️ MUTATES the local seed: GreenLeaf's description is replaced with one long
 * enough to clamp and restored afterwards. The restore is byte-exact via
 * `quote_nullable` and is read back to prove it landed; an interrupted run is
 * detected and healed on the next `beforeAll`.
 */
import { test, expect, type Page } from "@playwright/test";
import { psqlValue, psqlExec } from "./fixtures/catalog";
import { ALICE_EMAIL, ALICE_PASSWORD, ALICE_COMPANY_ID } from "./fixtures/auth-gate-fixtures";

/** Comfortably past the `line-clamp-2` preview in a third-width box, so the
 *  measurement sees a real overflow and not a marginal one that flips with font
 *  metrics. Doubles as the leak marker below. */
const LONG_DESCRIPTION =
  "GreenLeaf Cultivation is an EU-GMP certified cultivator supplying pharmacies " +
  "and distributors across Germany and Austria. We run three indoor facilities " +
  "with fully sealed environmental control, batch-level terpene analysis, and " +
  "irradiation-free processing on selected cultivars. Every delivery ships with " +
  "a certificate of analysis and full chain-of-custody documentation.";

/** A one-liner that cannot clamp — the negative half of the contract. */
const SHORT_DESCRIPTION = "Short.";

const descriptionSql = `select description from company where id = '${ALICE_COMPANY_ID}'`;

/** The seeded value as a SQL LITERAL (`NULL` or a fully-quoted string), so the
 *  restore is byte-exact. Reading it as text and re-quoting by hand loses the
 *  NULL/'' distinction and any trailing whitespace `psqlValue` trims. */
let seededLiteral: string | undefined;

function setDescription(literal: string) {
  psqlExec(`update company set description = ${literal} where id = '${ALICE_COMPANY_ID}'`);
}

test.beforeAll(() => {
  const captured = psqlValue(
    `select quote_nullable(description) from company where id = '${ALICE_COMPANY_ID}'`,
  );
  // Heal a previous run that died between beforeAll and afterAll: without this
  // the leaked LONG_DESCRIPTION is captured as if it were the seed and then
  // faithfully restored, so the real value is lost for good.
  seededLiteral = psqlValue(descriptionSql) === LONG_DESCRIPTION ? "null" : captured;
  setDescription(`'${LONG_DESCRIPTION.replace(/'/g, "''")}'`);
});

test.afterAll(() => {
  // `undefined` means the capture never completed — restoring anything then would
  // be guessing, and the guess that used to live here wrote NULL over the row.
  if (seededLiteral === undefined) return;
  setDescription(seededLiteral);
  // Read back in a separate query: `update … where <no match>` is not a SQL
  // error, so ON_ERROR_STOP cannot catch a restore that silently changed nothing.
  const now = psqlValue(`select quote_nullable(description) from company where id = '${ALICE_COMPANY_ID}'`);
  expect(now, "the seeded description was not restored").toBe(seededLiteral);
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', ALICE_EMAIL);
  await page.fill('input[name="password"]', ALICE_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}


/**
 * The About box, once it is actually expandable.
 *
 * `InfoBox` decides whether to offer an expander by MEASURING the preview after
 * mount (`moreOnOverflow` → a ResizeObserver sets `clipped`), and the card's own
 * onClick is a no-op until that resolves. Clicking straight after navigation is
 * therefore a race — it passed about half the time. The "More" button is the
 * user-visible signal that the measurement landed, so waiting on it is both the
 * fix and what a real user waits for.
 */
async function expandableAboutCard(page: Page) {
  const card = page.getByTestId("info-card-about");
  await expect(card.getByRole("button", { name: /^More$/ })).toBeVisible();
  return card;
}

test("UX-05 · an info card expands on click to reveal more", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = await expandableAboutCard(page);
  await expect(card.getByTestId("info-more")).toBeHidden();
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
});

test("UX-05 · the info card collapses on the ✕", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = await expandableAboutCard(page);
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  await card.getByRole("button", { name: /close/i }).click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});

test("UX-05 · the info card collapses on click-away", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = await expandableAboutCard(page);
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  // click outside the card (the banner) collapses it.
  await page.getByTestId("present-banner").click();
  await expect(card.getByTestId("info-more")).toBeHidden();
});

test("UX-05 · the expanded info panel sits above the product grid", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  const card = await expandableAboutCard(page);
  await card.click();
  await expect(card.getByTestId("info-more")).toBeVisible();
  // its own stacking context is elevated above the flip-card grid (bug-2 fix).
  const z = await card.evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(z)).toBeGreaterThanOrEqual(10);
});

test("UX-05 · the description field is capped at 2600 characters", async ({ page }) => {
  await signIn(page);
  await page.goto("/present");
  await page.getByRole("button", { name: /manage shop/i }).click();
  const desc = page.getByRole("textbox", { name: /company description/i });
  await expect(desc).toHaveAttribute("maxlength", "2600");
});

/**
 * The other half of `moreOnOverflow`'s contract, and the half nothing pinned:
 * a description that fits must NOT offer a "More" that reveals nothing. Without
 * this, replacing the whole measurement with `hasMore = Boolean(more)` keeps
 * every other test in this file green.
 */
test("UX-05 · a short description offers no More — the expander is measured, not assumed", async ({
  page,
}) => {
  setDescription(`'${SHORT_DESCRIPTION}'`);
  try {
    await signIn(page);
    await page.goto("/present");
    const card = page.getByTestId("info-card-about");
    await expect(card.getByText(SHORT_DESCRIPTION)).toBeVisible();
    await expect(card.getByRole("button", { name: /^More$/ })).toHaveCount(0);
    // And clicking the card does not open a panel that has nothing to show.
    await card.click();
    await expect(card.getByTestId("info-more")).toHaveCount(0);
  } finally {
    setDescription(`'${LONG_DESCRIPTION.replace(/'/g, "''")}'`);
  }
});
