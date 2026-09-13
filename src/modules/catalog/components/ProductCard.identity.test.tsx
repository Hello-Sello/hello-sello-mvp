/**
 * Render contract for the card header's identity lines — cultivar (the strain)
 * and PZN: inputs in edit mode, plain text otherwise.
 *
 * Static render (`renderToStaticMarkup`, the repo's no-jsdom vitest env), so
 * this pins first paint only: which inputs exist and what they hold. The
 * details dialog opens from local state, so a static render cannot reach it.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard, type ProductDraft } from "./ProductCard";
import type { ShopProduct } from "../shop";

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
    badge_code: null,
    ...overrides,
  };
}

const draftOf = (fields: ProductDraft["fields"]): ProductDraft => ({
  fields,
  batchInserts: [],
  batchEdits: {},
  batchDeletes: [],
});

const saved = { cultivar: "Gelato Cheesecake", local_code_pzn: "18234567" };

describe("<ProductCard> cultivar + PZN", () => {
  it("edit mode → both are inputs holding the saved values", () => {
    const html = renderToStaticMarkup(<ProductCard product={makeProduct(saved)} editing />);
    expect(html).toMatch(/<input[^>]*aria-label="Cultivar"[^>]*value="Gelato Cheesecake"/);
    expect(html).toMatch(/<input[^>]*aria-label="PZN"[^>]*value="18234567"/);
  });

  it("edit mode with nothing saved → both inputs still render, empty", () => {
    const html = renderToStaticMarkup(<ProductCard product={makeProduct()} editing />);
    expect(html).toMatch(/<input[^>]*aria-label="Cultivar"[^>]*value=""/);
    expect(html).toMatch(/<input[^>]*aria-label="PZN"[^>]*value=""/);
  });

  it("a drafted value wins over the saved one", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={makeProduct(saved)}
        editing
        draft={draftOf({ cultivar: "Grape Cookies", local_code_pzn: "" })}
      />,
    );
    expect(html).toMatch(/<input[^>]*aria-label="Cultivar"[^>]*value="Grape Cookies"/);
    // A cleared draft is "" — it must show empty, not fall back to the saved PZN.
    expect(html).toMatch(/<input[^>]*aria-label="PZN"[^>]*value=""/);
  });

  it("read mode → plain text, no inputs", () => {
    const html = renderToStaticMarkup(<ProductCard product={makeProduct(saved)} />);
    expect(html).not.toContain('aria-label="Cultivar"');
    expect(html).not.toContain('aria-label="PZN"');
    expect(html).toContain("Gelato Cheesecake");
    expect(html).toContain("18234567");
  });
});
