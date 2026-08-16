import { createClient } from "@/shared/db/server";

/**
 * Incoming person→person connection requests aimed at the current user — the
 * "People" group of the Discover Requests section. Reads the
 * list_incoming_person_requests() SECURITY DEFINER RPC (pending connect_person
 * requests, filtering + safe fields proven by pgTAP), resolving the sender's
 * avatar (avatars bucket) + company logo (shop-media bucket).
 */

export type DiscoverPersonRequest = {
  itemId: string;
  note: string | null;
  createdAt: string;
  senderPersonId: string;
  senderName: string;
  senderTitle: string | null;
  senderAvatarUrl: string | null;
  senderCompanyId: string | null;
  senderCompanyName: string | null;
  senderCompanyLogoUrl: string | null;
};

type Row = {
  item_id: string;
  note: string | null;
  created_at: string;
  sender_person_id: string;
  sender_display_name: string;
  sender_title: string | null;
  sender_avatar_path: string | null;
  sender_company_id: string | null;
  sender_company_name: string | null;
  sender_company_logo_path: string | null;
};

/** Pure row → view mapper. `urlFor(bucket, path)` resolves a public storage URL. */
export function mapIncomingPersonRequestRow(
  r: Row,
  urlFor: (bucket: string, path: string) => string,
): DiscoverPersonRequest {
  return {
    itemId: r.item_id,
    note: r.note,
    createdAt: r.created_at,
    senderPersonId: r.sender_person_id,
    senderName: r.sender_display_name,
    senderTitle: r.sender_title,
    senderAvatarUrl: r.sender_avatar_path ? urlFor("avatars", r.sender_avatar_path) : null,
    senderCompanyId: r.sender_company_id,
    senderCompanyName: r.sender_company_name,
    senderCompanyLogoUrl: r.sender_company_logo_path
      ? urlFor("shop-media", r.sender_company_logo_path)
      : null,
  };
}

export async function getIncomingPersonRequests(): Promise<DiscoverPersonRequest[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("list_incoming_person_requests" as never)) as unknown as {
    data: Row[] | null;
    error: { message: string } | null;
  };
  if (res.error || !res.data) return [];

  const urlFor = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  return res.data.map((r) => mapIncomingPersonRequestRow(r, urlFor));
}
