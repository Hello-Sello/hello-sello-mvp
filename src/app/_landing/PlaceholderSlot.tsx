/**
 * The load-bearing labeled-slot primitive (D-04/D-06). One place to restyle or
 * fill: every "no real content yet" region (logo bar, testimonials, metrics)
 * renders a PlaceholderSlot instead of fabricated content. Filling a slot later
 * is a content swap (`<PlaceholderSlot/>` → real asset), not a structural
 * rebuild — so the slot reserves real layout space (min-h) to avoid reflow on
 * swap (Pitfall 6).
 *
 * Styled as a soft glass panel with a dashed brand frame so the unfilled state is
 * visually unmistakable yet on-brand (D-06: no fake content). For app-screenshot
 * slots use `PreviewFrame` instead (adds the browser chrome).
 */

// Reserve real layout space per slot so the eventual content swap does not
// reflow the page. Heights are deliberately generous (this is interim — D-15).
const ASPECT_CLASS = {
  video: "min-h-56",
  wide: "min-h-40",
  square: "min-h-72",
} as const;

export function PlaceholderSlot({
  label,
  hint,
  aspect = "wide",
}: {
  label: string;
  hint?: string;
  aspect?: keyof typeof ASPECT_CLASS;
}) {
  return (
    <div
      className={`flex ${ASPECT_CLASS[aspect]} flex-col items-center justify-center rounded-3xl border border-dashed border-brand/25 bg-gradient-to-b from-brand-soft/15 to-transparent p-8 text-center`}
    >
      <span className="rounded-full bg-brand-soft/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
        Placeholder
      </span>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      {hint && <p className="mt-1 max-w-xs text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
