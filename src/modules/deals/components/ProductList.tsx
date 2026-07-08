/**
 * Deal card - product line-item table (07-07 paper polish).
 *
 * The read-only products block on the card front, restyled to the deal-card
 * prototype's "living document" look: a column table on the white paper slip -
 * Product | Volume | Price | Total - with right-aligned mono numerals so the
 * figures line up like an invoice. Each row is one snapshot line item; a small
 * cultivar-coded dot keeps the strain coding without the old thumbnail block,
 * and the secondary meta (cultivar / PZN / batch / THC / CBD) wraps under the
 * name so nothing clips on the ~420px side panel.
 *
 * Money stays canonical (CARD-02): the Total column is `lineValueOf` (per-gram),
 * NEVER size x units x price. Presentation only - no behavior here.
 */
import { formatMoney, lineValueOf } from "../lib/derive";
import type { LineItemView } from "../types";

/** Per-cultivar dot colour, so the three strains read as distinct on the paper. */
const DOT: Record<string, string> = {
  indica: "bg-[#7c3aed]",
  sativa: "bg-[#d97706]",
  hybrid: "bg-[#059669]",
};
const dotFor = (hint: string | null): string =>
  (hint && DOT[hint.toLowerCase()]) || "bg-[#b08a9c]";

/** "2000 g" -> "2.0 kg"; otherwise "{qty} {unit}". */
function volumeLabel(quantity: number, unit: string): string {
  if (unit === "g" && quantity >= 1000) {
    const kg = quantity / 1000;
    return `${kg % 1 === 0 ? kg.toFixed(1) : String(kg)} kg`;
  }
  return `${quantity} ${unit}`;
}

export function ProductList({ items }: { items: LineItemView[] }) {
  if (items.length === 0) {
    return (
      <div className="px-1 py-3 text-center text-[11px] text-[color:var(--dc-ink-38)]">
        No products on this deal yet.
      </div>
    );
  }

  return (
    <div>
      {/* column header - the invoice ruling */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-b border-[color:var(--dc-hairline)] pb-2 pt-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          Product
        </span>
        <span className="text-right text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          Price
        </span>
        <span className="text-right text-[9px] font-bold uppercase tracking-[0.14em] text-[color:var(--dc-ink-38)]">
          Total
        </span>
      </div>

      <div className="max-h-52 overflow-y-auto">
        {items.map((p) => {
          const meta = [
            p.cultivar,
            p.pzn ? `PZN ${p.pzn}` : null,
            p.batchNumber ? `Batch ${p.batchNumber}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          const total = lineValueOf(p.quantity, p.unit, p.unitPrice);

          return (
            <div
              key={p.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 border-b border-[color:var(--dc-hairline)] py-2.5 last:border-b-0"
              title="Product card opens here (coming soon)"
            >
              {/* product name + wrapping meta */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotFor(p.thumbnailTint ?? p.cultivar)}`} />
                  <span className="truncate text-[13px] font-semibold text-[color:var(--dc-ink)]">
                    {p.productName}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-3.5 text-[10.5px] tabular-nums text-[color:var(--dc-ink-55)]">
                  <span>{volumeLabel(p.quantity, p.unit)}</span>
                  {meta && <span className="truncate">{meta}</span>}
                  {p.thcPercent != null && (
                    <span className="font-semibold text-[color:var(--dc-pink-deep)]">
                      THC {p.thcPercent}
                    </span>
                  )}
                  {p.cbdPercent != null && (
                    <span className="font-semibold text-info">CBD {p.cbdPercent}</span>
                  )}
                </div>
              </div>

              {/* price / unit */}
              <div className="whitespace-nowrap text-right font-mono text-[12px] tabular-nums text-[color:var(--dc-ink-70)]">
                {formatMoney(p.unitPrice, p.currency)}
                <span className="text-[9px] text-[color:var(--dc-ink-38)]">/{p.unit}</span>
              </div>

              {/* line total - canonical per-gram money */}
              <div className="whitespace-nowrap text-right font-mono text-[12.5px] font-semibold tabular-nums text-[color:var(--dc-ink)]">
                {formatMoney(total, p.currency)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
