/**
 * Render contract for the ProductCard buy/ask gate (0022, T03 — PLAN-T03.md rev 2).
 *
 * The gate under test (PLAN-T03.md §2, implemented in this same change):
 *
 *   priceShown = !editing && pricePublic && price_per_gram != null   // :365
 *   canBuy     = !editing && (priceShown || viewerIsOwner)           // :369
 *   canAsk     = !editing && !viewerIsOwner && !pricePublic          // :377
 *
 * `canAsk` is deliberately NOT the complement of `canBuy`: it keys off
 * `pricePublic`, not `!priceShown`, so a merely-unpriced PUBLIC product renders
 * NEITHER control. ADR-0005 :566-567 restricts the ask to prices the seller
 * deliberately hid, and the DB keeps the two states apart on purpose
 * (20260816190000:96-97). That empty cell has its own named test below — it is
 * the single behaviour a future reader is most likely to "fix" into a
 * complement.
 *
 * Render path: `react-dom/server` `renderToStaticMarkup` — the repo's pure-node
 * vitest env (`ProductCard.panel.test.tsx:1-25` precedent; no jsdom, initial
 * paint only — `pricesOpen` etc. are local state and out of scope here).
 *
 * Written RED-first, before any source existed: the buy row was then gated on
 * `!editing` ALONE, so every read-mode card rendered the stepper + Add-to-basket
 * regardless of price state, and no Request-pricing control existed. 6 of these
 * 32 cases failed for that reason; the other 26 pinned already-correct behaviour.
 */
import type { ComponentProps } from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "./ProductCard";
import type { ShopProduct } from "../shop";

/** Minimal complete ShopProduct — every required field, overridable per case.
 *  Copied from the `ProductCard.panel.test.tsx` factory (same precedent). */
function makeProduct(overrides: Partial<ShopProduct> = {}): ShopProduct {
  return {
    id: "prod-1",
    name: "Aurora 22",
    cultivar: null,
    thc_percent: 22,
    cbd_percent: 1,
    cbg_percent: null,
    cbn_percent: null,
    cultivator: null,
    lineage_parent_a: null,
    lineage_parent_b: null,
    irradiation_code: null,
    supplier_product_code: null,
    packaging_material: null,
    resealable: null,
    location: null,
    pack_size_grams: 10,
    unit_code: "g",
    local_code_pzn: null,
    dominance_code: null,
    country_of_origin: null,
    region: null,
    images: [],
    media: [],
    batches: [],
    terpPercent: null,
    profile_visible: true,
    price_public: true,
    price_per_gram: 6,
    bundle_threshold_grams: null,
    bundle_price_per_gram: null,
    tiers: [],
    packSizes: [],
    ...overrides,
  };
}

/** The absent-`profile_visible` fixture (regression case): builds a full
 *  product, then drops the key entirely — not `undefined` assigned, actually
 *  ABSENT — matching what a T02/T05 mapper that never sets the field would
 *  produce. `shop.ts:72` is still required today, hence the cast. */
function makeProductWithoutProfileVisible(
  overrides: Partial<Omit<ShopProduct, "profile_visible">> = {},
): ShopProduct {
  const full = makeProduct(overrides);
  const { profile_visible: _drop, ...rest } = full;
  void _drop;
  // No cast needed: T03 made `profile_visible` optional, so
  // `Omit<ShopProduct, "profile_visible">` is directly assignable to `ShopProduct`.
  return rest;
}

/** The gate-relevant props, taken FROM the component's own type rather than
 *  redeclared — so a rename or signature change on `ProductCard` breaks this
 *  test at compile time instead of silently passing props it ignores. (The
 *  RED phase used an `any` cast because these props did not exist yet; keeping
 *  it would have thrown away type coverage of the exact props under test.) */
type GateProps = Pick<
  ComponentProps<typeof ProductCard>,
  "editing" | "viewerIsOwner" | "onRequestPricing"
>;

function renderCard(product: ShopProduct, props: GateProps = {}): string {
  return renderToStaticMarkup(<ProductCard product={product} {...props} />);
}

const BUY_ROW_MARKERS = [
  'aria-label="Decrease quantity"',
  'aria-label="Increase quantity"',
  "Add to basket",
];

/** TRUE only when the whole buy row is present — use for positive assertions. */
function hasBuyRow(html: string): boolean {
  return BUY_ROW_MARKERS.every((m) => html.includes(m));
}

