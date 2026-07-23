/**
 * Discover company taxonomy — pure, no server/client deps so it's unit-testable
 * and shared by the read (companies.ts) and the UI (CompaniesSection). Reflects
 * the business-category migration (20260704090000): 8 activity codes, legacy
 * `cultivator` dropped (remapped to eu_gmp_cultivator).
 */

// Live data stores lowercase type codes; map to display labels.
const CATEGORY_LABELS: Record<string, string> = {
  pharmacy: "Pharmacy",
  wholesaler: "Wholesaler",
  importer: "Importer",
  gacp_cultivator: "GACP Cultivator",
  eu_gmp_cultivator: "EU-GMP Cultivator",
  tga_gmp_cultivator: "TGA-GMP Cultivator",
  manufacturer_pharma: "Manufacturer Pharma",
  other: "Other",
};

/** Display label for a company-type code; unknown codes fall back to title-case. */
export function categoryLabel(code: string): string {
  return CATEGORY_LABELS[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
}

/** The pharmacy display label — the one tag that, alone, hides a company. */
export const PHARMACY_LABEL = "Pharmacy";

/** The non-pharmacy activity labels — the Discover type facets. */
export const SELLER_TYPE_LABELS = [
  "Wholesaler",
  "Importer",
  "GACP Cultivator",
  "EU-GMP Cultivator",
  "TGA-GMP Cultivator",
  "Manufacturer Pharma",
  "Other",
] as const;

/**
 * A company is LISTED in the default Discover view unless it is pharmacy-ONLY
 * (every tag is Pharmacy). Pharmacy-only companies are hidden but stay
 * name-searchable; an untagged company (no categories) is listed. Operates on
 * display labels (a DiscoverCompany's `categories`).
 */
export function isListedCompany(categories: string[]): boolean {
  return !(categories.length > 0 && categories.every((t) => t === PHARMACY_LABEL));
}
