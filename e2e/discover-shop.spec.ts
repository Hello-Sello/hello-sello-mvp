/**
 * Buyer shop view E2E (0022, T02, HEL-56 — PLAN-T02.md rev 3).
 *
 * Behavior under test: a verified buyer at /discover/[companyId] sees the
 * seller's REAL shop — reused ShopView + ProductCard (the G2 variant-A
 * contract: "a new card component is a build failure, not a style choice") —
 * not the retired teaser tile in the current page.tsx. RED until T02 ships
 * BuyerShopView.tsx and rewrites page.tsx: today's page renders a LOCAL
 * `ProductCard` function (page.tsx:160) that never carried
 * `data-testid="product-card"`, so the primary assertion below cannot pass on
 * the unbuilt code — that is deliberate (plan "Test surface", N1).
 *
 * Supersedes e2e/present-buyer.spec.ts (B9 in the plan): that file's three
 * test.fixme cases assert this exact behaviour against `/present/[companyId]`,
 * a route the ADR says "does not exist and never will". This file carries the
 * contract at the real route instead. present-buyer.spec.ts itself is deleted
 * by T02's build (not by this test-writing pass — deletion is a source change).
 *
 * Data (grepped from supabase/seed/seed.sql, T00's visibility × price matrix,
 * not assumed — LEARNINGS L-012):
 *   - GreenLeaf Cultivation = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' (seed.sql:82).
 *   - Bob (bob@stonepharm.test / StonePharm) is seeded CONNECTED + VERIFIED to
 *     GreenLeaf (seed.sql:84 verification_status='verified'; the c2c
 *     relationship at seed.sql:308-323) — the same buyer identity
 *     e2e/present-buyer.spec.ts used for this exact scenario.
 *   - AUR-1A 'Pedanios 31/1 COS-CA' (seed.sql:391): profile_visible=true,
 *     price_public=false (seed.sql:424) — visible, price HIDDEN. This is the
 *     card Request-pricing must appear on.
 *   - AUR-1B 'Pedanios 31/1 PND-CA' (seed.sql:392): profile_visible=true,
 *     price_public=true, no rungs (seed.sql:425).
 *   - AUR-1C / AUR-1D (seed.sql:393-394, seed.sql:426-427): profile_visible=
 *     false — hidden. T06 (connection override) is a SEPARATE ticket not yet
 *     built, so even a connected buyer must not see these through T02 alone;
 *     get_discoverable_shop's WHERE clause is unconditional on
 *     p.profile_visible = true (20260816190000_tier_ladder_contract.sql:143).
 *   - AUR-1E 'Tantalus 24/1 BLB-CA' (seed.sql:400): profile_visible=true,
 *     price_public=true, 2 rungs (seed.sql:490-502).
 *
 * Sign-in mirrors present-grid.spec.ts / discover.spec.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { countPricingRequests, pricingRequestNote } from "./fixtures/two-company";
import { LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY } from "./fixtures/local-supabase";

const BUYER_EMAIL = "bob@stonepharm.test";
// Eva — a THIRD company (Bavaria Medical Cannabis GmbH, seed.sql:282-285,
// verification_status='verified'), NOT connected to GreenLeaf: only a pending
// `connect` sits in GreenLeaf's inbox (seed.sql:371). Criterion 1 is scoped to
// exactly this identity — a non-connected buyer.
const NONCONNECTED_EMAIL = "eva@bavaria.test";
const PASSWORD = "password123";
const GREENLEAF_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

async function signInBuyer(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', BUYER_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function signInEva(page: Page) {
  await page.goto("/login");
  await page.fill('input[name="email"]', NONCONNECTED_EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("a verified buyer at /discover/[companyId] sees the REAL ProductCard (G2 variant-A reuse, plan N1)", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // ProductCard.tsx:386 — the SHARED component /present also renders. The
  // teaser tile page.tsx currently builds locally never carried this testid,
  // so this cannot pass without the real rebuild (not a style regression).
  const cards = page.getByTestId("product-card");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(0);
});

test("AC 11: no save, manage-shop, Present-mode or banner/logo-edit control anywhere on the buyer's page", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // Precondition, not the point of this test: confirm we're on the real
  // ShopView-based page. Without this, every assertion below would pass
  // VACUOUSLY on today's teaser page (which also has none of these owner
  // controls, for the unrelated reason that it renders nothing from
  // ShopView at all) — that would be a false green, not a red-first pin.
  await expect(page.getByTestId("product-card").first()).toBeVisible();

  await expect(page.getByText("Manage shop", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Present mode", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("save-changes-btn")).toHaveCount(0);
  await expect(page.getByTestId("edit-logo-btn")).toHaveCount(0);
  await expect(page.getByTestId("assign-products-btn")).toHaveCount(0);
  await expect(page.getByTestId("add-product-tile")).toHaveCount(0);
  await expect(page.getByTestId("add-shop-btn")).toHaveCount(0);

  // Seller SHELF vocabulary is owner chrome too — ADR-0005: "seller-private
  // state never renders in buyer mode." Every buyer product carries
  // `location: null` (the shop RPC returns no location column until T05), so
  // before this guard the buyer's catalogue rendered under a divider header
  // reading "Unassigned", above a "Shop location" dropdown whose only option
  // was "All". Both are meaningless to a buyer, who has no shelves.
  // (critic B2, T02 — found AFTER the first green run, which is why it is
  // asserted here rather than trusted.)
  await expect(page.getByText("Unassigned", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("location-menu-btn")).toHaveCount(0);

  // Owner AUTHORING copy is owner chrome too. MediaManager gates 16 affordances
  // on `canEdit`; this hint was the one that wasn't, so the buyer's card back
  // read "Drag to re-sort · ✕ to remove" — instructions for controls that are
  // not there. Only reachable since T02 put this card on a buyer's page.
  // (visual-verifier, T02 G4.)
  await expect(page.getByText("Drag to re-sort", { exact: false })).toHaveCount(0);
});

test("a price_public=false card (AUR-1A) shows Request-pricing — proves ShopView actually wires viewerIsOwner={false}, not just that ProductCard accepts the prop (plan B3(i))", async ({ page }) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);

  // AUR-1A = 'Pedanios 31/1 COS-CA' (seed.sql:391), profile_visible=true,
  // price_public=false (seed.sql:424). T03 already shipped ProductCard's
  // gate + the data-testid="request-pricing" element (ProductCard.tsx:823) —
  // this test is reachable ONLY when ShopView's ProductCard call site
  // actually passes viewerIsOwner={viewerCanManage}, not merely that the
  // prop exists on the component. Deleting that one prop pass-through from
  // ShopView leaves every ProductCard unit test green (ADR round 4's exact
  // finding for this class of gap) — this is the test that catches it.
  const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("request-pricing")).toBeVisible();
});

/**
 * T04 (HEL-58) — per-product request pricing; retire the shop-level CTA
 * (PLAN-T04.md rev 4, Test surface table). RED until the ticket ships:
 * `ProductCard`'s `request-pricing` button's `onClick` is a no-op today
 * (`ShopView` never passes `onRequestPricing` — plan "What is already
 * standing").
 *
 * The row is asserted via SQL (`countPricingRequests` / `pricingRequestNote`),
 * not the seller's own inbox UI — round 2's design (sign in as the seller,
 * count her inbox rows) is not executable: `proxy.ts` redirects a signed-in
 * user away from `/login` and there is no sign-out helper anywhere in `e2e/`,
 * so the identity switch would hang; and `playwright.config.ts` runs one
 * worker against one shared DB, so a bare inbox count would read high across
 * tests. Serial: tests 1 and 2 share Bob's per-product ask on AUR-1A.
 */
