/**
 * Unit proof for the Deal Basket line-editing rules (phase 3e, FORM-01/FORM-02).
 * Pure helpers - no React, no Supabase, no DB - so the tests are pure too and run
 * sub-second. Mirrors lib/derive.test.ts.
 *
 * Products sell in PACKS: re-adding adds one `pack_size_grams` pack, not a flat
 * amount. Pricing stays per-gram, so quantity is still stored in grams.
 */
import { describe, it, expect } from "vitest";
import {
  addOrIncrement,
  emptyCustomLine,
  packStepGrams,
  packsOf,
  DEFAULT_PACK_GRAMS,
} from "./lineEditing";
import type { CatalogProduct, DraftLineInput } from "../types";

function product(partial: Partial<CatalogProduct> = {}): CatalogProduct {
  return {
    id: "p1",
    name: "Test Flower",
    cultivar: null,
    unit: "g",
    packSizeGrams: 1000,
    unitPrice: 5,
    currency: "EUR",
    thcPercent: null,
    cbdPercent: null,
    pzn: null,
    ...partial,
  };
}

/** The form's real seed (lineFromProduct), trimmed to what the helper reads. */
const seed = (p: CatalogProduct): DraftLineInput => ({
  productId: p.id,
  productName: p.name,
  quantity: packStepGrams(p.packSizeGrams),
  packSizeGrams: p.packSizeGrams,
  unit: "g",
  unitPrice: p.unitPrice,
  currency: p.currency,
});

describe("packStepGrams (one pack in grams)", () => {
  it("uses the product's pack size when set", () => {
    expect(packStepGrams(10)).toBe(10);
    expect(packStepGrams(1000)).toBe(1000);
  });
  it("falls back to the default when missing or zero", () => {
    expect(packStepGrams(null)).toBe(DEFAULT_PACK_GRAMS);
    expect(packStepGrams(0)).toBe(DEFAULT_PACK_GRAMS);
    expect(packStepGrams(undefined)).toBe(DEFAULT_PACK_GRAMS);
  });
});

describe("packsOf (display pack count)", () => {
  it("divides grams by pack size", () => {
    expect(packsOf(30, 10)).toBe(3);
    expect(packsOf(2000, 1000)).toBe(2);
  });
  it("is null when there is no pack size (show grams instead)", () => {
    expect(packsOf(500, null)).toBeNull();
  });
});

describe("addOrIncrement (FORM-01 - add one pack, never duplicate)", () => {
  it("appends a one-pack line for a product not yet on the deal", () => {
    const out = addOrIncrement([], product({ packSizeGrams: 1000 }), seed);
    expect(out).toHaveLength(1);
    expect(out[0].productId).toBe("p1");
    expect(out[0].quantity).toBe(1000);
  });

  it("adds one more PACK when the same product is re-added (1000 g pack)", () => {
    const first = addOrIncrement([], product({ packSizeGrams: 1000 }), seed);
    const second = addOrIncrement(first, product({ packSizeGrams: 1000 }), seed);
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(2000);
  });

  it("steps by the product's OWN pack size (10 g pack)", () => {
    const p = product({ id: "p10", packSizeGrams: 10 });
    const first = addOrIncrement([], p, seed);
    const second = addOrIncrement(first, p, seed);
    expect(first[0].quantity).toBe(10);
    expect(second[0].quantity).toBe(20);
  });

  it("keeps distinct catalogue products on separate lines", () => {
    const a = addOrIncrement([], product({ id: "p1" }), seed);
    const b = addOrIncrement(a, product({ id: "p2", name: "Other" }), seed);
    expect(b).toHaveLength(2);
  });

  it("never merges into a custom (null-id) line - the productId != null guard", () => {
    const custom = emptyCustomLine("Hand-typed");
    const out = addOrIncrement([custom], product(), seed);
    expect(out).toHaveLength(2);
    expect(out[0].productId).toBeNull();
    expect(out[1].productId).toBe("p1");
  });
});

