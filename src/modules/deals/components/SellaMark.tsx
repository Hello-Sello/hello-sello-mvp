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
        open ? (side === "left" ? "-translate-x-2" : "translate-x-2") : "",
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
  // The `//` mark with the cue WORD held BETWEEN the two bars (| Review |), a
  // strong attention dot ON TOP for "review", and the bars parting on `open`.
  const inner = (
    <span className="relative inline-flex items-center gap-1.5">
      {cue === "review" && (
        // the attention dot sits ON TOP of the mark with a strong ping + pulse so
        // it actually pulls a general user's eye (D-09 "your turn"); centered.
        <span className="absolute -top-2.5 left-1/2 flex h-3 w-3 -translate-x-1/2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="relative inline-flex h-3 w-3 animate-pulse rounded-full bg-brand ring-2 ring-white" />
        </span>
      )}
      <Bar thinking={thinking} open={open} side="left" delayMs={0} />
      {cue === "review" ? (
        <span className="text-[11px] font-semibold text-brand-deep">Review</span>
      ) : cue === "awaiting" ? (
        <span className="text-[11px] font-medium text-ink/50">Awaiting reply</span>
      ) : null}
      <Bar thinking={thinking} open={open} side="right" delayMs={140} />
    </span>
  );

  // Premium + calm (04A polish): no pink fill. A whisper-soft glass hover only
  // when it is the curtain's interactive entry. The maroon `//` is the one accent.
  const rootClass = [
    "inline-flex shrink-0 items-center rounded-full px-2.5 py-1",
    onClick ? "cursor-pointer transition hover:bg-black/[0.04]" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label="Sella" className={rootClass}>
        {inner}
      </button>
    );
  }

  return (
    <span aria-label="Sella" className={rootClass}>
      {inner}
    </span>
  );
}
