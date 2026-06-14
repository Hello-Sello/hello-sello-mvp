import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, MapPin, Lock } from "lucide-react";
import { getDiscoverableCompany, type DiscoverCompanyProfile } from "../companies";
import { ConnectActions } from "./ConnectActions";

// In-app company profile opened from Discover (Track 1). Keeps the app shell
// (authenticated, verified members only — not the bare anon /c/ page). L0 = card
// only; the shop/products are gated until you connect (slice 4 adds them at the
// company's chosen openness). See docs/muskan-build/discover-connect-loop.md.
export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const company = await getDiscoverableCompany(companyId);
  if (!company) notFound();

  return (
    <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-auto px-2 pb-10">
      <Link
        href="/discover"
        className="mb-3 mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Discover
      </Link>

      <div className="glass overflow-hidden rounded-3xl">
        {/* hero — cover image if any, else brand gradient */}
        <div className="relative h-32 bg-gradient-to-br from-brand via-brand-deep to-[#3a0016]">
          {company.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.coverUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>

        {/* identity — logo peeks over the banner, name sits on the white area */}
        <div className="-mt-7 flex items-end gap-4 px-5">
          <CompanyLogo company={company} />
          <div className="min-w-0 flex-1 pb-0.5">
            <h1 className="truncate text-xl font-bold text-ink">{company.name}</h1>
            <p className="text-sm text-ink/55">
              {[company.categories.join(", "), company.countryName].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        {company.about && (
          <p className="px-5 pt-3.5 text-sm leading-relaxed text-ink/60">{company.about}</p>
        )}

        <div className="flex flex-wrap gap-x-6 gap-y-2 px-5 pt-3 text-sm text-ink/70">
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} className="text-brand" />
            {company.countryName}
          </span>
          {company.website && (
            <a
              href={normalizeUrl(company.website)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-brand-deep hover:underline"
            >
              <Globe size={14} /> {company.website}
            </a>
          )}
        </div>

        {/* connect */}
        <div className="px-5 pt-5">
          <ConnectActions
            companyId={company.id}
            companyName={company.name}
            state={company.connectionState}
          />
        </div>

        {/* L0 — the shop is private until connected (closed-directory model) */}
        <div className="mx-5 mb-5 mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-ink/15 px-4 py-3 text-sm text-ink/45">
          <Lock size={15} /> This company&apos;s shop is private. Connect to request access to their
          catalogue.
        </div>
      </div>
    </div>
  );
}

function CompanyLogo({ company }: { company: DiscoverCompanyProfile }) {
  if (company.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={company.logoUrl}
        alt=""
        className="h-[72px] w-[72px] shrink-0 rounded-2xl object-cover ring-4 ring-white"
      />
    );
  }
  const initials = company.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white ring-4 ring-white">
      {initials}
    </span>
  );
}

// A bare value like "aurora.de" needs a scheme to be a valid outbound link.
function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
