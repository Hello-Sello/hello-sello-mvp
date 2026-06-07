/**
 * Stub content for surfaces not yet built. Keeps every route renderable (no
 * 404s) until its owner fills it in. `soon` surfaces note they're coming.
 */
export function SurfacePlaceholder({
  title,
  blurb,
  soon = false,
}: {
  title: string;
  blurb: string;
  soon?: boolean;
}) {
  return (
    <div className="glass flex h-full flex-col items-center justify-center rounded-3xl p-10 text-center">
      {soon && (
        <span className="mb-3 rounded-full bg-brand-soft/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-deep">
          Coming soon
        </span>
      )}
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/55">{blurb}</p>
    </div>
  );
}
