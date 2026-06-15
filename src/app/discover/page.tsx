import { DiscoverDirectory } from "./DiscoverDirectory";
import { getDiscoverableCompanies } from "./companies";

// Discover — closed, tagged company directory (NON-marketplace). Real data now:
// fetches the verified-company directory server-side (only safe fields, via the
// list_discoverable_companies RPC) and passes it to the client list. The
// "Request to enter" button reflects the viewer's per-card state; actually
// sending the request is the next slice. See docs/muskan-build/discover-connect-loop.md.
export default async function DiscoverPage() {
  const companies = await getDiscoverableCompanies();
  return <DiscoverDirectory companies={companies} />;
}
