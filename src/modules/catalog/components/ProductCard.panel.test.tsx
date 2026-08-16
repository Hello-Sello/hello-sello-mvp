/**
 * Render contract for the ProductCard READ-MODE "See all prices" reveal
 * (0021, T05 — the prototype's `footerBuyerB`, Variant B).
 *
 * Render path: `react-dom/server` `renderToStaticMarkup` — the repo's
 * pure-node vitest env (ProductCard.tiers.test.tsx precedent; no jsdom).
 * Initial paint only: the reveal link's PRESENCE is gated by
 * `priceShown && tiers.length > 0` and is first-paint assertable; the OPEN
 * panel is local state and belongs to e2e. The ROW MODEL itself is
 * unit-tested in ladderPanel.test.ts.
 *
 * RED state: ProductCard renders today, but has NO reveal link — case (a)
 * fails on the missing `See all prices` markup. Cases (b)–(d) pin the gates
 * (amendment 1: hidden price ⇒ no reveal AND no `applied` chip text) and
 * must stay green through the build.
 *
 * Factory copied minimally from ProductCard.tiers.test.tsx (that file is
 * T04's contract — not modified, and it exports nothing).
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "./ProductCard";
import type { ShopProduct } from "../shop";
import type { PriceTier } from "../pricing";

/** Minimal complete ShopProduct — every required field, overridable per case. */
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

const ladder: PriceTier[] = [{ minGrams: 2000, pricePerGram: 4.2 }];

describe("<ProductCard> read-mode 'See all prices' reveal (T05)", () => {
  it("read mode + public price + tiers → the reveal link renders (closed)", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={makeProduct({ tiers: ladder })} />,
    );
    expect(html).toContain("See all prices");
    // Initial paint is the CLOSED state — the toggle's open label is absent.
    expect(html).not.toContain("Hide prices");
  });

  it("price_public false + tiers → NO reveal, NO 'applied' chip text (amendment 1)", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={makeProduct({ price_public: false, tiers: ladder })}
      />,
    );
    expect(html).not.toContain("See all prices");
    // Hidden price ⇒ the availability chip is gated off too — no `from Ng
    // applied` / `base price` text can leak a tier price.
    expect(html).not.toContain("applied");
  });

  it("no tiers + public price → no reveal", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={makeProduct({ tiers: [] })} />,
    );
    expect(html).not.toContain("See all prices");
  });

  it("editing → no reveal text (the edit footer renders instead)", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={makeProduct({ tiers: ladder })} editing />,
    );
    expect(html).not.toContain("See all prices");
    // Edit mode's own footer (T04's tier editor) is what renders here.
    expect(html).toContain("Volume price tiers");
  });
});
