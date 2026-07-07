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

/** Rows carrying a stable id — the unit an in-shop reorder moves around. */
export type Identified = { id: string };

/**
 * Move `draggedId` to sit immediately before `targetId`, returning the new id
 * order. A no-op (returns the input order) when either id is missing or they are
 * the same — so a bad drop never scrambles the list. Pure: the client-only
 * `productOrder` reorder (drag a card within its shop) is built from this.
 */
export function moveBefore(ids: string[], draggedId: string, targetId: string): string[] {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1);
  // Re-find the target's index in the reduced array (it shifts left when the
  // dragged card sat before it) so the insert lands just ahead of the target.
  next.splice(next.indexOf(targetId), 0, draggedId);
  return next;
}

/**
 * Re-sort each group's products by a client-only id order keyed by group label
 * (the in-shop drag reorder). Groups with no saved order are returned untouched;
 * within an ordered group, any product not named in the order keeps its natural
 * position after the named ones (stable). No location moves here — that is the
 * server's `setProductLocation`; this is presentation only.
 */
export function applyProductOrder<T extends Located & Identified>(
  groups: LocationGroup<T>[],
  order: Record<string, string[]>,
): LocationGroup<T>[] {
  return groups.map((g) => {
    const ids = order[g.location];
    if (!ids) return g;
    const rank = new Map(ids.map((id, i) => [id, i]));
    const products = g.products
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ra = rank.get(a.p.id);
        const rb = rank.get(b.p.id);
        if (ra == null && rb == null) return a.i - b.i; // both unranked → stable
        if (ra == null) return 1; // unranked sinks below ranked
        if (rb == null) return -1;
        return ra - rb;
      })
      .map((x) => x.p);
    return { ...g, products };
  });
}
