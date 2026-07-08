import type { ReactNode } from "react";

/**
 * Trusted-by logo strip (§3). A row of partner logos so the section reads as a
 * real trust signal instead of an empty placeholder.
 *
 * NOTE: these are ILLUSTRATIVE, invented medical-company marks (not real
 * brands, not real customers) — a stand-in for the visual until real partner
 * logos exist. Kept honest in code, consistent with the hero's D-06 framing.
 * Each lockup is a tiny inline SVG mark + wordmark; muted by default, warming
 * to brand on hover, sitting on a light glass chip that matches the hero.
 */

type Logo = { name: string; mark: ReactNode };

const LOGOS: Logo[] = [
  {
    name: "Medivance",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 15V6l4 6 4-6v9" />
        <path d="M17 8v8M14 12h6" />
      </svg>
    ),
  },
  {
    name: "NordPharma",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    name: "CuraLine",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 13h5l2.5-7 4 15 2.5-8H21" />
      </svg>
    ),
  },
  {
    name: "BioCassel",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 4C11 4 5 9 5 16c0 2 .6 3.4.6 3.4S12 20 16 15c2.6-3.2 4-11 4-11z" />
        <path d="M5 20c2-6 6-9 11-11" />
      </svg>
    ),
  },
  {
    name: "Helvamed",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 2.5 20 5.5v6c0 5-3.6 8.3-8 10-4.4-1.7-8-5-8-10v-6z" />
        <path d="M12 8v6M9 11h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: "Apoteca",
    mark: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h16M6 20v-6a6 6 0 0 1 12 0v6" />
        <path d="M9 8 6 5M15 8l3-3M12 2v3" />
      </svg>
    ),
  },
];

export function TrustedBy() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
      {LOGOS.map((logo) => (
        <div
          key={logo.name}
          className="group flex items-center gap-2.5 rounded-2xl border border-white/60 bg-white/45 px-4 py-2.5 text-ink-muted shadow-[0_10px_30px_-20px_rgba(122,22,56,0.5)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:bg-white/70 hover:text-brand"
        >
          <span className="h-6 w-6 shrink-0 opacity-70 transition-opacity duration-300 group-hover:opacity-100">
            {logo.mark}
          </span>
          <span className="text-[15px] font-semibold tracking-tight">{logo.name}</span>
        </div>
      ))}
    </div>
  );
}
