/**
 * Deal card - product line-item list (3a, Phase 3).
 *
 * The scrollable products block on the card front. Each row = one snapshot line
 * item: a small tinted thumbnail (by dominance), the name + per-unit price, and
 * cultivar · volume · PZN underneath. The thumbnail is NOT clickable yet (a later
 * layer opens that product's own card - prototype note + DEV-37).
 */
import { Leaf } from "lucide-react";
import { formatMoney } from "../lib/derive";
import type { LineItemView } from "../types";

/** Soft tint per dominance, echoing the prototype's per-strain colour chips. */
const TINT: Record<string, string> = {
  indica: "bg-violet-100 text-violet-600",
  sativa: "bg-amber-100 text-amber-600",
  hybrid: "bg-emerald-100 text-emerald-600",
};
const tintFor = (hint: string | null): string =>
  (hint && TINT[hint.toLowerCase()]) || "bg-ink/5 text-ink/40";

/** "2000 g" → "2.0 kg"; otherwise "{qty} {unit}". */
function volumeLabel(quantity: number, unit: string): string {
  if (unit === "g" && quantity >= 1000) {
    const kg = quantity / 1000;
    return `${kg % 1 === 0 ? kg.toFixed(1) : String(kg)} kg`;
  }
  return `${quantity} ${unit}`;
}

export function ProductList({ items }: { items: LineItemView[] }) {
  return (
    <div className="rounded-xl bg-white p-2">
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-xs font-semibold text-ink/60">Products ({items.length})</span>
        {items.length > 4 && <span className="text-[10px] text-ink/35">scroll ↓</span>}
      </div>
      <div className="max-h-36 divide-y divide-ink/5 overflow-y-auto">
        {items.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2.5 px-1 py-1.5"
            title="Product card opens here (coming soon)"
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintFor(p.thumbnailTint)}`}
            >
              <Leaf className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold text-ink">{p.productName}</span>
                <span className="shrink-0 text-[11px] font-medium text-ink/80">
                  {formatMoney(p.unitPrice, p.currency)}/{p.unit}
                </span>
              </div>
              <div className="truncate text-[10px] text-ink/45">
                {[
                  p.cultivar,
                  volumeLabel(p.quantity, p.unit),
                  p.pzn ? `PZN ${p.pzn}` : null,
                  // BTCH-01 (D-03): the frozen batch number + the batch's MEASURED
                  // THC/CBD (never the product label). Functionality only - the
                  // visual arrangement is Phase 6.
                  p.batchNumber ? `Batch ${p.batchNumber}` : null,
                  p.thcPercent != null ? `THC ${p.thcPercent}%` : null,
                  p.cbdPercent != null ? `CBD ${p.cbdPercent}%` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="px-1 py-3 text-center text-[11px] text-ink/40">No products on this deal yet.</div>
        )}
      </div>
    </div>
  );
}
