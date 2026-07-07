"use client";

/**
 * Equal-height storefront info box (D-05) with the two prototype bugs fixed (D-06):
 *
 *   Bug 1 — click-away detach. The prototype rebuilt the box HTML on every click,
 *   so the element the click-away listener watched detached and the panel snapped
 *   shut instantly. Here `open` is React state (no innerHTML rebuild) and the
 *   expand/close controls call `e.stopPropagation()`, so the opening click never
 *   bubbles to the document click-away listener that would re-close it.
 *
 *   Bug 2 — panel behind the flip cards. The 3D product cards (perspective /
 *   preserve-3d) create stacking contexts that painted over a translucent info
 *   panel. Here every box owns its own stacking context (`relative z-30`) and the
 *   expanded panel is SOLID WHITE, so it always sits ABOVE the grid.
 *
 * Boxes are equal-height (the parent grid uses items-stretch); overflow content
 * lives in `more` and is revealed by a down-arrow "More" control, collapsing on
 * click-away or the ✕. `DescriptionEditor` is the 2600-char-capped description
 * field (LinkedIn benchmark) used inside the About box.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

/** LinkedIn-benchmark hard cap on the company description (D-05). */
export const DESCRIPTION_MAX = 2600;

export function InfoBox({
  testId,
  title,
  subtitle,
  preview,
  more,
  className = "",
}: {
  testId?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  preview: React.ReactNode;
  /** Overflow content revealed on expand. When absent, the box has no expander. */
  more?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasMore = Boolean(more);

  // Click-away collapse. Attached only while open, AFTER the opening click has
  // finished bubbling — combined with stopPropagation on the openers, the panel
  // never closes on the same click that opened it (Bug 1 fix).
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      // relative z-30 → own stacking context ABOVE the flip-card grid (Bug 2). Solid
      // white when open so the expanded panel is never see-through / behind a card.
      className={`relative z-30 flex flex-col rounded-3xl p-5 ring-1 ring-ink/5 transition-shadow ${
        open ? "bg-white shadow-xl" : "glass"
      } ${className}`}
      onClick={() => {
        if (hasMore && !open) setOpen(true);
      }}
    >
      {title && <h3 className="text-lg font-bold tracking-tight text-ink">{title}</h3>}
      {subtitle}
      <div className="mt-1 min-h-0">{preview}</div>

      {hasMore && !open && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="mt-auto inline-flex items-center gap-1 self-center rounded-full bg-brand/[0.07] px-3 py-1.5 pt-2 text-[11px] font-bold text-brand-deep hover:bg-brand/10"
        >
          More <ChevronDown size={13} />
        </button>
      )}

      {open && (
        <div data-testid="info-more" className="mt-2">
          {more}
          <button
            type="button"
            aria-label="Close"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-ink/5 px-3 py-1.5 text-[11px] font-bold text-ink/60 hover:bg-ink/10"
          >
            <X size={13} /> Close
          </button>
        </div>
      )}
    </div>
  );
}

/** Controlled company-description field: a textarea hard-capped at DESCRIPTION_MAX
 *  (2600) with a live counter. Used inside the About InfoBox in edit mode. */
export function DescriptionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <textarea
        aria-label="Company description"
        value={value}
        maxLength={DESCRIPTION_MAX}
        onChange={(e) => onChange(e.target.value.slice(0, DESCRIPTION_MAX))}
        rows={5}
        placeholder="Describe your company — what you grow, certify, and supply…"
        className="w-full resize-none rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-brand"
      />
      <div className="mt-1 text-right text-[10px] font-semibold text-ink/40">
        {value.length}/{DESCRIPTION_MAX}
      </div>
    </div>
  );
}
