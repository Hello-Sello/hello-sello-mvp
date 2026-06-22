/**
 * Deals - the payment-terms code↔label map (no Supabase, no React → pure).
 *
 * ONE authoritative owner for the payment-terms labels, shared by the form and
 * the card so the two can never drift (the-pragmatic-programmer one-fact rule).
 * The form's `<select>` maps over {@link PAYMENT_TERMS}; the card resolves a
 * stored `payment_terms_code` to a human label via {@link paymentTermLabel}.
 *
 * The empty `""` code is the "no term chosen" default and renders the card's
 * absent-value glyph "—", matching the dash the card already uses elsewhere.
 */

/** The payment-term codes and their human labels (the `<select>` options). */
export const PAYMENT_TERMS: { code: string; label: string }[] = [
  { code: "", label: "—" },
  { code: "prepaid", label: "Prepaid" },
  { code: "cod", label: "Cash on delivery" },
  { code: "net7", label: "Net 7" },
  { code: "net14", label: "Net 14" },
  { code: "net30", label: "Net 30" },
  { code: "net60", label: "Net 60" },
  { code: "net90", label: "Net 90" },
];

/**
 * Resolve a stored `payment_terms_code` to its human label (e.g. `net30` →
 * "Net 30"). A null, empty, or unknown code falls back to the empty-code label
 * "—", so an absent term renders the card's existing absent-value dash glyph
 * (and a stray code can never show raw or crash the card).
 */
export function paymentTermLabel(code: string | null | undefined): string {
  const match = PAYMENT_TERMS.find((t) => t.code === (code ?? ""));
  return match?.label ?? "—";
}
