import type { DraftLineInput } from "@/modules/deals";
import { toGrams } from "./pack";
import type { BasketGroup } from "../types";

/**
 * Map ONE seller-group's cart lines into the Deal Basket line shape createDeal
 * consumes. Grams = pack_count × pack_size_grams (toGrams); when the pack size
 * is unknown the quantity falls back to the raw pack count (a line still sends,
 * batch-optional — Phase 17 rule). Price rides through untouched (null → the
 * deal is sent price-less, which createDeal's sumValueNet already handles).
 */
export function toDraftLines(group: BasketGroup): DraftLineInput[] {
  return group.lines.map((l) => {
    const grams = toGrams(l.packCount, l.packSizeGrams);
    return {
      productId: l.productId,
      productName: l.productName,
      quantity: grams ?? l.packCount,
      unit: l.unit,
      unitPrice: l.pricePerGram,
      currency: l.currency,
      cultivar: l.cultivar,
      pzn: l.pzn,
    };
  });
}
