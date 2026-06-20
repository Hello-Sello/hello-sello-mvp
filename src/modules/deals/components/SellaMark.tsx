"use client";

/**
 * The shared Sella mark - the maroon `//` parallel-bars (D-06). This is the one
 * Sella visual mark used everywhere the old icon-and-letters pill appeared. It
 * draws the `//` as TWO CSS-drawn skewed bars in the `--color-brand-deep`
 * (#76002d) brand token - never an icon and never a literal "//" text glyph -
 * so it reads as one calm, branded voice.
 *
 * Presentational + self-contained: no reads, no actions, no counterparty data.
 * Wiring it into `DealPin` (the swap-in) and the module barrel is the Wave-2
 * integration plan's job (04A-04); this file only defines the component.
 *
 * States it carries without ever growing the strip width:
 *   - clean (cue null/absent) - just the bars, no dot, no chip, no label.
 *   - thinking - a gentle staggered pulse on the bars (the curtain's
 *     "processing" feel, D-07), Tailwind transitions only (D-10).
 *   - cue "review" (LOUD, your turn, D-09) - a raspberry dot + ping halo on the
 *     mark PLUS a short "Review" label. The mark is the single curtain entry
 *     point now (D-08), so the old "Review change" button/popover is dropped.
 *   - cue "awaiting" (QUIET, waiting on them, D-09) - a small muted
 *     "Awaiting reply" chip. NO company name (so the width never grows); the
 *     Withdraw action lives INSIDE the curtain, not on the strip.
 *
 * Interactivity: when `onClick` is given it renders as a `<button>` (the
 * curtain's single entry point, D-08); without it, a non-interactive `<span>`.
 */
export interface SellaMarkProps {
  /** Play a gentle processing/thinking pulse on the bars (D-07, Tailwind-only). */
  thinking?: boolean;
  /** When provided, the mark becomes the curtain's entry button (D-08). */
  onClick?: () => void;
  /**
   * The D-09 hybrid state cue:
   *   - "review"   - LOUD: a dot + halo on the mark and a "Review" label.
   *   - "awaiting" - QUIET: a muted "Awaiting reply" chip (no company name).
   *   - null/absent - CLEAN: no dot, no chip, no label.
   */
  cue?: "review" | "awaiting" | null;
  /** Forwarded onto the root for layout tuning by the host. */
  className?: string;
}

/** One slanted maroon bar of the `//` mark, CSS-drawn (not an icon/glyph). */
function Bar({ thinking, delayMs }: { thinking: boolean; delayMs: number }) {
  return (
    <span
      aria-hidden
      className={[
        "block h-3.5 w-[3px] -skew-x-12 rounded-full bg-[var(--color-brand-deep)] transition-opacity",
        thinking ? "animate-pulse" : "",
      ].join(" ")}
      style={thinking ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

export function SellaMark({
  thinking = false,
  onClick,
  cue = null,
  className = "",
}: SellaMarkProps) {
  // The two skewed bars + the cue dot/halo live together so the loud "review"
  // halo hangs off the mark itself (matches the existing loud pill, DealPin).
  const mark = (
    <span className="relative inline-flex items-center gap-1">
      {cue === "review" && (
        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-soft opacity-80" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" />
        </span>
      )}
      <Bar thinking={thinking} delayMs={0} />
      <Bar thinking={thinking} delayMs={140} />
    </span>
  );

  const label =
    cue === "review" ? (
      <span className="text-[10px] font-semibold text-brand-deep">Review</span>
    ) : cue === "awaiting" ? (
      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-ink/55 ring-1 ring-black/5">
        Awaiting reply
      </span>
    ) : null;

  const rootClass = [
    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5",
    "ring-1 ring-brand/15 bg-brand-soft/40",
    onClick ? "cursor-pointer transition-colors hover:bg-brand-soft/60" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label="Sella"
        className={rootClass}
      >
        {mark}
        {label}
      </button>
    );
  }

  return (
    <span aria-label="Sella" className={rootClass}>
      {mark}
      {label}
    </span>
  );
}
