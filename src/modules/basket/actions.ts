"use server";

/**
 * Send ONE seller-group of the Product Basket → a Deal Card, then clear those
 * lines. This is the ONLY seam onto the deals domain: it builds a Deal Basket
 * (toDraftLines) and calls the existing createDeal. Buyer groups send an 'order'
 * (recipient implicit = the seller company via the relationship); own-company
 * groups send an 'offer' to the chosen recipient. Line deletion is owner-scoped
 * by RLS. createDeal is Ayush's; nothing here touches deal tables directly.
 */
import { createClient } from "@/shared/db/server";
import { createDeal, type CreateDealResult } from "@/modules/deals";
import { toDraftLines } from "./lib/toDraftLines";
import type { BasketGroup, SendGroupInput } from "./types";

export async function sendBasketGroup(
  group: BasketGroup,
  input: SendGroupInput,
): Promise<CreateDealResult> {
  const lines = toDraftLines(group);
  const result = await createDeal({
    relationshipId: input.relationshipId,
    lines,
    note: input.note,
    dealType: group.isOwnCompany ? "offer" : "order",
    counterpartyPersonId: input.counterpartyPersonId,
  });

  // Clear the sent group's lines from the cart (RLS: only my own rows).
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .delete()
    .in("product_id", group.lines.map((l) => l.productId));
  if (error) throw error;

  return result;
}
