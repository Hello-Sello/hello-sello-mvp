import { createClient } from "@/shared/db/server";
import { countryName } from "@/shared/geo/countries";

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
  city: string | null;
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

const categoryLabel = (code: string) =>
  CATEGORY_LABELS[code] ?? code.charAt(0).toUpperCase() + code.slice(1);

// Row shape from the RPC. Typed locally — the function isn't in the generated
// database.types, same pattern the codebase uses for get_public_profile / create_deal_draft.
type Row = {
  id: string;
  name: string;
  country: string;
  city: string | null;
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
    city: r.city,
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
  pricingRequested: boolean; // a pricelist_request from us to them is pending
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
  pricing_requested: boolean;
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
    pricingRequested: r.pricing_requested,
  };
}

// ---- Company catalogue (slice 4) ----

/**
 * One product on a company's public profile, as a verified-but-unconnected
 * member sees it. `images` are resolved, ordered `shop-media` URLs. Price fields
 * are null unless the seller made the product's price public (`pricePublic`); a
 * null price = "Price on request" (the L1 state). The RPC already gates all of
 * this server-side — the reader never sees hidden products or seller-only cost.
 */
export type DiscoverProduct = {
  id: string;
  name: string;
  cultivar: string | null;
  thcPercent: number | null;
  cbdPercent: number | null;
  packSizeGrams: number | null;
  unitCode: string | null;
  localCodePzn: string | null;
  dominanceCode: string | null;
  countryOfOrigin: string | null;
  region: string | null;
  images: string[]; // ordered public URLs (cover first)
  pricePublic: boolean;
  pricePerGram: number | null;
};

type ShopRow = {
  id: string;
  name: string;
  cultivar: string | null;
  thc_percent: number | null;
  cbd_percent: number | null;
  pack_size_grams: number | null;
  unit_code: string | null;
  local_code_pzn: string | null;
  dominance_code: string | null;
  country_of_origin: string | null;
  region: string | null;
  images: { id: string; path: string; position: number }[] | null;
  price_public: boolean;
  price_per_gram: number | null;
};

/**
 * The visible catalogue of a verified company, for the Discover profile. Goes
 * through the `get_discoverable_shop` SECURITY DEFINER RPC — the audience-scoped
 * window that returns only `profile_visible` products (prices only where public),
 * even when the viewer isn't connected. Empty array = L0 (locked / nothing shared).
 */
export async function getDiscoverableShop(companyId: string): Promise<DiscoverProduct[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("get_discoverable_shop" as never, {
    p_company_id: companyId,
  } as never)) as unknown as { data: ShopRow[] | null; error: { message: string } | null };

  if (res.error || !res.data) return [];

  const imageUrl = (path: string) =>
    supabase.storage.from("shop-media").getPublicUrl(path).data.publicUrl;

  return res.data.map((r) => ({
    id: r.id,
    name: r.name,
    cultivar: r.cultivar,
    thcPercent: r.thc_percent,
    cbdPercent: r.cbd_percent,
    packSizeGrams: r.pack_size_grams,
    unitCode: r.unit_code,
    localCodePzn: r.local_code_pzn,
    dominanceCode: r.dominance_code,
    countryOfOrigin: r.country_of_origin,
    region: r.region,
    images: (r.images ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((im) => imageUrl(im.path)),
    pricePublic: r.price_public,
    pricePerGram: r.price_per_gram,
  }));
}
