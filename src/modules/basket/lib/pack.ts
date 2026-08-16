import { resolveTierPrice } from "@/modules/catalog/index.client";
import { lineValueOf } from "@/modules/deals";
import type { BasketLine } from "../types";

/**
 * The Pack rule (CONTEXT.md "Pack (basket quantity)"): a basket line stores a
 * pack COUNT and a snapshot of the chosen pack SIZE. Since the tier ladder
 * (ADR-0004), grams are no longer derived only at Send — `resolveBasketLine`
 * reads them LIVE so the drawer's shown price and the draft's written price are
 * the same number. Null pack size → no gram figure (the quantity falls back to
 * the raw pack count, riding with the line's own unit).
 */
export function toGrams(packCount: number, packSizeGrams: number | null): number | null {
  if (packSizeGrams == null) return null;
  return packCount * packSizeGrams;
}

/** Everything a basket line resolves to — grams, the draft quantity, the
 *  tier-resolved per-gram price, the winning rung, and the line total. */
export interface ResolvedBasketLine {
  /** toGrams(packCount, packSizeGrams); null when the pack size is unknown. */
  grams: number | null;
  /** The draft's quantity: grams, or the raw pack count as the fallback. */
  quantity: number;
  /** Resolved per-gram price (rung or base); a null base stays null. */
  pricePerGram: number | null;
  /** The winning rung's minGrams, or null when the base price applies. */
  appliedMin: number | null;
  /** quantity × pricePerGram on `lineValueOf` semantics (kg ×1000); null when price-less. */
  lineTotal: number | null;
}

/**
 * The ONE line-resolution owner (ADR-0004 §4, decision A). Both the drawer's
 * per-line display and `toDraftLines`' written price consume this, so the two
 * can never drift: the quantity/unit pair resolved here is EXACTLY the pair
 * `toDraftLines` writes into the draft (grams as unit "g" when known, else the
 * raw pack count with the line's own unit). The basket→catalog module edge the
 * ADR names is this import of catalog's `resolveTierPrice`.
 */
export function resolveBasketLine(
  l: Pick<BasketLine, "packCount" | "packSizeGrams" | "pricePerGram" | "tiers" | "unit">,
): ResolvedBasketLine {
  const grams = toGrams(l.packCount, l.packSizeGrams);
  const quantity = grams ?? l.packCount;
  const unit = grams != null ? "g" : l.unit;
  const { pricePerGram, appliedMin } = resolveTierPrice(l.pricePerGram, l.tiers, quantity, unit);
  return {
    grams,
    quantity,
    pricePerGram,
    appliedMin,
    lineTotal: pricePerGram == null ? null : lineValueOf(quantity, unit, pricePerGram),
  };
}
