import { createClient } from "@/shared/db/server";

/**
 * Incoming COMPANY connection requests for the viewer's company — the "Company
 * requests" group of the Discover Requests section (DISC-11). A server read
 * mirroring the getInbox pattern: resolve the viewer's company, then return the
 * incoming (receiver = my company) pending connect / connect_message items. RLS
 * (inbox_select) shows a row to sender AND receiver, so the receiver-company
 * filter is what makes this INCOMING-only. No deal_card join (that's the
 * deal-ticket path, out of scope here).
 */

export type DiscoverCompanyRequest = {
  itemId: string;
  note: string | null;
  createdAt: string;
  senderCompanyId: string;
  senderCompanyName: string;
  senderInitials: string;
};

type Row = {
  id: string;
  note: string | null;
  created_at: string;
  sender_company_id: string;
  sender: { name: string } | { name: string }[] | null;
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
      "id, note, created_at, sender_company_id, sender:company!pending_inbox_item_sender_company_id_fkey ( name )",
    )
    .eq("receiver_company_id", companyId)
    .eq("status", "pending")
    .in("type", ["connect", "connect_message"])
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  return data.map((r) => mapCompanyRequestRow(r as Row));
}
