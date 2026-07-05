"use client";

/**
 * Selectable pack-size bubbles that sit beside the price on the ProductCard front
 * (D-01, DEV-107 #3). v0 renders one bubble per available pack size; selection is
 * local presentation state only. Multi-pack PRICING is out of scope this phase
 * (one price/g + one bundle tier) — this just lets a buyer pick the size they mean.
 */

export function PackSizeSelector({
  sizes,
  selected,
  onSelect,
}: {
  /** Human labels for each pack size, e.g. ["10g", "25g"]. */
  sizes: string[];
  /** Index of the active bubble. */
  selected: number;
  onSelect: (index: number) => void;
}) {
  if (sizes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sizes.map((s, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-pressed={i === selected}
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
            i === selected
              ? "bg-brand text-white"
              : "bg-ink/5 text-ink hover:bg-ink/10"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