test.describe("T04 — per-product request pricing (HEL-58)", () => {
  test.describe.configure({ mode: "serial" });

  test("#1 — the wire is live: Bob's click on AUR-1A swaps the button for a confirmation", async ({ page }) => {
    await signInBuyer(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await expect(card).toBeVisible();
    await card.getByTestId("request-pricing").click();
    // D6: the button swaps to a non-interactive "Pricing requested"
    // confirmation in its own slot — no toast primitive exists in
    // src/shared/ui/.
    await expect(card.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });
  });

  test("#2 — criterion 2: a CONNECTED buyer's ask lands as a pricelist_request naming the product (Bob, AUR-1A)", async ({ page }) => {
    await signInBuyer(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const card = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await card.getByTestId("request-pricing").click();
    await expect(card.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });

    // The write proof: exactly one live row. (Test #1 may already have
    // created it — the per-product dup-guard then correctly keeps this at 1
    // rather than adding a second, so the count is stable either way.)
    expect(countPricingRequests("StonePharm", "AUR-1A")).toBe(1);

    // D3: the note names the product — this is what makes criterion 2 true
    // "to the seller's eye" (a bare `metadata` key renders nowhere).
    const note = pricingRequestNote("StonePharm", "AUR-1A");
    expect(note).toContain("Pedanios 31/1 COS-CA");
  });

  test("#3 — criteria 1 + 3: a NON-CONNECTED buyer's ask carries metadata, and the dup-guard is per-product (Eva, AUR-1A then AUR-1F)", async ({ page }) => {
    // AUR-1F ('Zephyr 24/1 ZPH-CA' / cultivar 'Zephyr Haze', seed.sql:409) is
    // the SECOND visible, price-hidden GreenLeaf product — added by T04 for
    // this test, because with only AUR-1A in that corner "ask about A, then
    // ask about B" is not walkable at all and criterion 3 cannot be proven.
    // Its location MUST stay 'Toronto Warehouse': the matrix suite asserts
    // count(DISTINCT location) = 2 across every GreenLeaf product.
    await signInEva(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const aur1a = page.getByTestId("product-card").filter({ hasText: "Pedanios 31/1 COS-CA" });
    await expect(aur1a).toBeVisible();
    await aur1a.getByTestId("request-pricing").click();
    await expect(aur1a.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });

    // RELOAD, then ask again. The confirmation is local `asked` state — no
    // server field re-derives it — so a reload restores the button, and
    // clicking it again is the only way to prove the dup-guard is SERVER-
    // side rather than the client simply hiding a control it already fired
    // (plan "Why test 3 reloads").
    await page.reload();
    const aur1aAfterReload = page
      .getByTestId("product-card")
      .filter({ hasText: "Pedanios 31/1 COS-CA" });
    await aur1aAfterReload.getByTestId("request-pricing").click();
    await expect(aur1aAfterReload.getByText(/pricing requested/i)).toBeVisible({
      timeout: 15000,
    });
    expect(countPricingRequests("Bavaria Medical Cannabis GmbH", "AUR-1A")).toBe(1);

    // A SECOND product — the guard is per-product, never per-pair: this ask
    // must land as its own row, not be swallowed by AUR-1A's pending one.
    // Every locator here is scoped by product name (never a bare
    // getByTestId("request-pricing")) because the buyer's page now renders
    // TWO request-pricing buttons once AUR-1F is seeded (plan N11).
    const aur1f = page.getByTestId("product-card").filter({ hasText: "Zephyr Haze" });
    await expect(aur1f).toBeVisible();
    await aur1f.getByTestId("request-pricing").click();
    await expect(aur1f.getByText(/pricing requested/i)).toBeVisible({ timeout: 15000 });
    expect(countPricingRequests("Bavaria Medical Cannabis GmbH", "AUR-1F")).toBe(1);
  });
});

