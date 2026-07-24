"use client";

/**
 * DiscoverShell — the one scrolling Discover page (DISC-6), laid out per Variant D:
 *
 *   Ads leaderboard
 *   [ Requests | My Network ]   ← side by side, equal height, each scrolls inside
 *   People you may know          (cards)
 *   Companies                    (directory: search + filters + rows)
 *
 * Sections are evenly spaced (one gap value, not per-section margins). Client
 * component so it can later coordinate cross-section state; its data is
 * server-fetched in page.tsx and passed as props (one paint, no loading flash).
 */
import type { DiscoverCompany } from "./companies";
import type { DiscoverPerson } from "./people";
import type { DiscoverCompanyRequest } from "./companyRequests";
import type { DiscoverPersonRequest } from "./incomingPersonRequests";
import type { DiscoverPersonConnection } from "./personNetwork";
import type { ConnectedCompany } from "@/modules/messaging/types";
import { DiscoverAdsBanner } from "./DiscoverAdsBanner";
import { CompaniesSection } from "./sections/CompaniesSection";
import { NewPeopleSection } from "./sections/NewPeopleSection";
import { RequestsSection } from "./sections/RequestsSection";
import { MyNetworkSection } from "./sections/MyNetworkSection";

export function DiscoverShell({
  companies,
  people = [],
  companyRequests = [],
  personRequests = [],
  networkCompanies = [],
  networkPeople = [],
}: {
  companies: DiscoverCompany[];
  people?: DiscoverPerson[];
  companyRequests?: DiscoverCompanyRequest[];
  personRequests?: DiscoverPersonRequest[];
  networkCompanies?: ConnectedCompany[];
  networkPeople?: DiscoverPersonConnection[];
}) {
  return (
    <div className="mx-auto h-full w-full max-w-6xl overflow-auto px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-[22px]">
        <DiscoverAdsBanner />

        {/* Requests | My Network — the Variant D "split top", equal-height columns. */}
        <div className="grid grid-cols-1 gap-[22px] md:grid-cols-2 md:items-stretch">
          <RequestsSection companyRequests={companyRequests} personRequests={personRequests} />
          <MyNetworkSection companies={networkCompanies} people={networkPeople} />
        </div>

        <NewPeopleSection people={people} />

        <CompaniesSection companies={companies} />
      </div>
    </div>
  );
}
