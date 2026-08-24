import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getDiscoverableCompany, getDiscoverableShop, toShopCompany } from "../companies";
import { BuyerShopView } from "./BuyerShopView";

// The seller's shop as a buyer sees it (slug 0022). Opened from Discover, inside
// the app shell (authenticated, verified members only — not the bare anon /c/
// page). It is the SAME storefront /present renders, with owner chrome off: one
// ShopView, one ProductCard, one set of info boxes for both sides.
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

  // No width container and no extra flex/scroll wrapper around ShopView: its
  // root is `flex h-full flex-col … overflow-auto` and belongs directly under
  // AppShell's <main>. Nesting a second scroll parent here is the defect class
  // the G2 walk hit repeatedly (ADR-0005 blast radius).
  // ONE scroll container, not two. `AppShell`'s <main> is `min-h-0 flex-1
  // overflow-auto`, and ShopView's root is `h-full … overflow-auto` — on
  // /present it is main's only child, so it fits exactly and main never
  // scrolls. Here the Back link is a sibling ABOVE it, so `h-full` + the
  // link's ~48px overflowed main and the page grew a second scrollbar with
  // the link scrolling out of reach. This column gives the link its own row
  // and hands ShopView the remainder (`min-h-0` so the flex child may shrink
  // below its content). Found at G4 by visual-verifier, measured at a
  // constant 48px.
  return (
    <div className="flex h-full flex-col">
      <Link
        href="/discover"
        className="mb-3 mt-4 inline-flex w-fit shrink-0 items-center gap-1.5 text-sm font-semibold text-ink/60 hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to Discover
      </Link>

      <div className="min-h-0 flex-1">
        <BuyerShopView
          shop={{ company: toShopCompany(company), products }}
          companyId={company.id}
          companyName={company.name}
          connectionState={company.connectionState}
        />
      </div>
    </div>
  );
}
