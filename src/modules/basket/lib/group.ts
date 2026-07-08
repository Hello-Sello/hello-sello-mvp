import type { BasketLine, BasketGroup } from "../types";

/**
 * Group cart lines by their seller company (the product's owner). The viewer's
 * OWN company group is flagged `isOwnCompany` and carries no relationship (a
 * seller offering their own products picks a recipient at Send); every other
 * group carries the relationship that lets its offer become a Deal Card. Order
 * is first-seen so the drawer is stable across refetches.
 */
export function groupBySeller(
  lines: BasketLine[],
  viewerCompanyId: string,
  relationshipIdByCompany: Map<string, string>,
): BasketGroup[] {
  const byCompany = new Map<string, BasketGroup>();
  for (const l of lines) {
    let g = byCompany.get(l.sellerCompanyId);
    if (!g) {
      const isOwnCompany = l.sellerCompanyId === viewerCompanyId;
      g = {
        sellerCompanyId: l.sellerCompanyId,
        sellerCompanyName: l.sellerCompanyName,
        isOwnCompany,
        relationshipId: isOwnCompany ? null : (relationshipIdByCompany.get(l.sellerCompanyId) ?? null),
        lines: [],
      };
      byCompany.set(l.sellerCompanyId, g);
    }
    g.lines.push(l);
  }
  return [...byCompany.values()];
}
