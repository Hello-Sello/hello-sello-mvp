/**
 * Pure location grouping/filtering behind the Present shop's location dropdown.
 * No React, no Supabase — just the "Germany | UK | All" logic so it stays
 * unit-testable (locationFilter.test.ts is the contract this satisfies).
 *
 * The rule: "All" returns everything (including null-location products); a named
 * location returns only its own products; a null-location product surfaces ONLY
 * under "All", never under a named location.
 */

/** The one field this module reads. ShopProduct satisfies it, as do the test's
 *  lightweight fixtures — the helpers stay generic so any located row works. */
export type Located = { location: string | null };

/** Sentinel meaning "no location assigned" — its own divider group in the grid. */
export const UNASSIGNED = "Unassigned";

/**
 * Filter to the active location tab. `"All"` returns every product (order
 * preserved, null-location included); a named location returns only its matches;
 * a null-location product never appears under a named location.
 */
export function filterByLocation<T extends Located>(products: T[], location: string): T[] {
  if (location === "All") return products;
  return products.filter((p) => p.location === location);
}

/** One rendered location group: its label and the products that belong to it. */
export type LocationGroup<T extends Located> = { location: string; products: T[] };

/**
 * Group products into ordered location sections for the grid dividers. Named
 * locations come first in first-seen order; null-location products fall into a
 * trailing `UNASSIGNED` bucket (only when at least one exists). Insertion order
 * within each group is preserved.
 */
export function groupByLocation<T extends Located>(products: T[]): LocationGroup<T>[] {
  const named = new Map<string, T[]>();
  const unassigned: T[] = [];
  for (const p of products) {
    if (p.location === null) {
      unassigned.push(p);
    } else {
      const bucket = named.get(p.location);
      if (bucket) bucket.push(p);
      else named.set(p.location, [p]);
    }
  }
  const groups: LocationGroup<T>[] = [...named].map(([location, products]) => ({
    location,
    products,
  }));
  if (unassigned.length > 0) groups.push({ location: UNASSIGNED, products: unassigned });
  return groups;
}
