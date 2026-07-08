/**
 * On-card red/green negotiation diff (07-07, SELL-01, D-18).
 *
 * A held pending change renders as a code-review-style diff DIRECTLY on the card
 * (no Sella popup, no curtain). The diff is computed CLIENT-SIDE (D-18, no new
 * storage) by pairing the card's CURRENT line items against the held draft's
 * PROPOSED lines BY `productId` (07-03 now carries it on ProposalLineView) - id
 * pairing, never name/index, so duplicate or renamed lines never mis-target.
 *
 * Each changed line shows the struck OLD line (red) above the NEW line (green);
 * a line only in the current set is a REMOVAL (struck red); a line only in the
 * proposal is an ADDITION (green). The proposed total is the CANONICAL per-gram
 * money via `sumLineValue` / `lineValueOf` (D-25) - NEVER the prototype's
 * size x units x price. The two actions (Negotiate / Sign) live in DecisionBar,
 * not here: this component is a pure renderer of the change.
 */
import { formatMoney, sumLineValue } from "../lib/derive";
import type { LineItemView, ProposalLineView } from "../types";

/** The pairing key: the product id when present (D-18), else the lowercased name
 *  for a free-typed line (which carries no product link). */
function lineKey(productId: string | null, name: string): string {
  return productId ? `pid:${productId}` : `name:${name.trim().toLowerCase()}`;
}

/** Value one proposed line on the canonical per-gram basis (via sumLineValue). */
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

/** A one-line label for a line: "12 kg · 3.60 €/g" (price omitted when null). */
function lineLabel(quantity: number, unit: string, unitPrice: number | null, currency: string): string {
  const money = unitPrice != null ? ` · ${formatMoney(unitPrice, currency)}/${unit}` : "";
  return `${quantity} ${unit}${money}`;
}

function changed(cur: LineItemView, next: ProposalLineView): boolean {
  return (
    cur.quantity !== next.quantity ||
    cur.unit !== next.unit ||
    (cur.unitPrice ?? null) !== (next.unitPrice ?? null)
  );
}

/** One struck (removed/old) diff row - red, bleeding to the paper edges. */
function OldRow({ name, detail }: { name: string; detail: string }) {
  return (
    <div className="dc-row-old flex items-baseline justify-between gap-3 px-2 py-1.5 text-[12px]">
      <span className="min-w-0 flex-1 truncate line-through text-[color:var(--dc-red)]">{name}</span>
      <span className="shrink-0 font-mono text-[11px] line-through text-[color:var(--dc-red)]">
        {detail}
      </span>
    </div>
  );
}

/** One new/added diff row - green, with an optional "Change" badge. */
function NewRow({ name, detail, badge }: { name: string; detail: string; badge?: boolean }) {
  return (
    <div className="dc-row-new flex items-baseline justify-between gap-3 px-2 py-1.5 text-[12px]">
      <span className="min-w-0 flex-1 truncate font-medium text-[color:var(--dc-green)]">
        {name}
        {badge && (
          <span className="dc-badge-change ml-2 inline-block rounded-md px-1.5 py-0.5 align-[1px] text-[8px] font-extrabold uppercase">
            Change
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[11px] font-semibold text-[color:var(--dc-green)]">
        {detail}
      </span>
    </div>
  );
}

export function NegotiationDiff({
  current,
  proposed,
  currency,
}: {
  /** the card's CURRENT-version line items */
  current: LineItemView[];
  /** the held draft's PROPOSED lines (carry productId from 07-03) */
  proposed: ProposalLineView[];
  currency: string;
}) {
  const currentByKey = new Map<string, LineItemView>();
  for (const c of current) currentByKey.set(lineKey(c.productId, c.productName), c);
  const proposedByKey = new Map<string, ProposalLineView>();
  for (const p of proposed) proposedByKey.set(lineKey(p.productId, p.name), p);

  // stable order: current lines first (in place), then any purely-added lines.
  const keys: string[] = [];
  for (const c of current) {
    const k = lineKey(c.productId, c.productName);
    if (!keys.includes(k)) keys.push(k);
  }
  for (const p of proposed) {
    const k = lineKey(p.productId, p.name);
    if (!keys.includes(k)) keys.push(k);
  }

  const currentTotal = sumLineValue(current);
  const proposedTotal = sumLineValue(proposedAsLineItems(proposed));

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--dc-hairline)] bg-white/50">
      <div className="flex items-center gap-1.5 border-b border-[color:var(--dc-hairline)] px-2.5 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--dc-red)]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--dc-green)]" />
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          Proposed change
        </span>
      </div>

      <div className="flex flex-col">
        {keys.map((k) => {
          const cur = currentByKey.get(k) ?? null;
          const next = proposedByKey.get(k) ?? null;

          // removed: in current, not in proposal
          if (cur && !next) {
            return (
              <OldRow
                key={k}
                name={cur.productName}
                detail={lineLabel(cur.quantity, cur.unit, cur.unitPrice, cur.currency)}
              />
            );
          }
          // added: in proposal, not in current
          if (!cur && next) {
            return (
              <NewRow
                key={k}
                name={next.name}
                detail={lineLabel(next.quantity, next.unit, next.unitPrice, next.currency)}
              />
            );
          }
          // both present
          if (cur && next) {
            if (!changed(cur, next)) {
              return (
                <div
                  key={k}
                  className="flex items-baseline justify-between gap-3 px-2 py-1.5 text-[12px] text-[color:var(--dc-ink-55)]"
                >
                  <span className="min-w-0 flex-1 truncate">{next.name}</span>
                  <span className="shrink-0 font-mono text-[11px]">
                    {lineLabel(next.quantity, next.unit, next.unitPrice, next.currency)}
                  </span>
                </div>
              );
            }
            return (
              <div key={k} className="flex flex-col">
                <OldRow
                  name={cur.productName}
                  detail={lineLabel(cur.quantity, cur.unit, cur.unitPrice, cur.currency)}
                />
                <NewRow
                  name={next.name}
                  detail={lineLabel(next.quantity, next.unit, next.unitPrice, next.currency)}
                  badge
                />
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* proposed total - canonical per-gram money via sumLineValue */}
      <div className="flex items-baseline justify-between gap-3 border-t border-[color:var(--dc-hairline)] px-2.5 py-2 text-[12px]">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          New total
        </span>
        <span className="flex items-baseline gap-2">
          {currentTotal != null && proposedTotal != null && currentTotal !== proposedTotal && (
            <span className="font-mono text-[11px] line-through text-[color:var(--dc-ink-38)]">
              {formatMoney(currentTotal, currency)}
            </span>
          )}
          <span className="font-mono text-[14px] font-bold text-[color:var(--dc-green)]">
            {proposedTotal == null ? "—" : formatMoney(proposedTotal, currency)}
          </span>
        </span>
      </div>
    </div>
  );
}
