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
 * people + companies (My Network), discoverable companies, and incoming requests
 * (seed.sql 5f + 7c). The layout case below does NOT lean on those: 5f's guard
 * matches on sender company alone, with no `status` filter, so once someone
 * accepts those rows in a manual walk they are never re-seeded and any test
 * anchored to them fails until a full `db reset`. It mints and removes its own
 * request instead. Assertions avoid exact seed counts.
 *
 * Sign-in mirrors present-grid.spec.ts (seeded alice@greenleaf.test).
 */
import { test, expect, type Page } from "@playwright/test";
import { psqlExec, psqlValue } from "./fixtures/catalog";

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
  await expect(page.getByRole("heading", { level: 2, name: "Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "My network" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "People you may know" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Companies" })).toBeVisible();
});

test("Requests | My Network are an equal-height, side-by-side duo", async ({ page }) => {
  await signIn(page);
  await page.goto("/discover");

  const requests = sectionByHeading(page, "Requests");
  const network = sectionByHeading(page, "My network");
  const reqBox = await requests.boundingBox();
  const netBox = await network.boundingBox();
  expect(reqBox).not.toBeNull();
  expect(netBox).not.toBeNull();

  // Side by side: Requests sits entirely left of My Network (not stacked).
  expect(reqBox!.x + reqBox!.width).toBeLessThanOrEqual(netBox!.x + 4);
  // Same row: their tops align within a small tolerance.
  expect(Math.abs(reqBox!.y - netBox!.y)).toBeLessThanOrEqual(6);
  // Equal height: the fixed-height duo boxes match — this geometry is what proves
  // the side-by-side layout regardless of how many requests the seed carries.
  expect(Math.abs(reqBox!.height - netBox!.height)).toBeLessThanOrEqual(2);
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


// ── Layout regression: a request row must not spill out of its card ──────────
// The WHY (viewport breakpoints cannot see this row's width) is owned by
// `RequestsSection.tsx`'s Row comment and deliberately not restated here.
//
// This mints its own pending request rather than using seed 5f's, for the
// reason in the header: 5f does not heal once accepted.
const FIXTURE_MARK = "e2e-discover-layout";

function addPendingRequest() {
  psqlExec(`
    insert into pending_inbox_item
      (type, sender_person_id, sender_company_id, receiver_company_id, note, status, metadata)
    select 'connect',
      (select id from auth.users where email = 'eva@bavaria.test'),
      (select id from company where name = 'Bavaria Medical Cannabis GmbH'),
      (select id from company where name = 'GreenLeaf Cultivation'),
      'Layout fixture — a note long enough to exercise the truncating name column.',
      'pending', jsonb_build_object('seed', '${FIXTURE_MARK}')`);
}

function removePendingRequest() {
  psqlExec(`delete from pending_inbox_item where metadata->>'seed' = '${FIXTURE_MARK}'`);
}

test.describe("Requests row layout", () => {
  test.beforeAll(() => {
    removePendingRequest(); // in case a previous run died before its cleanup
    addPendingRequest();
    expect(
      psqlValue(`select count(*) from pending_inbox_item where metadata->>'seed' = '${FIXTURE_MARK}'`),
    ).toBe("1");
  });
  test.afterAll(removePendingRequest);

  test("a request row never spills out of its card, from 390px up", async ({ page }) => {
    await signIn(page);
    await page.goto("/discover");
    const requests = sectionByHeading(page, "Requests");
    // Positive anchor: with no row there is nothing to overflow and every
    // assertion below would be vacuously true.
    await expect(requests.getByRole("button", { name: "Accept" }).first()).toBeVisible();

    for (const width of [1440, 1280, 1024, 900, 768, 600, 480, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const m = await requests.evaluate((section) => {
        // Measure against the BODY's content box, not the section's border box:
        // the body is px-[18px] and, in the duo, carries a vertical scrollbar, so
        // measuring the outer box would hand back ~33px of free overflow before
        // anything registered.
        const body = section.lastElementChild as HTMLElement;
        const box = body.getBoundingClientRect();
        const cs = getComputedStyle(body);
        const left = box.left + parseFloat(cs.paddingLeft);
        const right = box.left + body.clientWidth - parseFloat(cs.paddingRight);
        let worst = 0;
        // `*`, not a tag whitelist — svg icons, the role="alert" line and any
        // future affordance all count.
        for (const el of body.querySelectorAll<HTMLElement>("*")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0) continue; // not rendered
          worst = Math.max(worst, Math.round(r.right - right), Math.round(left - r.left));
        }
        const cols = getComputedStyle(section.parentElement as HTMLElement).gridTemplateColumns;
        return { worst, columns: cols.split(" ").length, cardWidth: Math.round(box.width) };
      });

      // 768px is in the sweep because it is the worst case, not a sample:
      // `md:grid-cols-2` switches on at exactly that width. Assert the duo really
      // IS two columns there, so that retuning the breakpoint cannot quietly turn
      // this into a roomy single-column measurement that passes for free.
      if (width >= 768) {
        expect(m.columns, `the duo should be two columns at ${width}px`).toBe(2);
      }
      expect(
        m.worst,
        `content spills ${m.worst}px out of the ${m.cardWidth}px Requests card at ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  });
});

// 320px is knowingly out of this sweep: the card body is ~50px there and the
// Decline/Accept pair cannot go below ~77px, so it would need the buttons to
// become icons. 390px (the width actually reported) passes.
