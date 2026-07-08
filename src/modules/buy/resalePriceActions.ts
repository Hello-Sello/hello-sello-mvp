"use server";

/**
 * Buyer's own resale-price (net/gross) write side — the ONLY write path for
 * `buyer_resale_price` (Phase 18, Plan 09, BUY-01). Mirrors product_cost's
 * proven "resolve the caller's own company server-side, never accept it as a
 * param" shape: `buyer_company_id` is ALWAYS getCurrentCompanyId(), so a caller
 * can only ever write a row scoped to their OWN company — RLS
 * (buyer_company_id = current_company_id()) is the second, DB-level layer of
 * the same guarantee (T-18-15).
 *
 * Upserts on the (buyer_company_id, supplier_name, product_name) unique key
 * (20260708090000_buy_schema.sql) so a second edit to the same pair updates the
 * existing row instead of violating the unique constraint. The payload only
 * ever includes the ONE field being saved (net OR gross) — supabase-js's
 * upsert() generates `ON CONFLICT ... DO UPDATE SET <only the payload's own
 * columns>`, so the sibling field is never touched by an update it wasn't part
 * of (see buildResalePriceUpsertRow, ./lib/resalePriceRow.ts).
 *
 * `buildResalePriceUpsertRow` (a sync pure builder) and the
 * `SaveBuyerResalePriceInput`/`Result` types live in `./lib/resalePriceRow.ts`,
 * NOT here — Next.js requires every export of a `"use server"` file to be an
 * async function, so the pure builder cannot be co-located with the action
 * (18-13-SUMMARY.md's Deviations: this was a latent bug from plan 18-09, only
 * surfaced once a real page actually imported this module). The types are
 * NOT re-exported from here either — Turbopack's server-action reference
 * codegen picks up even type-only re-exports as if they were runtime values
 * and fails to resolve them at request time. Callers (the buy barrel) import
 * these two types directly from `./lib/resalePriceRow` instead.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId, getCurrentPerson } from "@/shared/auth";
import {
  buildResalePriceUpsertRow,
  type SaveBuyerResalePriceInput,
  type SaveBuyerResalePriceResult,
} from "./lib/resalePriceRow";

export async function saveBuyerResalePrice(
  input: SaveBuyerResalePriceInput,
): Promise<SaveBuyerResalePriceResult> {
  if (!Number.isFinite(input.value) || input.value < 0) {
    return { ok: false, error: "Value must be a non-negative number." };
  }
  if (!input.supplierName.trim() || !input.productName.trim()) {
    return { ok: false, error: "Missing supplier or product." };
  }

  // Server-resolved, NEVER accepted from the client (T-18-15).
  const buyerCompanyId = await getCurrentCompanyId();
  if (!buyerCompanyId) {
    return { ok: false, error: "No company on this account." };
  }

  const person = await getCurrentPerson();
  const supabase = await createClient();

  const { error } = await supabase
    .from("buyer_resale_price")
    .upsert(buildResalePriceUpsertRow(input, buyerCompanyId, person?.id ?? null), {
      onConflict: "buyer_company_id,supplier_name,product_name",
    });

  // Surface the failure — no silent no-op (CONTEXT.md's convention, T-18-16).
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/buy");
  return { ok: true };
}
