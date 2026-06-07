import type { LensKey } from "@/modules/connect/types";
import { LENSES } from "@/modules/connect/lib/lenses";

/**
 * Lens tabs (top of panel 3). Presentational + count-driven: it renders the
 * fixed lenses with the counts it's given and reports selection via `onChange`.
 * Counts are computed by the parent (InboxView) from the same `lib/lenses`
 * source the list filters on, so tab numbers always match the list length.
 */
export interface LensTabsProps {
  active: LensKey;
  counts: Record<LensKey, number>;
  onChange: (lens: LensKey) => void;
}

export function LensTabs({ active, counts, onChange }: LensTabsProps) {
  return (
    <div className="flex items-center border-b border-black/5">
      {LENSES.map((lens) => {
        const isActive = lens.key === active;
        return (
          <button
            key={lens.key}
            type="button"
            onClick={() => onChange(lens.key)}
            aria-current={isActive ? "true" : undefined}
            className={`-mb-px flex items-center gap-1 border-b-2 px-2 py-2 text-xs font-medium transition-colors ${
              isActive
                ? "border-brand text-brand"
                : "border-transparent text-ink/50 hover:text-ink/80"
            }`}
          >
            {lens.label}
            <span
              className={`rounded-full px-1 py-0.5 text-[10px] font-semibold leading-none tabular-nums ${
                isActive ? "bg-brand-soft/60 text-brand-deep" : "bg-ink/8 text-ink/45"
              }`}
            >
              {counts[lens.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
