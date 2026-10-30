import type { DemandContact, DemandPoll, DemandProduct } from "./types";

/**
 * Demo data for the Demand poll preview. Nothing here touches Supabase — the
 * page is a hidden demo (`/demand`), so products and contacts are generated
 * placeholders ("Flower 1" … "Flower 100") rather than the seller's real shop.
 * Generation is deterministic so server and client render the same list.
 */
const GENETICS = ["Indica", "Sativa", "Hybrid"] as const;

export const DEMO_PRODUCTS: DemandProduct[] = Array.from({ length: 100 }, (_, i) => {
  const n = i + 1;
  return {
    id: `flower-${n}`,
    name: `Flower ${n}`,
    genetics: GENETICS[n % 3],
    thc: 18 + ((n * 7) % 13), // 18–30 %
    pricePerGram: 4.5 + ((n * 13) % 40) / 10, // €4.50–€8.40
  };
});

export const DEMO_CONTACTS: DemandContact[] = [
  { id: "c-1", name: "Apotheke am Markt", city: "Berlin" },
  { id: "c-2", name: "Linden-Apotheke", city: "Hamburg" },
  { id: "c-3", name: "Stern Apotheke", city: "München" },
  { id: "c-4", name: "Rosen-Apotheke", city: "Köln" },
  { id: "c-5", name: "Apotheke im Hafen", city: "Bremen" },
  { id: "c-6", name: "Kranich Apotheke", city: "Leipzig" },
  { id: "c-7", name: "Adler-Apotheke", city: "Frankfurt" },
  { id: "c-8", name: "Sonnen-Apotheke", city: "Stuttgart" },
];

const DAY = 24 * 60 * 60 * 1000;

/**
 * Two finished-looking polls so the Polls section isn't empty on first load.
 * Dates are relative to a fixed anchor (not `Date.now()`) to keep SSR and the
 * client in step; the store re-anchors them on first read in the browser.
 */
export function seedPolls(now: number): DemandPoll[] {
  return [
    {
      id: "demo-q4",
      title: "Q4 restock — what do you need?",
      productIds: ["flower-3", "flower-12", "flower-27", "flower-41"],
      recipientIds: ["c-1", "c-2", "c-3", "c-4"],
      createdAt: now - 6 * DAY,
      expiresAt: now + 8 * DAY,
      responses: [
        {
          id: "r-1",
          name: "Julia Brandt",
          company: "Apotheke am Markt",
          quantities: { "flower-3": 500, "flower-12": 250, "flower-41": 100 },
          submittedAt: now - 5 * DAY,
        },
        {
          id: "r-2",
          name: "Tobias Kern",
          company: "Linden-Apotheke",
          quantities: { "flower-3": 250, "flower-27": 500 },
          note: "Need delivery before 15 Dec.",
          submittedAt: now - 4 * DAY,
        },
        {
          id: "r-3",
          name: "Aylin Demir",
          company: "Stern Apotheke",
          quantities: { "flower-12": 1000, "flower-27": 250, "flower-41": 250 },
          submittedAt: now - 2 * DAY,
        },
      ],
    },
    {
      id: "demo-new-genetics",
      title: "Interest check: new Sativa line",
      productIds: ["flower-50", "flower-53", "flower-56"],
      recipientIds: [],
      createdAt: now - 2 * DAY,
      expiresAt: now + 12 * DAY,
      responses: [
        {
          id: "r-4",
          name: "Markus Vogel",
          company: "Kranich Apotheke",
          quantities: { "flower-50": 250, "flower-56": 100 },
          submittedAt: now - 1 * DAY,
        },
      ],
    },
  ];
}

export const POLL_LIFETIME_DAYS = 14;
export const POLL_LIFETIME_MS = POLL_LIFETIME_DAYS * DAY;

export function productById(id: string): DemandProduct | undefined {
  return DEMO_PRODUCTS.find((p) => p.id === id);
}

export function contactById(id: string): DemandContact | undefined {
  return DEMO_CONTACTS.find((c) => c.id === id);
}
