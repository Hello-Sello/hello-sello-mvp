import type { CreateDealInput, DealType } from "../types";

/**
 * The two create_deal_draft args that the Product Basket paths vary: the deal
 * TYPE (offer default / order for a buyer) and the chosen counterparty PERSON.
 * Pure + unit-tested so the passthrough can't silently regress; the rest of the
 * RPC arg shape stays inline in createDeal.
 */
export function createDealRpcArgs(input: CreateDealInput): {
  p_deal_type: DealType;
  p_counterparty_person_id: string | null;
} {
  return {
    p_deal_type: input.dealType ?? "offer",
    p_counterparty_person_id: input.counterpartyPersonId ?? null,
  };
}
