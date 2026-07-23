/**
 * Discover — closed, tagged company directory. The companies list (search +
 * filters + rows + Connect CTA) is now CompaniesSection (DISC-5, behavior-
 * preserving extraction); this keeps the page hero + outer layout. It is
 * superseded by DiscoverShell (DISC-6) once the ads banner + people / requests /
 * network sections stack in.
 */
import { Lock } from "lucide-react";
import type { DiscoverCompany } from "./companies";
import { CompaniesSection } from "./sections/CompaniesSection";

export function DiscoverDirectory({ companies }: { companies: DiscoverCompany[] }) {
  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-auto px-4 py-8 sm:px-6">
      {/* CENTER zone: closed-network badge + title + intro */}
      <div className="text-center">
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
