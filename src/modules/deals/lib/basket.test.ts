/**
 * RED-first unit test for the Deal Basket builders (phase 3b / plan 01,
 * BSKT-01). Mirrors derive.test.ts / recipient.test.ts: vitest, a pure import,
 * no Supabase, no React.
 *
 * The builders set the 3 IDENTITY fields the form does not own (D-03/D-04):
 * Create -> { attachedDealId: null, source: "p2p", recipient } (a new deal
 * addressed to the resolved recipient); Edit -> { attachedDealId: cardId,
 * source: "p2p", recipient: null } (editing an existing card; Edit does not
 * resolve a recipient in 3b - Scope call A1). Proving the merge here in
 * isolation means the wrappers stay thin and the identity rule is not left to
 * the e2e alone.
 */
import { describe, it, expect } from "vitest";
import { buildCreateBasket, buildEditBasket } from "./basket";
import type { DealBasketContent, DealRecipient } from "../types";

/** The 6 content fields a form hands back - only the shape matters here. */
const content: DealBasketContent = {
  lines: [],
  freeDelivery: false,
  dueDate: null,
  paymentTermsCode: null,
  note: null,
};

const recipient: DealRecipient = { companyId: "co-2", personId: "per-2" };

describe("buildCreateBasket (BSKT-01 - a new deal addressed to the recipient)", () => {
  it("sets attachedDealId null, source p2p, and carries the recipient", () => {
    const basket = buildCreateBasket(content, recipient);
    expect(basket.attachedDealId).toBeNull();
    expect(basket.source).toBe("p2p");
    expect(basket.recipient).toEqual(recipient);
  });

  it("carries the content fields through unchanged", () => {
    const basket = buildCreateBasket({ ...content, freeDelivery: true }, recipient);
    expect(basket.freeDelivery).toBe(true);
  });
});

describe("buildEditBasket (BSKT-01 - editing an existing card, no recipient)", () => {
  it("sets attachedDealId to the card id, source p2p, recipient null", () => {
    const basket = buildEditBasket(content, "card-1");
    expect(basket.attachedDealId).toBe("card-1");
    expect(basket.source).toBe("p2p");
    expect(basket.recipient).toBeNull();
  });
});
