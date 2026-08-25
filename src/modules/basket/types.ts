import type { PriceTier } from "@/modules/catalog/index.client";

export interface BasketLine {
  id: string;
  productId: string;
  productName: string;
  cultivar: string | null;
  unit: string;              // 'g' etc. — from product.unit_code, default 'g'
  packCount: number;
  packSizeGrams: number | null;
  pricePerGram: number | null;
  currency: string;
  pzn: string | null;
  sellerCompanyId: string;
  sellerCompanyName: string;
  /** The product's tier ladder (ADR-0004): [] when no rungs exist. */
  tiers: PriceTier[];
}

export interface BasketGroup {
  sellerCompanyId: string;
  sellerCompanyName: string;
  isOwnCompany: boolean;     // true → seller offering own products; needs a recipient picker
  relationshipId: string | null; // resolved for other-company groups; null for own-company
  lines: BasketLine[];
}

export interface BasketView {
  groups: BasketGroup[];
  totalLineCount: number;
}

/** Nothing to show. One owner, because two states resolve to it — a basket that
 * is genuinely empty, and a read that failed — and only the second carries an
 * error. Never construct this literal a second time. */
export const EMPTY_BASKET: BasketView = { groups: [], totalLineCount: 0 };

/** Input to createBasketDraft - the recipient chosen for ONE seller-group. */
export interface SendGroupInput {
  relationshipId: string;
  /** the chosen person on the other side - BOTH doors supply it (the seller's
   *  own-company 'offer' and the buyer's connected-seller 'order'); null →
   *  company-addressed */
  counterpartyPersonId: string | null;
  note: string | null;
}
