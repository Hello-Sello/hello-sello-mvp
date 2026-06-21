/**
 * RED-first unit contract for the cart-line -> DraftLineInput mapping — the
 * deal-seam boundary (D-02, D-14). Phase 7, plan 07-01 (Wave 0).
 *
 * INTENTIONALLY RED: `./dealLineMapping` does not exist yet — plan 07-06 (the
 * seller deal hand-off) creates it. The DraftLineInput type IS resolvable today
 * (imported via the @/modules/deals barrel — the key_link this plan asserts), so
 * the ONLY unresolved import is the local `./dealLineMapping` module. That
 * module-not-found is the Wave 0 success signal. Do NOT create the production
 * module here.
 *
 * Why this mapping is unit-tested in isolation: it is the single point where the
 * Present cart crosses into Ayush's deals module. Getting the field mapping +
 * the D-14 pack-step quantity right here keeps the hand-off thin and proves the
 * contract without standing up a full e2e deal.
 */
import { describe, it, expect } from "vitest";
// The barrel import — MUST resolve today (the type exists; index.ts re-exports it).
// This is the plan's key_link: dealLineMapping.test.ts -> @/modules/deals.
import type { DraftLineInput } from "@/modules/deals";
// RED until 07-06 — dealLineMapping.ts is created by the deal hand-off plan.
import { toDraftLine } from "./dealLineMapping";

// A cart line as the store holds it (the 07-01 cartStore shape). qty is in
// PACKS on the cart; the mapping converts to grams via packSizeGrams (D-14).
const cartLine = {
  productId: "p1",
  productName: "Aurora Haze 24",
  quantity: 3, // 3 packs
  packSizeGrams: 10, // 10 g/pack -> 30 g
  unit: "g",
  pricePerGram: 8.9,
};

describe("toDraftLine — cart line -> DraftLineInput (D-02 deal seam)", () => {
  it("maps every field onto a DraftLineInput", () => {
    const line: DraftLineInput = toDraftLine(cartLine);
    expect(line.productId).toBe("p1");
    expect(line.productName).toBe("Aurora Haze 24");
    expect(line.packSizeGrams).toBe(10);
    expect(line.unit).toBe("g");
    expect(line.unitPrice).toBe(8.9);
  });

  it("defaults the currency to EUR", () => {
    expect(toDraftLine(cartLine).currency).toBe("EUR");
  });

  it("steps quantity by packSizeGrams — 3 packs of 10 g = 30 g (D-14)", () => {
    expect(toDraftLine(cartLine).quantity).toBe(30);
  });

  it("a null pack size falls back to the raw quantity (off-catalogue / no pack)", () => {
    const noPack = { ...cartLine, packSizeGrams: null, quantity: 5 };
    const line = toDraftLine(noPack);
    expect(line.quantity).toBe(5);
    expect(line.packSizeGrams).toBeNull();
  });

  it("carries a null unitPrice through (price not yet disclosed)", () => {
    const noPrice = { ...cartLine, pricePerGram: null };
    expect(toDraftLine(noPrice).unitPrice).toBeNull();
  });
});
