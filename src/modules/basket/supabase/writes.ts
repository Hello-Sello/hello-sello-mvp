"use client";

/**
 * Product Basket writes — owner-scoped by RLS (basket_line_owner_all). The
 * browser client is enough: every row carries owner_person_id = auth.uid(), and
 * the policy rejects any other owner. Re-adding a product bumps its pack_count
 * (unique owner+product), never a duplicate row.
 */
import { createClient } from "@/shared/db/client";

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
  if (error) throw error;
}

export async function updateBasketLinePackCount(lineId: string, packCount: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .update({ pack_count: packCount, updated_at: new Date().toISOString() })
    .eq("id", lineId);
  if (error) throw error;
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
  if (error) throw error;
}

export async function removeBasketLine(lineId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("product_basket_line").delete().eq("id", lineId);
  if (error) throw error;
}