/**
 * T05 (HEL-59) — AC 7's full specification set actually RENDERS on a real
 * buyer's card (PLAN-T05.md rev 3, D7/B9).
 *
 * The fixture writes ONLY the 8 AC-7 facts B9 scopes it to — 9 `product`
 * columns (lineage is 2 columns): cbg_percent, cbn_percent, terpene_percent,
 * cultivator, lineage_parent_a, lineage_parent_b, irradiation_code,
 * packaging_material, resealable. It NEVER touches `location`, `profile_visible`
 * or `price_public` — all three are pinned by seed_visibility_matrix_test.sql
 * and this file's own header comment (:26-37), and a leaked write would fail
 * suites this ticket does not run. Target: AUR-1B ("Pedanios 31/1 PND-CA"),
 * visible + price-public, by NAME (never a raw id — ids are non-deterministic
 * across a `db reset`).
 *
 * Writes go through the service-role client (`local-supabase.ts`), which
 * bypasses RLS and is NOT transactional — so the original (pre-fixture) values
 * are read back BEFORE the write and restored in `afterEach`, the same
 * teardown discipline `inbox-accept.spec.ts` now uses (module header there).
 *
 * ⚠️ Correction to the plan's own phrasing (D7 says "state how the card back
 * is opened, since that is where the spec set renders"): read against
 * `ProductCard.tsx` as it stands today (T05 does not touch that file — it is
 * not in its Files table), the 8 AC-7 facts render on the card's FRONT face,
 * in the always-visible 5-value strip (CBG%/CBN%/Terp%) and the scrollable
 * spec-row list (Cultivator/Lineage/Irradiation/Packaging/Resealable) — no
 * flip needed. "The card back" in THIS codebase's own vocabulary
 * (`MediaManager.tsx:4`: "The Present card BACK — 'Documents & media'") is
 * the "Docs & media" flip panel, which renders `media` only — a fact B9
 * itself deliberately excludes from this fixture's write scope. So this test
 * asserts the front face directly; it does not click "Docs & media" at all.
 */
