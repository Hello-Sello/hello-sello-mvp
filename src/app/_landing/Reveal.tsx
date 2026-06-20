"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scroll-reveal wrapper (Phase 9 landing). Fades + lifts its children into view
 * the first time they scroll in, via a single IntersectionObserver — no
 * animation library, so the bundle stays lean and the page stays
 * server-rendered.
 *
 * Hydration- and accessibility-safe by construction: the children are
 * server-rendered in their FINAL visible state, so no-JS users and
 * prefers-reduced-motion users see the content immediately (we never hide it for
 * them). Only after mount, for motion-OK content that is still below the fold, do
 * we add the hidden classes and animate them back. Above-the-fold content is left
 * visible (no flash). Class toggling is done on the DOM node directly so the SSR
 * markup is unchanged — no hydration mismatch.
 */
export function Reveal({
  children,
  delayMs = 0,
  className = "",
}: {
  children: ReactNode;
  delayMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already in view at mount (above the fold)? Leave it visible — don't animate.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.style.transitionDelay = `${delayMs}ms`;
    el.classList.add("opacity-0", "translate-y-4");

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.remove("opacity-0", "translate-y-4");
            obs.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delayMs]);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}
