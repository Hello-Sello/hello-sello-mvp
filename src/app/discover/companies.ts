import { createClient } from "@/shared/db/server";

/**
 * Discover directory data (Track 1, slice 1). Reads the real verified-company
 * directory via the `list_discoverable_companies()` SECURITY DEFINER RPC — the
 * safe window that lets a member see companies they are NOT connected to yet
 * (the company RLS would otherwise hide them), exposing only safe fields + the
 * viewer's per-card connection state.
 *
 * Filtering stays client-side for now (small directory). It moves server-side
 * — params + keyset pagination on the same RPC — when the directory grows
 * (most likely with Flowz shadow profiles). See docs/muskan-build/discover-connect-loop.md.
 */

export type ConnectionState = "none" | "requested" | "incoming" | "connected";

export type DiscoverCompany = {
  id: string;
  name: string;
  countryCode: string;
  countryName: string;
  categories: string[]; // display labels (a company can have more than one)
  logoUrl: string | null;
  connectionState: ConnectionState;
};

// Live data stores lowercase type codes + ISO-2 country codes; map to display labels.
const CATEGORY_LABELS: Record<string, string> = {
  cultivator: "Cultivator",
  wholesaler: "Wholesaler",
  importer: "Importer",
  pharmacy: "Pharmacy",
};

const COUNTRY_NAMES: Record<string, string> = {
  DE: "Germany", AT: "Austria", CH: "Switzerland", NL: "Netherlands",
  ES: "Spain", PT: "Portugal", FR: "France", IT: "Italy", BE: "Belgium",
  DK: "Denmark", PL: "Poland", CZ: "Czechia", SE: "Sweden", GB: "United Kingdom",
};

const categoryLabel = (code: string) =>
  CATEGORY_LABELS[code] ?? code.charAt(0).toUpperCase() + code.slice(1);
const countryName = (code: string) => COUNTRY_NAMES[code] ?? code;

// Row shape from the RPC. Typed locally — the function isn't in the generated
// database.types, same pattern the codebase uses for get_public_profile / create_deal_draft.
type Row = {
  id: string;
  name: string;
  country: string;
  logo_path: string | null;
  type_codes: string[] | null;
  connection_state: ConnectionState;
};

export async function getDiscoverableCompanies(): Promise<DiscoverCompany[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("list_discoverable_companies" as never)) as unknown as {
    data: Row[] | null;
    error: { message: string } | null;
  };
  if (res.error || !res.data) return [];

  return res.data.map((r) => ({
    id: r.id,
    name: r.name,
    countryCode: r.country,
    countryName: countryName(r.country),
    categories: (r.type_codes ?? []).map(categoryLabel),
    logoUrl: r.logo_path
      ? supabase.storage.from("shop-media").getPublicUrl(r.logo_path).data.publicUrl
      : null,
    connectionState: r.connection_state,
  }));
}

// ---- Single company profile (slice 2) ----

export type DiscoverCompanyProfile = {
  id: string;
  name: string;
  tagline: string | null;
  about: string | null;
  countryCode: string;
  countryName: string;
  website: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  categories: string[];
  connectionState: ConnectionState;
};

type ProfileRow = {
  id: string;
  name: string;
  tagline: string | null;
  about: string | null;
  country: string;
  website: string | null;
  logo_path: string | null;
  cover_path: string | null;
  type_codes: string[] | null;
  connection_state: ConnectionState;
};

export async function getDiscoverableCompany(
  companyId: string,
): Promise<DiscoverCompanyProfile | null> {
  const supabase = await createClient();

  const res = (await supabase.rpc("get_discoverable_company" as never, {
    p_company_id: companyId,
  } as never)) as unknown as { data: ProfileRow[] | null; error: { message: string } | null };

  if (res.error || !res.data || res.data.length === 0) return null;
  const r = res.data[0];

  const mediaUrl = (path: string | null) =>
    path ? supabase.storage.from("shop-media").getPublicUrl(path).data.publicUrl : null;

  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    about: r.about,
    countryCode: r.country,
    countryName: countryName(r.country),
    website: r.website,
    logoUrl: mediaUrl(r.logo_path),
    coverUrl: mediaUrl(r.cover_path),
    categories: (r.type_codes ?? []).map(categoryLabel),
    connectionState: r.connection_state,
  };
}
