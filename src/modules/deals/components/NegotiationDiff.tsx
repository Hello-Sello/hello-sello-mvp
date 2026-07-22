/**
 * Negotiation diff MODEL (07-07, SELL-01, D-18 — reworked 2026-07-22).
 *
 * A held pending change renders as a code-review-style REDLINE directly inside
 * CardFront's product table (struck red old row → green new row with a CHANGE
 * tag), matching the chosen chat-flipdoc prototype — NOT as a separate boxed
 * section (the earlier rendering this file used to own; Agentation feedback
 * 2026-07-22 retired it).
 *
 * This file now owns only the PURE half: pairing the card's CURRENT lines
 * against the held draft's PROPOSED lines BY `productId` (07-03 carries it on
 * ProposalLineView) — id pairing, never name/index, so duplicate or renamed
 * lines never mis-target — plus the canonical money for proposed lines via
 * `sumLineValue` (D-25; NEVER the prototype's size×units×price). CardFront
 * owns the table rendering.
 */
import { sumLineValue } from "../lib/derive";
import type { LineItemView, ProposalLineView } from "../types";

/** The pairing key: the product id when present (D-18), else the lowercased name
 *  for a free-typed line (which carries no product link). */
function lineKey(productId: string | null, name: string): string {
  return productId ? `pid:${productId}` : `name:${name.trim().toLowerCase()}`;
}

/** Did the SHARED payload of a paired line actually change? */
function changed(cur: LineItemView, next: ProposalLineView): boolean {
  return (
    cur.quantity !== next.quantity ||
    cur.unit !== next.unit ||
    (cur.unitPrice ?? null) !== (next.unitPrice ?? null)
  );
}

/** Value proposed lines on the canonical per-gram basis (via sumLineValue). */
function proposedAsLineItems(lines: ProposalLineView[]): LineItemView[] {
  // sumLineValue only reads quantity / unit / unitPrice; the rest is filler so
  // the money rule stays in ONE place (lib/derive), never re-implemented here.
  return lines.map((l, i) => ({
    id: `proposed-${i}`,
    productId: l.productId,
    productName: l.name,
    thumbnailTint: null,
    cultivar: null,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice ?? 0,
    currency: l.currency,
    lineTotal: 0,
    pzn: null,
    batchId: null,
    batchNumber: null,
    thcPercent: null,
    cbdPercent: null,
  }));
}

/** One entry of the redline: how a (current, proposed) pair renders. */
export type DealDiffEntry =
  | { kind: "same"; key: string; cur: LineItemView; next: ProposalLineView }
  | { kind: "changed"; key: string; cur: LineItemView; next: ProposalLineView }
  | { kind: "removed"; key: string; cur: LineItemView }
  | { kind: "added"; key: string; next: ProposalLineView };

/**
 * Pair current vs proposed lines into ordered diff entries: current lines
 * first (in place), then any purely-added lines — the same stable order the
 * card's table already shows, so rows never jump when a change is held.
 */
export function pairDealDiff(
  current: LineItemView[],
  proposed: ProposalLineView[],
): DealDiffEntry[] {
  const currentByKey = new Map<string, LineItemView>();
  for (const c of current) currentByKey.set(lineKey(c.productId, c.productName), c);
  const proposedByKey = new Map<string, ProposalLineView>();
  for (const p of proposed) proposedByKey.set(lineKey(p.productId, p.name), p);

  const keys: string[] = [];
  for (const c of current) {
    const k = lineKey(c.productId, c.productName);
    if (!keys.includes(k)) keys.push(k);
  }
  for (const p of proposed) {
    const k = lineKey(p.productId, p.name);
    if (!keys.includes(k)) keys.push(k);
  }

  return keys.flatMap((key): DealDiffEntry[] => {
    const cur = currentByKey.get(key) ?? null;
    const next = proposedByKey.get(key) ?? null;
    if (cur && !next) return [{ kind: "removed", key, cur }];
    if (!cur && next) return [{ kind: "added", key, next }];
    if (cur && next) {
      return [{ kind: changed(cur, next) ? "changed" : "same", key, cur, next }];
    }
    return [];
  });
}

/** The proposed deal total — canonical per-gram money (D-25). */
export function proposedLinesTotal(proposed: ProposalLineView[]): number | null {
  return sumLineValue(proposedAsLineItems(proposed));
}

/** One proposed line's value on the same canonical basis (for the Total column). */
export function proposedLineTotal(line: ProposalLineView): number | null {
  return sumLineValue(proposedAsLineItems([line]));
}
