/**
 * The Pack rule (CONTEXT.md "Pack (basket quantity)"): a basket line stores a
 * pack COUNT and a snapshot of the chosen pack SIZE; grams are derived only when
 * a Deal Basket is built at Send. Null pack size → no gram figure (the caller
 * sends the line without a resolved quantity-in-grams).
 */
export function toGrams(packCount: number, packSizeGrams: number | null): number | null {
  if (packSizeGrams == null) return null;
  return packCount * packSizeGrams;
}
