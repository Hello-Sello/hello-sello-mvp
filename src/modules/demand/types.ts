export type DemandProduct = {
  id: string;
  name: string;
  genetics: "Indica" | "Sativa" | "Hybrid";
  thc: number;
  pricePerGram: number;
};

export type DemandContact = {
  id: string;
  name: string;
  city: string;
};

export type DemandResponse = {
  id: string;
  name: string;
  company: string;
  /** grams wanted, keyed by product id; products left at 0 are omitted */
  quantities: Record<string, number>;
  note?: string;
  submittedAt: number;
};

export type DemandPoll = {
  id: string;
  title: string;
  productIds: string[];
  /** contacts it was "sent" to — empty when shared by link only */
  recipientIds: string[];
  createdAt: number;
  expiresAt: number;
  responses: DemandResponse[];
};

/** What the public link carries, so the landing page renders on any device. */
export type SharedPoll = Pick<DemandPoll, "id" | "title" | "productIds" | "expiresAt">;
