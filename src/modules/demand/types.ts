export type DemandProduct = {
  id: string;
  name: string;
  thc: number;
  /** total stock available, in kg */
  stockKg: number;
  /** ISO date (YYYY-MM-DD) */
  expiry: string;
  pricePerGram: number;
};

export type DemandContact = {
  id: string;
  name: string;
  company: string;
  email: string;
  city: string;
};

export type DemandGroup = {
  id: string;
  name: string;
  /** a contact may sit in several groups */
  memberIds: string[];
};

/** One pharmacy's row in the group poll. */
export type DemandResponse = {
  id: string;
  /** set when the row belongs to an invited contact; absent for link walk-ins */
  contactId?: string;
  name: string;
  company: string;
  /** grams wanted, keyed by product id; products left at 0 are omitted */
  quantities: Record<string, number>;
  submittedAt: number;
};

export type DemandChannel = "email" | "link";

export type DemandPoll = {
  id: string;
  title: string;
  productIds: string[];
  /** invited contacts — each gets a named row in the grid */
  recipientIds: string[];
  channel: DemandChannel;
  createdAt: number;
  expiresAt: number;
  responses: DemandResponse[];
};

/** What the public link carries, so the poll page renders on any device. */
export type SharedPoll = Pick<DemandPoll, "id" | "title" | "productIds" | "recipientIds" | "expiresAt">;