/** TRUE if ANY buy-row marker survives — use for NEGATIVE assertions.
 *  The criterion is "no quantity control AND no add-to-basket", so the negative
 *  must be `!hasAnyBuyMarker`, not `!hasBuyRow`: an AND-of-three returns false
 *  when just one marker is missing, which would let a stepper stay on screen
 *  with only the Add button gone and still pass. Today the three share one JSX
 *  block, so they cannot diverge — this asserts the CRITERION rather than the
 *  current implementation's happening-to-be-atomic. */
function hasAnyBuyMarker(html: string): boolean {
  return BUY_ROW_MARKERS.some((m) => html.includes(m));
}

/** The Request-pricing control's contract (new, defined by this test): a
 *  `data-testid="request-pricing"` element whose `aria-label` — its
 *  accessible name — carries the product's name (AC 3). Returns that
 *  aria-label, or null if no such control rendered. */
/** `renderToStaticMarkup` HTML-escapes attribute text, so a product name like
 *  "Alice's Kush" arrives as "Alice&#x27;s Kush". The browser DOM would expose
 *  the decoded name to a screen reader, so decode before asserting — otherwise
 *  the test fails on correct behaviour purely because of the serialisation. */
function decodeEntities(text: string): string {
  return text
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&amp;/g, "&"); // last — never re-decode an entity we just produced
}

function requestPricingAriaLabel(html: string): string | null {
  const tag = html.match(/<[a-zA-Z]+\b[^>]*data-testid="request-pricing"[^>]*>/);
  if (!tag) return null;
  const label = tag[0].match(/aria-label="([^"]*)"/);
  return label ? decodeEntities(label[1]) : null;
}

function hasRequestPricing(html: string): boolean {
  return requestPricingAriaLabel(html) !== null;
}

const priced = { price_public: true, price_per_gram: 6 } as const;
const unpriced = { price_public: true, price_per_gram: null } as const;
const hiddenPriced = { price_public: false, price_per_gram: 6 } as const;
const hiddenUnpriced = { price_public: false, price_per_gram: null } as const;

