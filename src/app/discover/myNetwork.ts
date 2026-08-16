import { createClient } from "@/shared/db/server";
import { getMyConnections } from "@/modules/messaging/supabase/connections";
import type { MyConnectionsView } from "@/modules/messaging/types";

/**
 * Server-callable "My Network: companies" — the connected-companies half of the
 * Discover My Network section (DISC-13). getMyConnections is browser-first;
 * passing the server client lets page.tsx server-fetch it (Wave-1: one paint, no
 * loading flash). Shape (MyConnectionsView) is unchanged.
 */
export async function getMyConnectionsServer(): Promise<MyConnectionsView> {
  const supabase = await createClient();
  return getMyConnections(supabase);
}
