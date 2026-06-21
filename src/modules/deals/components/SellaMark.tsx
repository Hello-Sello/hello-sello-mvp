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
  /** The curtain is open - the two bars part like a curtain (D-10 polish). */
  open?: boolean;
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

/** One slanted maroon bar of the `//` mark, CSS-drawn (not an icon/glyph). On
 *  `open` the two bars PART like a curtain (translate-x apart) just before the
 *  drawer drops; on `thinking` they pulse. */
function Bar({
  thinking,
  open,
  side,
  delayMs,
}: {
  thinking: boolean;
  open: boolean;
  side: "left" | "right";
  delayMs: number;
}) {
  return (
    <span
      aria-hidden
      className={[
        "block h-4 w-[3px] -skew-x-12 rounded-full bg-[var(--color-brand-deep)] transition-transform duration-300 ease-out",
        thinking ? "animate-pulse" : "",
        open ? (side === "left" ? "-translate-x-1.5" : "translate-x-1.5") : "",
      ].join(" ")}
      style={thinking ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

export function SellaMark({
  thinking = false,
  open = false,
  onClick,
  cue = null,
  className = "",
}: SellaMarkProps) {
  // The two skewed bars + the cue dot/halo live together so the loud "review"
  // halo hangs off the mark itself. The bars PART on `open` (the curtain).
  const mark = (
    <span className="relative inline-flex items-center gap-1">
      {cue === "review" && (
        <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand ring-2 ring-white" />
        </span>
      )}
      <Bar thinking={thinking} open={open} side="left" delayMs={0} />
      <Bar thinking={thinking} open={open} side="right" delayMs={140} />
    </span>
  );

  const label =
    cue === "review" ? (
      <span className="text-[11px] font-semibold text-brand-deep">Review</span>
    ) : cue === "awaiting" ? (
      <span className="text-[11px] font-medium text-ink/50">Awaiting reply</span>
    ) : null;

  // Premium + calm (04A polish): the cheap-looking pink fill is gone. Just the
  // mark + label, with a whisper-soft glass hover only when it is the curtain's
  // interactive entry point. The maroon `//` is the one accent.
  const rootClass = [
    "inline-flex shrink-0 items-center gap-2 rounded-full px-2.5 py-1",
    onClick ? "cursor-pointer transition hover:bg-black/[0.04]" : "",
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