describe("emptyCustomLine (FORM-02 - off-catalogue line)", () => {
  it("has a null productId so it never merges and is carry-forward-skipped by design", () => {
    expect(emptyCustomLine().productId).toBeNull();
  });

  it("has no pack size (the user types grams) and uses the per-gram convention", () => {
    const l = emptyCustomLine();
    expect(l.packSizeGrams).toBeNull();
    expect(l.unit).toBe("g");
    expect(l.unitPrice).toBeNull();
  });

  it("seeds the typed name (the add-by-name custom path)", () => {
    expect(emptyCustomLine("Purple Haze").productName).toBe("Purple Haze");
  });

  it("D-05: a custom line carries batchId null (it never points at a batch)", () => {
    // Custom (off-catalogue) lines are batch-exempt (D-06): no catalogue product,
    // no batch. The shape must be explicit so the form's batch guard (canSubmit)
    // can tell a custom line apart from an un-batched catalogue line.
    // RED until Wave 3 adds `batchId` to emptyCustomLine.
    expect(emptyCustomLine().batchId).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Phase 3f (BTCH-01) - the batch snapshot + the productId+batchId merge key.   */
/*                                                                            */
/* TEST-FIRST (RED until Wave 3). The 3f model: a catalogue line is born WITH  */
/* one chosen batch (D-06); the line carries the BATCH's measured thc/cbd +    */
/* batch number snapshotted at deal time (BTCH-01), NOT the product LABEL.     */
/* The Basket merge key extends from productId (3e) to productId + batchId     */
/* (D-05): same product + same batch increments one pack; same product +       */
/* different batch is a NEW line (the batch-4 / batch-5 split). Custom lines   */
/* (productId null) still never merge.                                         */
/*                                                                            */
/* These cases are written against the TARGET shape (D-05/D-08): the seed      */
/* stamps the chosen batch onto the line and `addOrIncrement` matches on       */
/* productId + batchId. Today `addOrIncrement` matches on productId ONLY and    */
/* DraftLineInput has no batchId, so the "different batch -> new line" case     */
/* and the snapshot-stamping case are RED until Wave 3 lands. The pre-existing  */
/* 3e cases stay green.                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The 3f seed (the target `lineFromProduct`): stamps the chosen BATCH's id,
 * number, and MEASURED thc/cbd onto the line - not the product label. Threads
 * the picked batch through the same single add path the grid/typeahead use
 * (D-08). Written to the target shape; RED until Wave 3 extends DraftLineInput.
 */
const seedWithBatch = (
  p: CatalogProduct,
  batch: { id: string; number: string; thc: number | null; cbd: number | null },
): DraftLineInput => ({
  productId: p.id,
  productName: p.name,
  quantity: packStepGrams(p.packSizeGrams),
  packSizeGrams: p.packSizeGrams,
  unit: "g",
  unitPrice: p.unitPrice,
  currency: p.currency,
  batchId: batch.id,
  batchNumber: batch.number,
  // measured snapshot (D-03): the BATCH values, NOT the product label thc/cbd.
  thcPercent: batch.thc,
  cbdPercent: batch.cbd,
});

describe("addOrIncrement (BTCH-01 / D-05 - productId+batchId merge key)", () => {
  const batch4 = { id: "b4", number: "GL-24-0001", thc: 30.2, cbd: 1.1 };
  const batch5 = { id: "b5", number: "GL-24-0002", thc: 31.8, cbd: 0.9 };

  it("D-05: same product + SAME batch increments quantity (one line, summed packs)", () => {
    const p = product({ id: "p1", packSizeGrams: 1000 });
    const seed = (cp: CatalogProduct) => seedWithBatch(cp, batch4);
    const first = addOrIncrement([], p, seed);
    const second = addOrIncrement(first, p, seed);
    expect(second).toHaveLength(1);
    expect(second[0].quantity).toBe(2000);
    expect(second[0].batchId).toBe("b4");
  });

  it("D-05: same product + DIFFERENT batch makes a NEW line (batch-4 / batch-5 split)", () => {
    const p = product({ id: "p1", packSizeGrams: 1000 });
    const withB4 = addOrIncrement([], p, (cp) => seedWithBatch(cp, batch4));
    const withBoth = addOrIncrement(withB4, p, (cp) => seedWithBatch(cp, batch5));
    expect(withBoth).toHaveLength(2);
    expect(withBoth.map((l) => l.batchId).sort()).toEqual(["b4", "b5"]);
  });

  it("D-05: a custom (null-id) line never merges and carries batchId null", () => {
    const custom = emptyCustomLine("Hand-typed");
    const out = addOrIncrement([custom], product({ id: "p1" }), (cp) =>
      seedWithBatch(cp, batch4),
    );
    expect(out).toHaveLength(2);
    expect(out[0].productId).toBeNull();
    expect(out[0].batchId).toBeNull();
    expect(out[1].batchId).toBe("b4");
  });

  it("BTCH-01: a line seeded from a picked batch carries the BATCH's measured thc/cbd + number (not the label)", () => {
    // product LABEL says 31/1; the picked batch-4 MEASURED 30.2/1.1. The line must
    // snapshot the measured batch values, never the product label (D-03).
    const p = product({ id: "p1", thcPercent: 31, cbdPercent: 1, packSizeGrams: 1000 });
    const out = addOrIncrement([], p, (cp) => seedWithBatch(cp, batch4));
    expect(out).toHaveLength(1);
    expect(out[0].batchId).toBe("b4");
    expect(out[0].batchNumber).toBe("GL-24-0001");
    expect(out[0].thcPercent).toBe(30.2);
    expect(out[0].cbdPercent).toBe(1.1);
  });
});