describe("<ProductCard> buy/ask gate (T03)", () => {
  // ── The full grid: editing × pricePublic × price_per_gram × viewerIsOwner ──
  // 16 combinations. `expected` is hand-derived from the gate formulas in the
  // file header, not recomputed from them here — this is the oracle, not a
  // restatement of the implementation.
  const grid: Array<{
    editing: boolean;
    pricePublic: boolean;
    priceSet: boolean;
    viewerIsOwner: boolean;
    expected: "buy" | "ask" | "neither";
  }> = [
    { editing: false, pricePublic: false, priceSet: false, viewerIsOwner: false, expected: "ask" },
    { editing: false, pricePublic: false, priceSet: false, viewerIsOwner: true, expected: "buy" },
    { editing: false, pricePublic: false, priceSet: true, viewerIsOwner: false, expected: "ask" },
    { editing: false, pricePublic: false, priceSet: true, viewerIsOwner: true, expected: "buy" },
    { editing: false, pricePublic: true, priceSet: false, viewerIsOwner: false, expected: "neither" },
    { editing: false, pricePublic: true, priceSet: false, viewerIsOwner: true, expected: "buy" },
    { editing: false, pricePublic: true, priceSet: true, viewerIsOwner: false, expected: "buy" },
    { editing: false, pricePublic: true, priceSet: true, viewerIsOwner: true, expected: "buy" },
    { editing: true, pricePublic: false, priceSet: false, viewerIsOwner: false, expected: "neither" },
    { editing: true, pricePublic: false, priceSet: false, viewerIsOwner: true, expected: "neither" },
    { editing: true, pricePublic: false, priceSet: true, viewerIsOwner: false, expected: "neither" },
    { editing: true, pricePublic: false, priceSet: true, viewerIsOwner: true, expected: "neither" },
    { editing: true, pricePublic: true, priceSet: false, viewerIsOwner: false, expected: "neither" },
    { editing: true, pricePublic: true, priceSet: false, viewerIsOwner: true, expected: "neither" },
    { editing: true, pricePublic: true, priceSet: true, viewerIsOwner: false, expected: "neither" },
    { editing: true, pricePublic: true, priceSet: true, viewerIsOwner: true, expected: "neither" },
  ];

  it.each(grid)(
    "editing=$editing pricePublic=$pricePublic priceSet=$priceSet viewerIsOwner=$viewerIsOwner → $expected",
    ({ editing, pricePublic, priceSet, viewerIsOwner, expected }) => {
      const product = makeProduct({
        price_public: pricePublic,
        price_per_gram: priceSet ? 6 : null,
      });
      const html = renderCard(product, { editing, viewerIsOwner });

      // Positive: the WHOLE buy row. Negative: not a single marker survives —
      // see `hasAnyBuyMarker` for why the negative cannot use `!hasBuyRow`.
      if (expected === "buy") expect(hasBuyRow(html)).toBe(true);
      else expect(hasAnyBuyMarker(html)).toBe(false);
      expect(hasRequestPricing(html)).toBe(expected === "ask");
    },
  );

  // ── Named: editing always wins, in every combination ───────────────────────
  // Called out separately per the ticket: the owner-with-null-price case below
  // passes with OR without the `!editing` guard (viewerIsOwner alone already
  // makes canBuy true), so a grid-only assertion would not catch its loss if
  // some future edit dropped `!editing` from `canBuy`.
  describe("editing=true → no buy row, in every combination", () => {
    const nonEditingCombos = grid.filter((r) => !r.editing);
    it.each(nonEditingCombos)(
      "same product state as pricePublic=$pricePublic priceSet=$priceSet viewerIsOwner=$viewerIsOwner, but editing → no buy row",
      ({ pricePublic, priceSet, viewerIsOwner }) => {
        const product = makeProduct({
          price_public: pricePublic,
          price_per_gram: priceSet ? 6 : null,
        });
        const html = renderCard(product, { editing: true, viewerIsOwner });
        expect(hasAnyBuyMarker(html)).toBe(false);
      },
    );
  });

  it("editing=true, owner, null price → still no buy row (the case nothing else catches)", () => {
    // Without `!editing` in `canBuy`, `viewerIsOwner: true` alone would make
    // this render the buy row — `priceShown` is false either way (null price),
    // so this is the ONE case that isolates the `!editing` guard specifically.
    const product = makeProduct({ price_public: false, price_per_gram: null });
    const html = renderCard(product, { editing: true, viewerIsOwner: true });
    expect(hasAnyBuyMarker(html)).toBe(false);
  });

  // ── Named: the deliberate empty cell ────────────────────────────────────────
  it("price_public=true, price_per_gram=null, non-owner → NEITHER buy row nor Request-pricing renders (the empty cell, ADR-0005 :566-567)", () => {
    // This is the cell rev 1 of the plan collapsed by mistake: Request-pricing
    // is for a seller's DELIBERATE `price_public=false`, never for a merely
    // unpriced public product (`price_public=true`, `price_per_gram=null`).
    // ADR-0005 forbids the ask here twice (:538-539, :566-567) because the DB
    // keeps "price on request" and "price not set yet" as distinct states on
    // purpose (`20260816190000:96-97`). Do NOT "fix" this back into a strict
    // buy/ask complement — that re-introduces the exact collapse the ADR rules
    // out.
    const product = makeProduct(unpriced);
    const html = renderCard(product, { editing: false, viewerIsOwner: false });
    expect(hasAnyBuyMarker(html)).toBe(false);
    expect(hasRequestPricing(html)).toBe(false);
  });

  // ── Named: `viewerIsOwner` omitted → today's behaviour, unchanged ──────────
  describe("viewerIsOwner omitted → renders exactly as today (the /present guarantee)", () => {
    it("price public + priced, viewerIsOwner omitted → buy row renders", () => {
      const product = makeProduct(priced);
      const html = renderCard(product, { editing: false });
      expect(hasBuyRow(html)).toBe(true);
    });

    it("price hidden, viewerIsOwner omitted → buy row STILL renders (today's live defect, unfixed until the prop is supplied)", () => {
      // This pins the default: `viewerIsOwner` defaults to `true`, so a caller
      // that never passes it (i.e. `/present` before T02 wires the prop) gets
      // `canBuy ≡ !editing`, identical to today. It is NOT the T03 fix in
      // effect — it is the explicit guarantee that omitting the prop cannot
      // change `/present`'s behaviour.
      const product = makeProduct(hiddenPriced);
      const html = renderCard(product, { editing: false });
      expect(hasBuyRow(html)).toBe(true);
    });

    it("price hidden, viewerIsOwner omitted, editing → no buy row (editing still wins)", () => {
      const product = makeProduct(hiddenUnpriced);
      const html = renderCard(product, { editing: true });
      expect(hasAnyBuyMarker(html)).toBe(false);
    });
  });

  // ── Named: `profile_visible` absent → no "Hidden" badge ────────────────────
  it("profile_visible absent from the product → renders NO 'Hidden' badge", () => {
    // Today: `{!p.profile_visible && …}` (`ProductCard.tsx:475`) treats
    // `undefined` as falsy-visible, i.e. TRUE — the badge renders. T03 must
    // become `p.profile_visible === false`. Read mode only; editing mode's
    // Visible/Hidden toggle chrome is a different branch and out of scope.
    const product = makeProductWithoutProfileVisible();
    const html = renderCard(product, { editing: false, viewerIsOwner: false });
    expect(html).not.toContain("Hidden");
  });

  // ── G5 F-03: the badge left the shop view; ONE signal took its place ──────
  //
  // This block REPLACES a test that asserted the opposite — that a read-mode
  // card renders a "Hidden" pill. That contract was reversed deliberately
  // (Muskan, 2026-08-24): the read-mode branch is the seller's own preview of
  // the STOREFRONT, and shelf bookkeeping does not belong there. The rule it
  // guarded — that a real `profile_visible === false` is never silently
  // swallowed — is not weakened, it MOVED: cases 2 and 4 below now carry it,
  // and they are stricter, because they also pin the reason text the old badge
  // never had.
  const CHIP = 'data-testid="buyer-visibility-gap"';

  it("read mode: profile_visible=false renders NO visibility badge (the storefront preview is clean)", () => {
    const product = makeProduct({ profile_visible: false, location: "Berlin" });
    const html = renderCard(product, { editing: false, viewerIsOwner: false });
    expect(html).not.toContain(CHIP);
    expect(html).not.toContain("Not visible to buyers");
  });

  it("Manage mode: profile_visible=false renders the chip and names 'hidden'", () => {
    // `location` is set so 'hidden' is the ONLY gap — otherwise the factory's
    // default `location: null` would add 'no location' and this case could pass
    // while the hidden term was broken.
    const product = makeProduct({ profile_visible: false, location: "Berlin" });
    const html = renderCard(product, { editing: true });
    expect(html).toContain(CHIP);
    expect(html).toContain("Not visible to buyers");
    expect(html).toContain("hidden");
    expect(html).not.toContain("no location");
  });

  it("Manage mode: a visible, FILED product renders no chip at all", () => {
    const product = makeProduct({ profile_visible: true, location: "Berlin" });
    const html = renderCard(product, { editing: true });
    expect(html).not.toContain(CHIP);
  });

  it("Manage mode: a visible but UNFILED product still says it is not visible to buyers", () => {
    // The case F-03 exists for. Before this change the seller saw nothing at
    // all here: `profile_visible` is true, so the old badge stayed silent while
    // `get_discoverable_shop`'s `location is not null` term withheld the row
    // from every buyer. This is the assertion that would have caught Aurora's
    // empty shop on production.
    const product = makeProduct({ profile_visible: true, location: null });
    const html = renderCard(product, { editing: true });
    expect(html).toContain(CHIP);
    expect(html).toContain("no location");
  });

  it("read mode: an unfiled product leaks no shelf state to the storefront preview", () => {
    const product = makeProduct({ profile_visible: true, location: null });
    const html = renderCard(product, { editing: false, viewerIsOwner: false });
    expect(html).not.toContain(CHIP);
  });

  // ── Named: the Request-pricing control names the product ──────────────────
  it("Request-pricing control's accessible name carries the product's name (AC 3)", () => {
    const alice = makeProduct({ id: "prod-alice", name: "Alice's Kush", ...hiddenPriced });
    const bob = makeProduct({ id: "prod-bob", name: "Bob's Blend", ...hiddenPriced });

    const aliceHtml = renderCard(alice, { editing: false, viewerIsOwner: false });
    const bobHtml = renderCard(bob, { editing: false, viewerIsOwner: false });

    const aliceLabel = requestPricingAriaLabel(aliceHtml);
    const bobLabel = requestPricingAriaLabel(bobHtml);

    expect(aliceLabel).not.toBeNull();
    expect(bobLabel).not.toBeNull();
    expect(aliceLabel).toContain("Alice's Kush");
    expect(bobLabel).toContain("Bob's Blend");
    // Not a static string — the name actually varies with the product.
    expect(aliceLabel).not.toBe(bobLabel);
  });
});
