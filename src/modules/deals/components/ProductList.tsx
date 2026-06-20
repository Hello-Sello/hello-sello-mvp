/**
 * Deal card - product line-item list (3a, Phase 3; V3 reskin, Phase 4 S2).
 *
 * The dense products block on the card front (V3 prototype `.prod` row). Each row
 * = one snapshot line item: a cultivar-coded gradient thumb (IND / SAT / HYB), the
 * name, a wrapping meta line (cultivar · volume · PZN · Batch) with THC/CBD shown
 * as small coloured chips, and the per-unit price + quantity on the right.
 *
 * 3f clip fix (Phase 4): the old single `truncate` meta line clipped Batch / THC /
 * CBD on a narrow card. The meta is now split into a descriptive text line plus a
 * `flex-wrap` THC/CBD chip row, so nothing clips when the card is 390px wide.
 *
 * The thumbnail is NOT clickable yet (a later layer opens that product's own card
 * - prototype note + DEV-37).
 */
import { formatMoney } from "../lib/derive";
import type { LineItemView } from "../types";

/**
 * Per-cultivar thumbnail gradient (V3 `.tint-*`), so the three thumbs read as
 * intentionally distinct, not placeholder repeats. Falls back to a neutral
 * grey-pink for custom / unknown cultivars.
 */
const TINT: Record<string, string> = {
  indica: "bg-gradient-to-br from-[#8b5cf6] to-[#6d28d9]",
  sativa: "bg-gradient-to-br from-[#f59e0b] to-[#d97706]",
  hybrid: "bg-gradient-to-br from-[#10b981] to-[#047857]",
};
const tintFor = (hint: string | null): string =>
  (hint && TINT[hint.toLowerCase()]) || "bg-gradient-to-br from-[#cbb8c6] to-[#9a8a96]";

/** The 3-letter code baked into each thumb (IND / SAT / HYB; else first 3 letters). */
const CULTIVAR_CODE: Record<string, string> = {
  indica: "IND",
  sativa: "SAT",
  hybrid: "HYB",
};
const codeFor = (cultivar: string | null): string => {
  if (!cultivar) return "CST";
  return CULTIVAR_CODE[cultivar.toLowerCase()] ?? cultivar.slice(0, 3).toUpperCase();
};

/** "2000 g" → "2.0 kg"; otherwise "{qty} {unit}". */
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
      <div className="px-1 py-3 text-center text-[11px] text-ink/40">
        No products on this deal yet.
      </div>
    );
  }

  return (
    <div className="flex max-h-44 flex-col overflow-y-auto px-1">
      {items.map((p) => {
        // 3f fix: the descriptive meta (cultivar · volume · PZN · Batch) is one
        // line; THC/CBD are CHIPS on a flex-wrap row so they wrap, never clip.
        const meta = [
          p.cultivar,
          volumeLabel(p.quantity, p.unit),
          p.pzn ? `PZN ${p.pzn}` : null,
          p.batchNumber ? `Batch ${p.batchNumber}` : null,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <div
            key={p.id}
            className="flex items-center gap-2.5 border-b border-ink/10 py-1.5 last:border-b-0"
            title="Product card opens here (coming soon)"
          >
            {/* cultivar-coded gradient thumb - distinct per strain */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tintFor(p.thumbnailTint ?? p.cultivar)}`}
            >
              <span className="text-[10px] font-bold tracking-wide text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.22)]">
                {codeFor(p.thumbnailTint ?? p.cultivar)}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-ink">{p.productName}</div>
              {/* line 1: descriptive text */}
              {meta && (
                <div className="truncate text-[11px] tabular-nums text-ink/55">{meta}</div>
              )}
              {/* line 2: THC/CBD chips - flex-wrap so Batch/THC/CBD never clip (3f) */}
              {(p.thcPercent != null || p.cbdPercent != null) && (
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {p.thcPercent != null && (
                    <span className="inline-flex items-center rounded-md bg-[#b5179e]/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-[#b5179e]">
                      THC {p.thcPercent}
                    </span>
                  )}
                  {p.cbdPercent != null && (
                    <span className="inline-flex items-center rounded-md bg-[#1b998b]/12 px-1.5 py-px text-[11px] font-semibold tabular-nums text-[#1b998b]">
                      CBD {p.cbdPercent}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[13px] font-bold tabular-nums text-ink">
                {formatMoney(p.unitPrice, p.currency)}
                <span className="text-[10px] font-normal text-ink/45">/{p.unit}</span>
              </div>
              <div className="text-[11px] tabular-nums text-ink/55">
                {volumeLabel(p.quantity, p.unit)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
