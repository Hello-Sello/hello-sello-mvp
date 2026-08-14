/**
 * Render contract for the ProductCard EDIT-MODE tier editor (0021, T04 — the
 * prototype's `footerEdit`, adapted to the card's pending-draft flow).
 *
 * Render path: `react-dom/server` `renderToStaticMarkup` — the repo's pure-node
 * vitest env (NegotiationStrip.test.tsx precedent; no jsdom). The draft comes in
 * as a PROP, so every assertion here is first-paint assertable: rows render from
 * `draft.fields.tiers`, `+ Add tier` disables at 3 rows with the `ladder is full`
 * note, and an invalid draft shows the pinned red message text.
 *
 * RED state: ProductCard renders today, but has NO tier-editor section — the
 * "Volume price tiers" header, tier rows, and Add-tier button are all missing
 * from the HTML, so these assertions fail on missing markup (not on syntax).
 *
 * `ProductFieldDraft.tiers` does not exist yet (T04 adds it), so the draft
 * fixture is cast — the builder's type addition makes the cast redundant.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductCard } from "./ProductCard";
import type { ProductDraft } from "./ProductCard";
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
    ...overrides,
  };
}

/** A ProductDraft whose fields carry a tier-row draft (cast until the
 *  `tiers?: LadderRowDraft[]` field lands on ProductFieldDraft). */
function tierDraft(rows: { min: string; price: string }[]): ProductDraft {
  return {
    fields: { tiers: rows },
    batchInserts: [],
    batchEdits: {},
    batchDeletes: [],
  } as unknown as ProductDraft;
}

/** True when the button whose text contains `label` renders `disabled`. */
function buttonDisabled(html: string, label: string): boolean {
  const at = html.indexOf(label);
  if (at === -1) throw new Error(`no "${label}" in HTML`);
  const open = html.lastIndexOf("<button", at);
  return /\sdisabled(?:=|\s|\/?>)/.test(html.slice(open, at));
}

describe("<ProductCard> edit-mode tier editor (T04)", () => {
  it("editing + 3-row draft → 3 'from' rows, + Add tier disabled, 'ladder is full'", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={makeProduct()}
        editing
        draft={tierDraft([
          { min: "500", price: "5" },
          { min: "1000", price: "4.5" },
          { min: "2000", price: "4" },
        ])}
      />,
    );

    expect(html).toContain("Volume price tiers");
    // One row per rung, aria-labels 1-based (amendment 8).
    expect(html).toContain("Tier 1 minimum grams");
    expect(html).toContain("Tier 2 minimum grams");
    expect(html).toContain("Tier 3 minimum grams");
    expect(html).not.toContain("Tier 4 minimum grams");
    expect(html).toContain("Tier 1 price per gram");
    // Draft values render as the controlled inputs' values.
    expect(html).toContain('value="500"');
    expect(html).toContain('value="1000"');
    expect(html).toContain('value="2000"');
    // At 3 rows the advisory cap kicks in.
    expect(html).toContain("Add tier");
    expect(buttonDisabled(html, "Add tier")).toBe(true);
    expect(html).toContain("ladder is full");
  });

  it("editing + invalid draft (500 then 400) → the pinned ascending-min message", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={makeProduct()}
        editing
        draft={tierDraft([
          { min: "500", price: "5" },
          { min: "400", price: "4" },
        ])}
      />,
    );
    expect(html).toContain("Must be higher than the tier above (500g)");
  });

  it("editing + no ladder → header + enabled Add tier, zero rows", () => {
    const html = renderToStaticMarkup(
      <ProductCard product={makeProduct({ tiers: [] })} editing />,
    );
    expect(html).toContain("Volume price tiers");
    expect(html).toContain("Add tier");
    expect(buttonDisabled(html, "Add tier")).toBe(false);
    expect(html).not.toContain("ladder is full");
    expect(html).not.toContain("Tier 1 minimum grams");
  });

  it("NOT editing → no tier-editor markup at all", () => {
    const html = renderToStaticMarkup(
      <ProductCard
        product={makeProduct({
          tiers: [{ minGrams: 500, pricePerGram: 5 }],
        })}
      />,
    );
    expect(html).not.toContain("Volume price tiers");
    expect(html).not.toContain("Add tier");
    expect(html).not.toContain("Tier 1 minimum grams");
  });
});
