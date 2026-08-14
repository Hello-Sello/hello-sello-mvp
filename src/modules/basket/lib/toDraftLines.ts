import type { DraftLineInput } from "@/modules/deals";
import { resolveBasketLine } from "./pack";
import type { BasketGroup } from "../types";

/**
 * Map ONE seller-group's cart lines into the Deal Basket line shape createDeal
 * consumes. Quantity, unit, and price all come from `resolveBasketLine` — the
 * one resolution owner (ADR-0004 §4): `unitPrice` is the tier-RESOLVED per-gram
 * price (rung or base; null base → the deal is sent price-less, which
 * createDeal's sumValueNet already handles), `quantity` is the line's grams,
 * and `unit` becomes "g" whenever grams are known — the drawer↔draft agreement
 * is structural, not resting on the unit FK. When the pack size is unknown the
 * quantity falls back to the raw pack count as a plain count of packs (a line
 * still sends, batch-optional — Phase 17 rule).
 */
export function toDraftLines(group: BasketGroup): DraftLineInput[] {
  return group.lines.map((l) => {
    const r = resolveBasketLine(l);
    return {
      productId: l.productId,
      productName: l.productName,
      quantity: r.quantity,
      // The fallback writes "unit", never l.unit: BasketLine.unit comes from
      // product.unit_code (g/mL/pack) but deal_line_item.unit is FK-bound to
      // deal_line_unit (g/kg/unit) — "pack"/"mL" would FK-fail at createDeal.
      // "unit" = a plain count, billed as-is by lineValueOf, exactly how the
      // resolver priced the raw packCount.
      unit: r.grams != null ? "g" : "unit",
      unitPrice: r.pricePerGram,
      currency: l.currency,
      cultivar: l.cultivar,
      pzn: l.pzn,
    };
  });
}
