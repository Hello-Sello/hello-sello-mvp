import { DiscoverShell } from "./DiscoverShell";
import { getDiscoverableCompanies } from "./companies";
import { getDiscoverablePeople } from "./people";
import { getIncomingConnectionRequests } from "./companyRequests";
import { getIncomingPersonRequests } from "./incomingPersonRequests";

// Discover — one scrolling page (ads banner → Requests → New People → Companies;
// My Network stacks in at DISC-14). All data is server-fetched here (only safe
// fields, via the SECURITY DEFINER RPCs / RLS-scoped reads) and passed to the
// client shell as props — one paint, no loading flash.
export default async function DiscoverPage() {
  const [companies, people, companyRequests, personRequests] = await Promise.all([
    getDiscoverableCompanies(),
    getDiscoverablePeople(),
    getIncomingConnectionRequests(),
    getIncomingPersonRequests(),
  ]);
  return (
    <DiscoverShell
      companies={companies}
      people={people}
      companyRequests={companyRequests}
      personRequests={personRequests}
    />
  );
}
