"use client";

import { useRealtimeRefresh, type WatchedTable } from "@/shared/realtime/useRealtimeRefresh";

/**
 * The tables behind Discover's connection lifecycle. Watching them keeps every
 * Discover section live on BOTH sides with no manual refresh:
 *
 *   pending_inbox_item — a request sent (INSERT) or resolved (UPDATE): the
 *                        recipient's Requests box; either side on accept/decline
 *   person_connection  — a person edge minted on accept (INSERT): the requester's
 *                        My Network gains them
 *   relationship       — a company edge minted on accept (INSERT): the requester's
 *                        My Network gains the company
 *
 * Each table's RLS scopes the stream to the right people (see useRealtimeRefresh).
 */
const CONNECTION_TABLES: WatchedTable[] = [
  { table: "pending_inbox_item" },
  { table: "person_connection" },
  { table: "relationship" },
];

/** Live Discover: run `onChange` whenever a connection request or edge changes for me. */
export function useDiscoverRealtime(onChange: () => void): void {
  useRealtimeRefresh(CONNECTION_TABLES, onChange);
}
