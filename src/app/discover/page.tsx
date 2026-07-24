import { DiscoverShell } from "./DiscoverShell";
import { getDiscoverableCompanies } from "./companies";
import { getDiscoverablePeople } from "./people";

// Discover — one scrolling page (ads banner + New People + the company directory;
// Requests / My Network stack in as DISC-12/14 land). All data is server-fetched
// here (only safe fields, via the SECURITY DEFINER RPCs) and passed to the client
// shell as props — one paint, no loading flash.
export default async function DiscoverPage() {
  const [companies, people] = await Promise.all([
    getDiscoverableCompanies(),
    getDiscoverablePeople(),
  ]);
  return <DiscoverShell companies={companies} people={people} />;
}
