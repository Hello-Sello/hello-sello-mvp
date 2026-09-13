/**
 * Ticker (one-screen landing, the thin strip above the nav). Three short
 * lines move left on a loop: built in Berlin, still a prototype, GDPR
 * compliant. Pure CSS marquee (`.lp-ticker-track` in globals.css) on
 * server-rendered markup. The line is rendered twice so the -50% translate
 * wraps seamlessly; the copy is aria-hidden so screen readers hear it once.
 * Reduced motion stops the movement and the first copy reads as a static line.
 */
const ITEMS = [
  "Built with love in Berlin",
  "Please be kind, it's still a prototype",
  "GDPR compliant because we care a lot about your data protection",
];

function Line({ hidden = false }: { hidden?: boolean }) {
  return (
    <span className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
      {ITEMS.map((item) => (
        <span key={item} className="flex items-center">
          <span className="px-7">{item}</span>
          <span className="h-1 w-1 rounded-full bg-brand" aria-hidden />
        </span>
      ))}
    </span>
  );
}

export function Ticker() {
  return (
    <div className="lp-ticker shrink-0 overflow-hidden text-[11.5px] font-medium tracking-[0.01em] text-white/70">
      <div className="lp-ticker-track py-[7px]">
        <Line />
        <Line hidden />
      </div>
    </div>
  );
}
