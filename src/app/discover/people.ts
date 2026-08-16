import { createClient } from "@/shared/db/server";
import { countryName } from "@/shared/geo/countries";
import { categoryLabel } from "./taxonomy";
import type { ConnectionState } from "./companies";

/**
 * Discover People directory — people at other verified companies, for the New
 * People section. Reads the list_discoverable_people() SECURITY DEFINER RPC (safe
 * fields + per-person connection_state; RLS/gating proven by pgTAP), resolving
 * avatar (avatars bucket) + company logo (shop-media bucket) URLs and mapping
 * type_codes to display labels.
 */

export type DiscoverPerson = {
  personId: string;
  name: string;
  title: string | null;
  avatarUrl: string | null;
  publicHandle: string | null;
  companyId: string | null;
  companyName: string | null;
  companyLogoUrl: string | null;
  companyCountryCode: string | null;
  companyCountryName: string | null;
  companyCity: string | null;
  categories: string[];
  connectionState: ConnectionState;
};

type Row = {
  person_id: string;
  display_name: string;
  title: string | null;
  avatar_path: string | null;
  public_handle: string | null;
  company_id: string | null;
  company_name: string | null;
  company_logo_path: string | null;
  company_country: string | null;
  company_city: string | null;
  type_codes: string[] | null;
  connection_state: ConnectionState;
};

/** Pure row → view mapper. `urlFor(bucket, path)` resolves a public storage URL. */
export function mapDiscoverPersonRow(
  r: Row,
  urlFor: (bucket: string, path: string) => string,
): DiscoverPerson {
  return {
    personId: r.person_id,
    name: r.display_name,
    title: r.title,
    avatarUrl: r.avatar_path ? urlFor("avatars", r.avatar_path) : null,
    publicHandle: r.public_handle,
    companyId: r.company_id,
    companyName: r.company_name,
    companyLogoUrl: r.company_logo_path ? urlFor("shop-media", r.company_logo_path) : null,
    companyCountryCode: r.company_country,
    companyCountryName: r.company_country ? countryName(r.company_country) : null,
    companyCity: r.company_city,
    categories: (r.type_codes ?? []).map(categoryLabel),
    connectionState: r.connection_state,
  };
}

export async function getDiscoverablePeople(): Promise<DiscoverPerson[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("list_discoverable_people" as never)) as unknown as {
    data: Row[] | null;
    error: { message: string } | null;
  };
  if (res.error || !res.data) return [];

  const urlFor = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  return res.data.map((r) => mapDiscoverPersonRow(r, urlFor));
}
