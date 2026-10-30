import type { DemandContact, DemandGroup, DemandPoll, DemandProduct } from "./types";

/**
 * Demo data for the Demand poll preview. Nothing here touches Supabase — the
 * page is a hidden demo (`/demand`), so products, contacts and groups are
 * placeholders ("Flower 1" … "Flower 100") rather than the seller's real shop.
 * Generation is deterministic so server and client render the same list.
 */
export const DEMO_PRODUCTS: DemandProduct[] = Array.from({ length: 100 }, (_, i) => {
  const n = i + 1;
  const month = 1 + ((n * 5) % 12);
  const day = 1 + ((n * 11) % 28);
  return {
    id: `flower-${n}`,
    name: `Flower ${n}`,
    thc: 18 + ((n * 7) % 13), // 18–30 %
    stockKg: 5 + ((n * 3) % 10) * 5, // 5–50 kg
    expiry: `${2027 + (n % 2)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    pricePerGram: 4.5 + ((n * 13) % 40) / 10, // €4.50–€8.40
  };
});

export const DEMO_CONTACTS: DemandContact[] = [
  { id: "c-1", name: "Julia Brandt", company: "Apotheke am Markt", email: "j.brandt@apotheke-am-markt.de", city: "Berlin" },
  { id: "c-2", name: "Tobias Kern", company: "Linden-Apotheke", email: "kern@linden-apo.de", city: "Hamburg" },
  { id: "c-3", name: "Aylin Demir", company: "Stern Apotheke", email: "demir@stern-apotheke.de", city: "München" },
  { id: "c-4", name: "Lukas Weber", company: "Rosen-Apotheke", email: "weber@rosen-apo.de", city: "Köln" },
  { id: "c-5", name: "Sophie Krüger", company: "Apotheke im Hafen", email: "krueger@hafen-apotheke.de", city: "Bremen" },
  { id: "c-6", name: "Markus Vogel", company: "Kranich Apotheke", email: "vogel@kranich-apo.de", city: "Leipzig" },
  { id: "c-7", name: "Elena Schulz", company: "Adler-Apotheke", email: "schulz@adler-apotheke.de", city: "Frankfurt" },
  { id: "c-8", name: "David Lang", company: "Sonnen-Apotheke", email: "lang@sonnen-apo.de", city: "Stuttgart" },
  { id: "c-9", name: "Mia Hoffmann", company: "Berliner Tor Apotheke", email: "hoffmann@berliner-tor.de", city: "Berlin" },
  { id: "c-10", name: "Jonas Fischer", company: "Hirsch-Apotheke", email: "fischer@hirsch-apo.de", city: "Düsseldorf" },
  { id: "c-11", name: "Lea Wagner", company: "Park-Apotheke", email: "wagner@park-apotheke.de", city: "Hamburg" },
  { id: "c-12", name: "Felix Becker", company: "Rathaus-Apotheke", email: "becker@rathaus-apo.de", city: "München" },
];

/** Starter groups — several contacts sit in more than one on purpose. */
export const DEMO_GROUPS: DemandGroup[] = [
  { id: "g-key", name: "Key accounts", memberIds: ["c-1", "c-3", "c-7", "c-9"] },
  { id: "g-north", name: "North", memberIds: ["c-2", "c-5", "c-11", "c-9", "c-1"] },
  { id: "g-south", name: "South", memberIds: ["c-3", "c-8", "c-12"] },
  { id: "g-new", name: "New partners", memberIds: ["c-6", "c-10", "c-12", "c-4"] },
];

export const DEFAULT_FAVORITES = ["g-key", "c-1", "c-3"];

const DAY = 24 * 60 * 60 * 1000;

/** Two finished-looking polls so the Polls section isn't empty on first load. */
export function seedPolls(now: number): DemandPoll[] {
  return [
    {
      id: "demo-q4",
      title: "Q4 restock — what do you need?",
      productIds: ["flower-3", "flower-12", "flower-27", "flower-41"],
      recipientIds: ["c-1", "c-2", "c-3", "c-4"],
      channel: "email",
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
      id: "demo-new-line",
      title: "Interest check: new 28% line",
      productIds: ["flower-50", "flower-53", "flower-56"],
      recipientIds: [],
      channel: "link",
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

/** "12/04/2027" — the day/month/year format the product line uses. */
export function formatExpiry(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** One-line product summary: "25% THC · 25 kg total · Exp 12/04/2027 · €5.00/g". */
export function productLine(p: DemandProduct) {
  return `${p.thc}% THC · ${p.stockKg} kg total · Exp ${formatExpiry(p.expiry)} · €${p.pricePerGram.toFixed(2)}/g`;
}
