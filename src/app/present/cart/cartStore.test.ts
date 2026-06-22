/**
 * RED-first unit contract for the transient per-company Present cart (UX-03, D-12).
 * Phase 7, plan 07-01 (Wave 0). Mirrors the deals-side basket.test.ts / the
 * profile completeness.test.ts shape: vitest, a pure import, no Supabase, no React.
 *
 * INTENTIONALLY RED: `./cartStore` does not exist yet — plan 07-03 (the buyer
 * cart UI) creates it. Until then `npm run test:unit` fails to resolve this
 * import. That module-not-found IS the success signal for Wave 0. Do NOT create
 * the production module to make this pass here.
 *
 * The store is the net-new piece RESEARCH flagged (no analog in the codebase):
 * a transient client store keyed by companyId, with merge-on-re-add and
 * per-company separation (the two-company UX-03 requirement).
 */
import { describe, it, expect } from "vitest";
// RED until 07-03 — cartStore.ts is created by the buyer-cart plan.
import { createCart } from "./cartStore";

// A minimal product shape the cart accepts (modelled on ShopProduct fields the
// cart needs: id, name, company, pack/unit, price). The real type rides
// ShopProduct in 07-03; here only the fields the store reads matter.
const auroraA = {
  id: "p1",
  name: "Aurora Haze 24",
  companyId: "co-a",
  packSizeGrams: 10,
  unit: "g",
  pricePerGram: 8.9,
};
const frostA = {
  id: "p2",
  name: "Frost Kush 18",
  companyId: "co-a",
  packSizeGrams: 5,
  unit: "g",
  pricePerGram: 7.4,
};
const velvetB = {
  id: "p5",
  name: "Velvet OG 19",
  companyId: "co-b",
  packSizeGrams: 5,
  unit: "g",
  pricePerGram: 6.8,
};

describe("createCart — transient per-company cart (UX-03, D-12)", () => {
  it("starts empty (a fresh store has no lines — D-12 transient)", () => {
    const cart = createCart();
    expect(cart.linesFor("co-a")).toEqual([]);
    expect(cart.companies()).toEqual([]);
  });

  it("addLine adds a product at qty 1 in its natural unit", () => {
    const cart = createCart();
    cart.addLine(auroraA);
    const lines = cart.linesFor("co-a");
    expect(lines).toHaveLength(1);
    expect(lines[0].productId).toBe("p1");
    expect(lines[0].quantity).toBe(1);
    expect(lines[0].unit).toBe("g");
  });

  it("adding the same productId again INCREMENTS qty (merge — no duplicate line)", () => {
    const cart = createCart();
    cart.addLine(auroraA);
    cart.addLine(auroraA);
    const lines = cart.linesFor("co-a");
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
  });

  it("setQty sets the line quantity directly", () => {
    const cart = createCart();
    cart.addLine(auroraA);
    cart.setQty("co-a", "p1", 4);
    expect(cart.linesFor("co-a")[0].quantity).toBe(4);
  });

  it("increment / decrement step the quantity by one", () => {
    const cart = createCart();
    cart.addLine(auroraA);
    cart.increment("co-a", "p1");
    expect(cart.linesFor("co-a")[0].quantity).toBe(2);
    cart.decrement("co-a", "p1");
    expect(cart.linesFor("co-a")[0].quantity).toBe(1);
  });

  it("decrement below the step removes the line (chosen rule: drop at 0)", () => {
    const cart = createCart();
    cart.addLine(auroraA); // qty 1
    cart.decrement("co-a", "p1"); // → 0 → removed
    expect(cart.linesFor("co-a")).toEqual([]);
  });

  it("keeps companies in SEPARATE buckets — reading A never returns B's lines", () => {
    const cart = createCart();
    cart.addLine(auroraA); // co-a
    cart.addLine(frostA); // co-a
    cart.addLine(velvetB); // co-b
    expect(cart.linesFor("co-a").map((l) => l.productId).sort()).toEqual(["p1", "p2"]);
    expect(cart.linesFor("co-b").map((l) => l.productId)).toEqual(["p5"]);
    // No cross-tenant bleed: company B's product never appears in company A's cart.
    expect(cart.linesFor("co-a").some((l) => l.productId === "p5")).toBe(false);
    expect(cart.companies().sort()).toEqual(["co-a", "co-b"]);
  });
});
