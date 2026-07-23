"use client";

/**
 * DiscoverShell — the one scrolling Discover page (DISC-6). Stacks the sections
 * top-to-bottom per Variant D: ads banner → (Requests → My Network → New People
 * added in DISC-9/12/14) → Companies. Client component so it can later coordinate
 * cross-section state; its data is server-fetched in page.tsx and passed as props
 * (one paint, no loading flash).
 */
import { Lock } from "lucide-react";
import type { DiscoverCompany } from "./companies";
import { DiscoverAdsBanner } from "./DiscoverAdsBanner";
import { CompaniesSection } from "./sections/CompaniesSection";

export function DiscoverShell({ companies }: { companies: DiscoverCompany[] }) {
  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-auto px-4 py-8 sm:px-6">
      <DiscoverAdsBanner />

      {/* Companies section hero (other sections stack above it in DISC-9/12/14). */}
      <div className="mt-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft/50 px-3 py-1 text-xs font-semibold text-brand-deep">
          <Lock size={13} /> Closed network
        </span>
        <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-tight text-ink sm:text-4xl">
          Find a company to connect with
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[15px] text-ink-muted">
          Search the directory, then request entry. Shops stay private until you&apos;re let in.
        </p>
      </div>

      <CompaniesSection companies={companies} />
    </div>
  );
}
