import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Globe, MapPin, Lock, Package, MessageSquareQuote } from "lucide-react";
import {
  getDiscoverableCompany,
  getDiscoverableShop,
  type DiscoverCompanyProfile,
  type DiscoverProduct,
} from "../companies";
import { ConnectActions } from "./ConnectActions";
import { RequestPricingActions } from "./RequestPricingActions";

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
  // Identity + catalogue read in parallel (no waterfall). The shop RPC applies
  // the same verified-company gate, so it returns [] for anything notFound below.
  const [company, products] = await Promise.all([
    getDiscoverableCompany(companyId),
    getDiscoverableShop(companyId),
  ]);
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

        {/* catalogue — rendered at the seller's chosen openness (L0/L1/L2) */}
        <Catalogue company={company} products={products} />
      </div>
    </div>
  );
}

// ---- Catalogue (slice 4) — L0 locked / L1 price-on-request / L2 priced ----

function Catalogue({
  company,
  products,
}: {
  company: DiscoverCompanyProfile;
  products: DiscoverProduct[];
}) {
  const hasProducts = products.length > 0;
  const anyPriceHidden = products.some((p) => p.pricePublic === false);

  return (
    <div className="px-5 pb-5 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-ink">Catalogue</h2>
        <TierChip hasProducts={hasProducts} anyPriceHidden={anyPriceHidden} />
      </div>

      {!hasProducts ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-ink/15 px-4 py-3 text-sm text-ink/45">
          <Lock size={15} /> This company&apos;s catalogue is private. Connect to request access.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {anyPriceHidden && !company.pricingRequested && (
            <div className="mt-4">
              <RequestPricingActions
                companyId={company.id}
                companyName={company.name}
                requested={company.pricingRequested}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TierChip({ hasProducts, anyPriceHidden }: { hasProducts: boolean; anyPriceHidden: boolean }) {
  const [cls, label] = !hasProducts
    ? ["bg-ink/5 text-ink/55", "Catalogue private · Connect to view"]
    : anyPriceHidden
      ? ["bg-brand-soft/60 text-brand-deep", "Prices on request"]
      : ["bg-success/15 text-success", "Open catalogue"];
  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold ${cls}`}>
      {label}
    </span>
  );
}

function ProductCard({ product: p }: { product: DiscoverProduct }) {
  const specs = [
    p.cultivar,
    p.thcPercent != null ? `THC ${p.thcPercent}%` : null,
    p.cbdPercent != null ? `CBD ${p.cbdPercent}%` : null,
    p.packSizeGrams != null ? `${p.packSizeGrams}${p.unitCode ?? "g"}` : null,
    p.countryOfOrigin,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white/70">
      <div className="flex h-24 items-center justify-center bg-gradient-to-br from-brand-soft/40 to-brand-soft/70">
        {p.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.images[0]} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package size={22} className="text-brand/40" />
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
        <p className="mt-0.5 min-h-[32px] text-[11px] leading-snug text-ink/55">{specs}</p>
        {p.pricePerGram != null ? (
          <p className="text-sm font-bold text-ink">
            €{p.pricePerGram.toFixed(2)}
            <span className="text-[11px] font-medium text-ink/50">/{p.unitCode ?? "g"}</span>
          </p>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-semibold text-ink/55">
            <MessageSquareQuote size={12} /> Price on request
          </span>
        )}
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
