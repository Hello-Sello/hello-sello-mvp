"use client";

/**
 * Product Basket writes — owner-scoped by RLS (basket_line_owner_all). The
 * browser client is enough: every row carries owner_person_id = auth.uid(), and
 * the policy rejects any other owner. Re-adding a product bumps its pack_count
 * (unique owner+product), never a duplicate row.
 *
 * T07 added a SECOND, restrictive policy (`basket_line_admission`): a write is
 * also refused unless the caller may see the product and — unless they own it —
 * may know its price. It is `WITH CHECK` only, so it gates INSERT and UPDATE
 * and never SELECT or DELETE: a line whose product later goes invisible stays
 * readable and removable, but its pack count can no longer be edited. Every
 * updater below can therefore throw an admission refusal, not just `addToBasket`.
 */
import { createClient } from "@/shared/db/client";

/**
 * The server refused the write — the `basket_line_admission` restrictive policy
 * said no because the caller may not see the product, or may not know its price
 * (T07; decision 3, PRD §6.5 — the rule is server-side, the hidden Add control
 * is never the gate).
 *
 * The message states the REASON rather than the failed action, so it reads
 * correctly under both a refused add and a refused pack-count edit. It is meant
 * for a person: a caller that only renders `e.message` (the shipped idiom —
 * BasketDrawer's `onPackSizeCommit` catch) then shows something legible instead of a raw Postgres
 * string. The class is exported so a caller that needs to tell a policy refusal
 * from a network failure can, without string-matching.
 */
export class BasketAdmissionError extends Error {
  constructor() {
    super("The seller no longer shares this product, or its price, with you.");
    this.name = "BasketAdmissionError";
  }
}

/**
 * One owner for "what a PostgREST error on this table means". Postgres raises
 * 42501 (`insufficient_privilege`) for BOTH an RLS refusal and a missing grant,
 * and PostgREST passes the code through — but a signed-in caller holds every
 * grant on `product_basket_line`, so 42501 from these writers means the
 * admission policy refused. Anything else is a transport or server fault and is
 * rethrown untouched, message and all.
 *
 * Applied to the three verbs the policy's `WITH CHECK` actually gates — the
 * insert/upsert and the two updates. NOT to the delete: `WITH CHECK` has no
 * DELETE phase, so a 42501 there could never be an admission refusal, and
 * translating it would be a lie.
 */
function throwWriteError(error: { code?: string } | null): never {
  if (error?.code === "42501") throw new BasketAdmissionError();
  throw error;
}

async function ownerId(): Promise<string> {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("basket: no authenticated user");
  return user.id;
}

export async function addToBasket(
  productId: string,
  packCount: number,
  packSizeGrams: number | null,
): Promise<void> {
  const supabase = createClient();
  const owner = await ownerId();
  const { error } = await supabase
    .from("product_basket_line")
    .upsert(
      {
        owner_person_id: owner,
        product_id: productId,
        pack_count: packCount,
        pack_size_grams: packSizeGrams,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_person_id,product_id" },
    );
  if (error) throwWriteError(error);
}

export async function updateBasketLinePackCount(lineId: string, packCount: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .update({ pack_count: packCount, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) throwWriteError(error);
}

export async function updateBasketLinePackSize(lineId: string, packSizeGrams: number): Promise<void> {
  if (!Number.isFinite(packSizeGrams) || packSizeGrams <= 0) {
    throw new Error("basket: pack size must be a positive number of grams");
  }
  const supabase = createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .update({ pack_size_grams: packSizeGrams, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) throwWriteError(error);
}

export async function removeBasketLine(lineId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_basket_line").delete().eq("id", lineId);
  if (error) throw error;
}
