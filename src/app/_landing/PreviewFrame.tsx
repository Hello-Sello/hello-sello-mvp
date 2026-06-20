/**
 * A browser-chrome "preview" frame for the landing's product slots (Phase 9).
 * Wraps a labeled, dashed placeholder stage in a window frame (traffic-light dots
 * + glass body) so the product-visual and demo slots read as "app preview
 * pending" rather than empty boxes — and crucially, no fabricated screenshots
 * (D-06). Reserves real aspect space so swapping in a real asset later does not
 * reflow the page (Pitfall 6).
 *
 * Note: uses `.glass-strong` on a <div> (never a <header>), so it does not trip
 * the "no app chrome" guard, which counts `header.glass-strong`.
 */
const ASPECT_CLASS = {
  video: "aspect-[16/9]",
  wide: "aspect-[16/6]",
} as const;

export function PreviewFrame({
  label,
  hint,
  aspect = "video",
}: {
  label: string;
  hint?: string;
  aspect?: keyof typeof ASPECT_CLASS;
}) {
  return (
    <div className="glass-strong overflow-hidden rounded-2xl border border-ink/10 shadow-[0_30px_80px_-30px_rgba(118,0,45,0.4)]">
      <div className="flex h-9 items-center gap-2 border-b border-ink/10 px-4">
        <span className="h-3 w-3 rounded-full bg-brand-soft" />
        <span className="h-3 w-3 rounded-full bg-brand-soft/70" />
        <span className="h-3 w-3 rounded-full bg-brand-soft/50" />
      </div>
      <div
        className={`relative grid ${ASPECT_CLASS[aspect]} place-items-center bg-gradient-to-b from-brand-soft/15 to-transparent p-8 text-center`}
      >
        <div className="rounded-2xl border border-dashed border-brand/25 px-6 py-5">
          <span className="rounded-full bg-brand-soft/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
            Placeholder
          </span>
          <p className="mt-2 text-sm font-medium text-ink">{label}</p>
          {hint && <p className="mt-1 max-w-xs text-xs text-ink-muted">{hint}</p>}
        </div>
      </div>
    </div>
  );
}
