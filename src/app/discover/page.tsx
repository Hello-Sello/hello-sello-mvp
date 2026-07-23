import { DiscoverShell } from "./DiscoverShell";
import { getDiscoverableCompanies } from "./companies";

// Discover — one scrolling page (ads banner + the company directory now; people /
// requests / network sections stack in as DISC-9/12/14 land). All data is
// server-fetched here (only safe fields, via the SECURITY DEFINER RPCs) and
// passed to the client shell as props — one paint, no loading flash.
export default async function DiscoverPage() {
  const companies = await getDiscoverableCompanies();
  return <DiscoverShell companies={companies} />;
}
