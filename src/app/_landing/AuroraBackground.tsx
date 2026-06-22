/**
 * Animated aurora backdrop for the public pages (Phase 9 landing). Pure-CSS
 * floating gradient blobs that give the marketing surfaces their "dreamy" depth
 * — no GSAP/Lenis, so the page stays server-rendered and library-free. Purely
 * decorative: aria-hidden, pointer-events-none, sits behind content (-z-10), and
 * the float animation is disabled under prefers-reduced-motion (see globals.css
 * `.hs-blob-*`). Drop it inside any `relative isolate overflow-hidden` section.
 */
export function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`}
    >
      <span className="hs-blob hs-blob-a absolute -left-24 -top-32 h-[34rem] w-[34rem] rounded-full bg-brand-soft/60 blur-3xl mix-blend-multiply" />
      <span className="hs-blob hs-blob-b absolute -right-20 -top-10 h-[30rem] w-[30rem] rounded-full bg-brand/20 blur-3xl mix-blend-multiply" />
      <span className="hs-blob hs-blob-c absolute left-1/3 top-40 h-80 w-80 rounded-full bg-[#ffd9b0]/50 blur-3xl mix-blend-multiply" />
    </div>
  );
}
