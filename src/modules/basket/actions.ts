"use server";

/**
 * Birth ONE seller-group of the Product Basket as a Deal Card and send it in
 * the same action (D-04/D-05 birth, then immediate send - supersedes D-12's
 * "drawer never sends" for this door specifically, 2026-08-25: the basket
 * picker is a one-step send, not a draft-then-review step). This is the ONLY
 * seam onto the deals domain: it builds a Deal Basket (toDraftLines), calls
 * createDeal to birth the card, then sendDeal to deliver it - the pill lands
 * in the p2p thread if a person was addressed, else the relationship's c2c
 * thread (send_deal's own routing, unchanged). dealType follows the group -
 * buyer groups draft an 'order', own-company groups an 'offer' - and the two
 * now differ only in who fixes the counterparty COMPANY: the buyer's is the
 * group's seller, already fixed by that group's relationship, while the
 * seller picks one. The ADDRESSEE is symmetric - either door may name a
 * person on that side, null meaning the whole company - and this seam passes
 * it through unchanged. Line deletion is owner-scoped by RLS. createDeal and
 * sendDeal are Ayush's; nothing here touches deal tables directly.
 */
import { createClient } from "@/shared/db/server";
import { createDeal, sendDeal, type CreateDealResult } from "@/modules/deals";
import { toDraftLines } from "./lib/toDraftLines";
import type { BasketGroup, SendGroupInput } from "./types";

export async function createBasketDraft(
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
  await sendDeal(result.dealCardId);

  // Clear the drafted group's lines from the cart (RLS: only my own rows) -
  // the products now live on the draft card.
  //
  // WR-06 (retry-safety): the draft is ALREADY born above, so it is now the
  // source of truth. If this cleanup fails we LOG-AND-CONTINUE rather than throw:
  // a throw would make the caller retry the whole flow and mint a DUPLICATE
  // draft. A stray basket line left behind is a cosmetic follow-up (the user can
  // clear it), never a reason to re-birth the card.
  const supabase = await createClient();
  const { error } = await supabase
    .from("product_basket_line")
    .delete()
    .in("product_id", group.lines.map((l) => l.productId));
  if (error) {
    console.error("createBasketDraft: draft born but basket cleanup failed", error);
  }

  return result;
}
