/**
 * Pure helpers for the buyer resale-price write side (Phase 18, Plan 09,
 * BUY-01) — isolated from `resalePriceActions.ts`'s `"use server"` boundary.
 *
 * Next.js requires EVERY export of a `"use server"` module to be an async
 * function; `buildResalePriceUpsertRow` is a synchronous pure builder, so it
 * cannot live in that file (18-13-PLAN.md Task 2 live-verification surfaced
 * this as a build-time error the moment `/buy` first actually imported the
 * chain — see 18-13-SUMMARY.md's Deviations). This module has no Supabase, no
 * "use server" — just the shape + validation logic, unit-testable without a
 * live DB.
 */
import type { Database } from "@/shared/db";

export type SaveBuyerResalePriceInput = {
  supplierName: string;
  productName: string;
  field: "net" | "gross";
  value: number;
};

export type SaveBuyerResalePriceResult = { ok: true } | { ok: false; error: string };

type BuyerResalePriceInsert = Database["public"]["Tables"]["buyer_resale_price"]["Insert"];

/** Pure: the exact row supabase-js will upsert. Isolated from the Supabase call
 *  itself so the "only the touched field is written, the sibling stays
 *  untouched" invariant is unit-testable without a live DB. */
export function buildResalePriceUpsertRow(
  input: SaveBuyerResalePriceInput,
  buyerCompanyId: string,
  updatedBy: string | null,
): BuyerResalePriceInsert {
  const base: BuyerResalePriceInsert = {
    buyer_company_id: buyerCompanyId,
    supplier_name: input.supplierName,
    product_name: input.productName,
    updated_by: updatedBy,
  };
  return input.field === "net" ? { ...base, net: input.value } : { ...base, gross: input.value };
}