test.describe("T05 — AC 7 full spec set renders (HEL-59)", () => {
  const GREENLEAF_NAME = "GreenLeaf Cultivation";
  const AUR1B_CODE = "AUR-1B";
  const AUR1B_NAME = "Pedanios 31/1 PND-CA";

  const SPEC_COLUMNS = [
    "cbg_percent",
    "cbn_percent",
    "terpene_percent",
    "cultivator",
    "lineage_parent_a",
    "lineage_parent_b",
    "irradiation_code",
    "packaging_material",
    "resealable",
  ] as const;

  const FIXTURE_VALUES = {
    cbg_percent: 44.41,
    cbn_percent: 55.52,
    terpene_percent: 66.63,
    cultivator: "T05-E2E-CULTIVATOR",
    lineage_parent_a: "T05-E2E-LINEAGE-A",
    lineage_parent_b: "T05-E2E-LINEAGE-B",
    irradiation_code: "gamma", // valid FK into irradiation_type; displays "Gamma"
    packaging_material: "T05-E2E-PACKAGING",
    resealable: true, // displays "Yes"
  };

  function makeAdminClient(): SupabaseClient {
    return createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  let productId: string;
  let original: Record<string, unknown> = {};

  test.beforeEach(async () => {
    const admin = makeAdminClient();
    const { data: company, error: companyErr } = await admin
      .from("company")
      .select("id")
      .eq("name", GREENLEAF_NAME)
      .single();
    if (companyErr || !company) throw new Error(`T05 fixture: GreenLeaf lookup failed — ${companyErr?.message}`);

    const { data: product, error: productErr } = await admin
      .from("product")
      // A LITERAL select string, not `[...SPEC_COLUMNS].join(", ")`: a
      // runtime-computed string makes supabase-js infer the row as
      // `GenericStringError`, and every downstream narrowing then fails
      // TS2352. The list must stay in step with SPEC_COLUMNS above.
      .select("id, cbg_percent, cbn_percent, terpene_percent, cultivator, lineage_parent_a, lineage_parent_b, irradiation_code, packaging_material, resealable")
      .eq("company_id", company.id)
      .eq("supplier_product_code", AUR1B_CODE)
      .single();
    if (productErr || !product) throw new Error(`T05 fixture: AUR-1B lookup failed — ${productErr?.message}`);

    productId = (product as { id: string }).id;
    original = SPEC_COLUMNS.reduce<Record<string, unknown>>((acc, col) => {
      acc[col] = (product as Record<string, unknown>)[col];
      return acc;
    }, {});

    const { error: updateErr } = await admin
      .from("product")
      .update(FIXTURE_VALUES)
      .eq("id", productId);
    if (updateErr) throw new Error(`T05 fixture: AUR-1B spec-column write failed — ${updateErr.message}`);
  });

  test.afterEach(async () => {
    if (!productId) return;
    const admin = makeAdminClient();
    await admin.from("product").update(original).eq("id", productId);
  });

  test("a verified buyer sees AC 7's full spec set on AUR-1B's card front — CBG, CBN, Terp%, cultivator, lineage, irradiation code, packaging material, resealable", async ({
    page,
  }) => {
    await signInBuyer(page);
    await page.goto(`/discover/${GREENLEAF_ID}`);

    const card = page.getByTestId("product-card").filter({ hasText: AUR1B_NAME });
    await expect(card).toBeVisible();

    // 5-value strip (view mode: a <b> value immediately precedes its <small>
    // label, ProductCard.tsx:586-601) — CBG%/CBN%/Terp%.
    const cbgValue = card.getByText("CBG%", { exact: true }).locator("xpath=preceding-sibling::b[1]");
    await expect(cbgValue).toHaveText("44,41");
    const cbnValue = card.getByText("CBN%", { exact: true }).locator("xpath=preceding-sibling::b[1]");
    await expect(cbnValue).toHaveText("55,52");
    const terpValue = card.getByText("Terp%", { exact: true }).locator("xpath=preceding-sibling::b[1]");
    await expect(terpValue).toHaveText("66,63");

    // Scrollable spec-row list (view mode: a label <span> immediately precedes
    // its value <span>, ProductCard.tsx:618-633).
    const cultivatorValue = card
      .getByText("Cultivator", { exact: true })
      .locator("xpath=following-sibling::span[1]");
    await expect(cultivatorValue).toHaveText("T05-E2E-CULTIVATOR");

    const lineageValue = card.getByText("Lineage", { exact: true }).locator("xpath=following-sibling::span[1]");
    await expect(lineageValue).toHaveText("T05-E2E-LINEAGE-A × T05-E2E-LINEAGE-B");

    const irradiationValue = card
      .getByText("Irradiation", { exact: true })
      .locator("xpath=following-sibling::span[1]");
    await expect(irradiationValue).toHaveText("Gamma");

    const packagingValue = card
      .getByText("Packaging", { exact: true })
      .locator("xpath=following-sibling::span[1]");
    await expect(packagingValue).toHaveText("T05-E2E-PACKAGING");

    const resealableValue = card
      .getByText("Resealable", { exact: true })
      .locator("xpath=following-sibling::span[1]");
    await expect(resealableValue).toHaveText("Yes");
  });
});

/**
 * T05 — an unfiled product is not served to a buyer at all (G4 ruling).
 *
 * Ruled at T05's G4 (DECISIONS 2026-08-22): a product always has a location, so
 * "unfiled" is a legacy state and never reaches a buyer's shop. The earlier
 * shape of this test asserted the opposite — buyer sees the product, just not
 * the `Unassigned` label — which is the behaviour that put five cards under a
 * divider counting four. Enforced in `get_discoverable_shop`
 * (`20260822090000`), not on the page, so an unfiled row never leaves the
 * database toward a buyer.
 *
 * The owner exception is the other half: unfiled rows are filed by dragging
 * them out of the `Unassigned` pile in `AssignProductsDialog.tsx`, so the
 * owning company must keep seeing them or they are stranded forever.
 *
 * The fixture PLANTS the state: a throwaway visible product with a NULL
 * `location`. Safe against the two suites that pin this seed —
 * `seed_visibility_matrix_test.sql:96-99` explicitly tolerates a sixth product,
 * and its `count(DISTINCT location) = 2` check (`:134-139`) ignores NULLs.
 *
 * Both halves matter. "The buyer sees no unfiled product" passes on a page that
 * renders nothing at all, so the buyer half carries a control on a FILED
 * product; the seller half proves the rule is viewer-dependent, not a delete.
 */
/**
 * T05 — the spec list scrolls honestly (G4 item D).
 *
 * The list is taller than the card's fixed 640px. Two things were ruled at
 * T05's G4: the bottom row was cut through its glyphs, and a 20px fade was the
 * only hint that more existed.
 *
 * Both are CSS, so this pins the two measurable invariants behind them rather
 * than pixels: (1) the scrollbar RESERVES WIDTH — that is what distinguishes a
 * classic always-painted scrollbar from the macOS overlay bar that stays
 * invisible until you scroll, and it silently reverts to 0 the moment anyone
 * re-adds `scrollbar-width` to `.speclist-scroll` (Chromium then ignores every
 * ::-webkit-scrollbar rule); and (2) the list's bottom padding is at least as
 * tall as the fade sitting over it, which is what holds the last row clear of
 * the gradient at the end of the scroll instead of hiding it.
 */
test("the card's spec list reserves a real scrollbar and never hides its last row", async ({
  page,
}) => {
  await signInBuyer(page);
  await page.goto(`/discover/${GREENLEAF_ID}`);
  await expect(page.getByTestId("product-card").first()).toBeVisible({ timeout: 15000 });

  const geom = await page.evaluate(() => {
    const list = document.querySelector(".speclist-scroll") as HTMLElement | null;
    if (!list) return null;
    const fade = list.parentElement?.querySelector<HTMLElement>(":scope > .pointer-events-none");
    return {
      overflows: list.scrollHeight > list.clientHeight,
      scrollbarPx: list.offsetWidth - list.clientWidth,
      paddingBottomPx: parseFloat(getComputedStyle(list).paddingBottom),
      fadeHeightPx: fade ? fade.getBoundingClientRect().height : null,
    };
  });

  expect(geom).not.toBeNull();
  // precondition — if the list stopped overflowing the rest proves nothing
  expect(geom!.overflows).toBe(true);
  expect(geom!.scrollbarPx).toBeGreaterThan(0);
  expect(geom!.fadeHeightPx).not.toBeNull();
  expect(geom!.paddingBottomPx).toBeGreaterThanOrEqual(geom!.fadeHeightPx!);
});

/**
 * T05 — `supplier_product_code` is owner-only, label included (G4 item C).
 *
 * The field is seller-confidential (G3) and the buyer's RPC never projects it,
 * so the row was rendering `Supplier code — n.a.` on every buyer card: the data
 * was correctly withheld, but a WITHHELD field and an UNSET one read identically.
 * Ruled at T05's G4 — a confidential field should not advertise its existence.
 *
 * Both halves again. "The buyer sees no Supplier code" passes on a card that
 * rendered no spec rows at all, so the buyer half pins a spec row that SHOULD be
 * there; the seller half proves the row was hidden by viewer, not deleted.
 */
test("the Supplier code row is owner-only — hidden from a buyer, shown to the seller", async ({
  browser,
}) => {
  const AUR1B_NAME = "Pedanios 31/1 PND-CA";
  const buyerCtx = await browser.newContext();
  const sellerCtx = await browser.newContext();
  const buyerPage = await buyerCtx.newPage();
  const sellerPage = await sellerCtx.newPage();

  // ---- buyer: no Supplier code row, but the spec list DID render ----
  await signInBuyer(buyerPage);
  await buyerPage.goto(`/discover/${GREENLEAF_ID}`);
  const buyerCard = buyerPage.getByTestId("product-card").filter({ hasText: AUR1B_NAME });
  await expect(buyerCard).toBeVisible({ timeout: 15000 });
  // control — a spec row the buyer IS entitled to, so the absence below is the
  // rule rather than an empty card.
  await expect(buyerCard.getByText("Cultivator", { exact: true })).toBeVisible();
  await expect(buyerCard.getByText("Supplier code", { exact: true })).toHaveCount(0);

  // ---- seller: the same row on their own shop ----
  await sellerPage.goto("/login");
  await sellerPage.fill('input[name="email"]', "alice@greenleaf.test");
  await sellerPage.fill('input[name="password"]', PASSWORD);
  await sellerPage.getByRole("button", { name: /sign in/i }).click();
  await sellerPage.waitForURL((url) => !url.pathname.startsWith("/login"));
  await sellerPage.goto("/present");
  const sellerCard = sellerPage.getByTestId("product-card").filter({ hasText: AUR1B_NAME });
  await expect(sellerCard).toBeVisible({ timeout: 15000 });
  await expect(sellerCard.getByText("Supplier code", { exact: true })).toBeVisible();

  await buyerCtx.close();
  await sellerCtx.close();
});

test.describe("T05 — an unfiled product never reaches a buyer (G4 ruling)", () => {
  const THROWAWAY_CODE = "T05-NULL-LOC";
  let throwawayId: string | null = null;

  test.beforeEach(async () => {
    const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: inserted, error } = await admin
      .from("product")
      .insert({
        company_id: GREENLEAF_ID,
        name: "T05 Unfiled Product",
        supplier_product_code: THROWAWAY_CODE,
        profile_visible: true,
        price_public: true,
        location: null,
      })
      .select("id")
      .single();
    if (error || !inserted) throw new Error(`T05 unfiled fixture: insert failed — ${error?.message}`);
    throwawayId = (inserted as { id: string }).id;
  });

  test.afterEach(async () => {
    if (!throwawayId) return;
    const admin = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    // hard delete, not soft — a soft-deleted row would linger in the seed
    await admin.from("product").delete().eq("id", throwawayId);
    throwawayId = null;
  });

  test("a buyer is not served an unfiled product, but the seller still is", async ({ browser }) => {
    const buyerCtx = await browser.newContext();
    const sellerCtx = await browser.newContext();
    const buyerPage = await buyerCtx.newPage();
    const sellerPage = await sellerCtx.newPage();

    // ---- buyer: the unfiled product is not served at all ----
    await signInBuyer(buyerPage);
    await buyerPage.goto(`/discover/${GREENLEAF_ID}`);
    // control FIRST — the shop rendered and this buyer can read it, so the
    // absence asserted below is the rule and not an empty or broken page.
    await expect(buyerPage.getByTestId("product-card").first()).toBeVisible({ timeout: 15000 });
    await expect(
      buyerPage.getByTestId("product-card").filter({ hasText: "T05 Unfiled Product" }),
    ).toHaveCount(0);
    await expect(buyerPage.getByText("Unassigned", { exact: true })).toHaveCount(0);

    // ---- seller: the SAME product's shelf label IS shown, on their own shop ----
    await sellerPage.goto("/login");
    await sellerPage.fill('input[name="email"]', "alice@greenleaf.test");
    await sellerPage.fill('input[name="password"]', PASSWORD);
    await sellerPage.getByRole("button", { name: /sign in/i }).click();
    await sellerPage.waitForURL((url) => !url.pathname.startsWith("/login"));
    await sellerPage.goto("/present");
    await expect(
      sellerPage.getByTestId("product-card").filter({ hasText: "T05 Unfiled Product" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(sellerPage.getByText("Unassigned", { exact: true }).first()).toBeVisible();

    await buyerCtx.close();
    await sellerCtx.close();
  });
});
