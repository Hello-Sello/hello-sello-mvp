import { DiscoverShell } from "./DiscoverShell";
import { getDiscoverableCompanies } from "./companies";
import { getDiscoverablePeople } from "./people";
import { getIncomingConnectionRequests } from "./companyRequests";
import { getIncomingPersonRequests } from "./incomingPersonRequests";
import { getMyConnectionsServer } from "./myNetwork";
import { getMyPersonConnections } from "./personNetwork";

// Discover — one scrolling page (ads banner → Requests → My Network → New People
// → Companies). All data is server-fetched here (only safe fields, via the
// SECURITY DEFINER RPCs / RLS-scoped reads) and passed to the client shell as
// props — one paint, no loading flash.
export default async function DiscoverPage() {
  const [companies, people, companyRequests, personRequests, myNetwork, networkPeople] =
    await Promise.all([
      getDiscoverableCompanies(),
      getDiscoverablePeople(),
      getIncomingConnectionRequests(),
      getIncomingPersonRequests(),
      getMyConnectionsServer(),
      getMyPersonConnections(),
    ]);
  return (
    <DiscoverShell
      companies={companies}
      people={people}
      companyRequests={companyRequests}
      personRequests={personRequests}
      networkCompanies={myNetwork.companies}
      networkPeople={networkPeople}
    />
  );
}
