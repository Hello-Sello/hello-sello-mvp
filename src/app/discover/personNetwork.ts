import { createClient } from "@/shared/db/server";
import { countryName } from "@/shared/geo/countries";

/**
 * "My Network: people" — the people you have an active person_connection with,
 * for the Discover My Network section. Reads the list_my_person_connections()
 * SECURITY DEFINER RPC (safe fields; RLS + verified gate proven by pgTAP), then
 * resolves avatar (avatars bucket) + company logo (shop-media bucket) URLs.
 *
 * The companies group of My Network comes from a separate company read (DISC-13);
 * this is only the person edges.
 */

export type DiscoverPersonConnection = {
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
};

// Row shape from the RPC (typed locally — not in generated database.types, same
// pattern as companies.ts for the other discover RPCs).
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
};

/** Pure row → view mapper. `urlFor(bucket, path)` resolves a public storage URL. */
export function mapPersonConnectionRow(
  r: Row,
  urlFor: (bucket: string, path: string) => string,
): DiscoverPersonConnection {
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
  };
}

export async function getMyPersonConnections(): Promise<DiscoverPersonConnection[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("list_my_person_connections" as never)) as unknown as {
    data: Row[] | null;
    error: { message: string } | null;
  };
  if (res.error || !res.data) return [];

  const urlFor = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  return res.data.map((r) => mapPersonConnectionRow(r, urlFor));
}
