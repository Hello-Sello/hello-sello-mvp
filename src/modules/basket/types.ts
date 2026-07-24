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

/** Input to createBasketDraft - the recipient chosen for ONE seller-group. */
export interface SendGroupInput {
  relationshipId: string;
  /** the chosen person on the other side (own-company offer path); null → company-addressed */
  counterpartyPersonId: string | null;
  note: string | null;
}
