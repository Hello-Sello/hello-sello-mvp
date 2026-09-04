import { createClient } from "@/shared/db/server";

/**
 * Incoming COMPANY connection requests for the viewer's company — the "Company
 * requests" group of the Discover Requests section (DISC-11). A server read
 * mirroring the getInbox pattern: resolve the viewer's company, then return the
 * incoming (receiver = my company) pending connect / connect_message /
 * pricelist_request items. RLS (inbox_select) shows a row to sender AND
 * receiver, so the receiver-company filter is what makes this INCOMING-only.
 * No deal_card join (that's the deal-ticket path, out of scope here).
 */

/**
 * The `pending_inbox_item.type` values this list surfaces. `inbox_request_type`
 * seeds five codes total; two are deliberately excluded (T03, ADR I-J4):
 * - `deal_card` — a different meaning here (D1/T01 already makes it practically
 *   unreachable). This list means "someone awaits consent from a company they
 *   haven't spoken to" (ADR I-J2); a deal_card ticket must never appear even if
 *   a row existed.
 * - `connect_person` — a different graph and a different accept RPC
 *   (`accept_person_connection`), rendered instead by
 *   `incomingPersonRequests.ts`/`DiscoverPersonRequest`. True by construction,
 *   doubly: a `connect_person` row carries `receiver_person_id` instead of
 *   `receiver_company_id` (the column went nullable specifically for this), so
 *   this query's own `.eq("receiver_company_id", companyId)` can never match
 *   one regardless of this filter.
 */
export const COMPANY_REQUEST_TYPES = ["connect", "connect_message", "pricelist_request"] as const;
export type DiscoverCompanyRequestKind = (typeof COMPANY_REQUEST_TYPES)[number];

export type DiscoverCompanyRequest = {
  itemId: string;
  note: string | null;
  createdAt: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderInitials: string;
  type: DiscoverCompanyRequestKind;
};

type Row = {
  id: string;
  note: string | null;
  created_at: string;
  sender_company_id: string;
  sender: { name: string } | { name: string }[] | null;
  type: DiscoverCompanyRequestKind;
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Pure row → view mapper (handles the Supabase object|array embed + null). */
export function mapCompanyRequestRow(r: Row): DiscoverCompanyRequest {
  const sender = Array.isArray(r.sender) ? r.sender[0] : r.sender;
  const name = sender?.name ?? "Unknown company";
  return {
    itemId: r.id,
    note: r.note,
    createdAt: r.created_at,
    senderCompanyId: r.sender_company_id,
    senderCompanyName: name,
    senderInitials: initials(name),
    type: r.type,
  };
}

export async function getIncomingConnectionRequests(): Promise<DiscoverCompanyRequest[]> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return [];

  const { data: person } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", uid)
    .single();
  const companyId = person?.company_id;
  if (!companyId) return [];

  const { data, error } = await supabase
    .from("pending_inbox_item")
    .select(
      "id, note, created_at, sender_company_id, type, sender:company!pending_inbox_item_sender_company_id_fkey ( name )",
    )
    .eq("receiver_company_id", companyId)
    .eq("status", "pending")
    .in("type", COMPANY_REQUEST_TYPES)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((r) => mapCompanyRequestRow(r as Row));
}
