// PLACEHOLDER data for the Discover directory UI. Swapped for a real
// `list_discoverable_companies()` RPC when the data slice lands (see
// docs/build/discover-directory.md). Shape = only the safe fields a stranger
// may see before requesting entry: logo glyph, name, category, country.

export type Category =
  | "Cultivator"
  | "Wholesaler"
  | "Distributor"
  | "Importer"
  | "Pharmacy";

export type LogoGlyph =
  | "leaf" | "sprout" | "snow" | "warehouse" | "boxes"
  | "truck" | "ship" | "anchor" | "pill" | "cross"
  | "mountain" | "globe" | "sun" | "flame";

export type Company = {
  id: string;
  name: string;
  category: Category;
  country: string;
  tint: string;
  glyph: LogoGlyph;
};

export const CATEGORIES: Category[] = [
  "Cultivator",
  "Wholesaler",
  "Distributor",
  "Importer",
  "Pharmacy",
];

export const COMPANIES: Company[] = [
  { id: "1", name: "GreenLeaf Cultivators", category: "Cultivator", country: "Germany", tint: "#34b233", glyph: "leaf" },
  { id: "2", name: "Nordic Hemp Co.", category: "Cultivator", country: "Denmark", tint: "#6c7bd9", glyph: "snow" },
  { id: "3", name: "Iberia Wholesale", category: "Wholesaler", country: "Spain", tint: "#e30b5d", glyph: "warehouse" },
  { id: "4", name: "Lowlands Distribution", category: "Distributor", country: "Netherlands", tint: "#f59e0b", glyph: "truck" },
  { id: "5", name: "Atlantic Imports", category: "Importer", country: "Portugal", tint: "#0ea5e9", glyph: "ship" },
  { id: "6", name: "Bayer Apotheke Mitte", category: "Pharmacy", country: "Germany", tint: "#8b5cf6", glyph: "cross" },
  { id: "7", name: "Maple North Growers", category: "Cultivator", country: "Canada", tint: "#ef4444", glyph: "sprout" },
  { id: "8", name: "Rhein Wholesale Group", category: "Wholesaler", country: "Germany", tint: "#14b8a6", glyph: "boxes" },
  { id: "9", name: "Lisboa Pharma", category: "Pharmacy", country: "Portugal", tint: "#ec4899", glyph: "pill" },
  { id: "10", name: "Alpine Distribution", category: "Distributor", country: "Switzerland", tint: "#64748b", glyph: "mountain" },
  { id: "11", name: "Helvetia Importers", category: "Importer", country: "Switzerland", tint: "#22c55e", glyph: "anchor" },
  { id: "12", name: "Catalonia Cultivars", category: "Cultivator", country: "Spain", tint: "#a855f7", glyph: "sun" },
];

export const COUNTRIES = Array.from(
  new Set(COMPANIES.map((c) => c.country)),
).sort();
