import { createClient } from "@/shared/db/server";
import { countryName } from "@/shared/geo/countries";
import { categoryLabel } from "./taxonomy";
import {
  parseLinks,
  type Shop,
  type ShopLink,
  type ShopProduct,
  type ProductImage,
} from "@/modules/catalog/shop";
import { deriveInitialLocations, type WarehouseLocation } from "@/modules/catalog/locations";
// The ONE snake→camel boundary for the tier ladder (pricelist.ts). Imported via
// the CLIENT barrel deliberately: `@/modules/catalog` (index.ts) re-exports the
// "use server" manage actions, which must not be dragged into this read module.
import { mapTiers } from "@/modules/catalog/index.client";
import type { Database } from "@/types/database.types";

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
  /** RAW `shop-media` storage PATHS, never resolved URLs (T02, B2/B8). The
   *  buyer's shop renders through `ShopView`, which builds its own srcs via
   *  `mediaUrl(path)` — handing it an already-resolved URL yields
   *  `…/shop-media/https://…`, a broken banner both sides of which are
   *  `string | null`, so `tsc` stays silent. One representation of the fact. */
  logoPath: string | null;
  coverPath: string | null;
  categories: string[];
  connectionState: ConnectionState;
  pricingRequested: boolean; // a pricelist_request from us to them is pending
  // ---- Shop chrome (T01) — the facts the buyer's ShopView needs to render the
  // seller's shop with the SAME components /present uses. ----
  /** Raw company-type codes, as ShopView's tag chips want them. Same fact as
   *  `categories`, which is the SAME codes passed through `categoryLabel` —
   *  one source (`type_codes`), two renderings, never two columns. */
  tags: string[];
  address: string | null;
  warehouseLocation: string | null;
  /** timestamptz off the RPC, kept a STRING to match `Shop.company.updated_at`.
   *  Never coerce to a Date here. */
  updatedAt: string | null;
  links: ShopLink[];
  locations: WarehouseLocation[];
};

/**
 * The RPC's row, derived from the generated types rather than hand-written, so a
 * column renamed in SQL fails `tsc` here instead of arriving as `undefined` at
 * runtime. Two corrections to what the generator claims:
 *
 *  - `connection_state` is generated as `string`; it is this module's
 *    `ConnectionState` union. Narrowed — the ONE domain column.
 *  - the generator marks every `RETURNS TABLE` column NOT NULL, which is false
 *    in the other direction. Widened only the two the pre-written spec drives
 *    with an uncast NULL: `warehouse_location`, `type_codes`, and — since T02
 *    made them raw paths the shop chrome reads directly — `logo_path` and
 *    `cover_path`.
 *    ⚠️ `address`, `tagline`, `about` and `website` are ALSO nullable in the DB
 *    (`20260607090002_phase1_core.sql:41`) and are
 *    STILL typed non-null here — seeded companies really do return NULL for
 *    them. Nothing crashes today because every consumer below is null-tolerant,
 *    but `r.address.trim()` would compile and throw. Widen these before relying
 *    on the type, and do not read the list above as "the rest are non-null".
 *
 * Do NOT collapse this back into an `as unknown as {…}` cast — that reinstates
 * exactly the blindness this shape removes.
 */
type RpcRow = Database["public"]["Functions"]["get_discoverable_company"]["Returns"][number];
type ProfileRow = Omit<
  RpcRow,
  "connection_state" | "type_codes" | "warehouse_location" | "logo_path" | "cover_path"
> & {
  connection_state: ConnectionState;
  type_codes: string[] | null;
  warehouse_location: string | null;
  logo_path: string | null;
  cover_path: string | null;
};

/**
 * Pure row → view mapper (same shape as `mapDiscoverPersonRow`).
 *
 * ⚠️ `_urlFor` is DEAD as of T02 and kept only to hold this function's shipped
 * two-argument signature (the pre-written spec calls it with both). Logo/cover
 * now travel as raw storage paths — see `logoPath`/`coverPath` above. Drop the
 * parameter when the spec that pins it is next revised.
 *
 * `links` and `locations` arrive as the two NAMED metadata keys the RPC
 * projects — never the whole `metadata` blob — and are re-wrapped here for the
 * helpers the SELLER's shop already uses (`parseLinks`, `deriveInitialLocations`),
 * so buyer and seller parse identical data identically.
 */
export function mapDiscoverCompanyRow(
  r: ProfileRow,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _urlFor: (bucket: string, path: string) => string,
): DiscoverCompanyProfile {
  const typeCodes = r.type_codes ?? [];
  return {
    id: r.id,
    name: r.name,
    tagline: r.tagline,
    about: r.about,
    countryCode: r.country,
    countryName: countryName(r.country),
    website: r.website,
    logoPath: r.logo_path,
    coverPath: r.cover_path,
    categories: typeCodes.map(categoryLabel),
    tags: [...typeCodes],
    connectionState: r.connection_state,
    pricingRequested: r.pricing_requested,
    address: r.address,
    warehouseLocation: r.warehouse_location,
    updatedAt: r.updated_at,
    links: parseLinks({ links: r.links }),
    locations: deriveInitialLocations({ locations: r.locations }, r.warehouse_location),
  };
}

export async function getDiscoverableCompany(
  companyId: string,
): Promise<DiscoverCompanyProfile | null> {
  const supabase = await createClient();

  const res = await supabase.rpc("get_discoverable_company", { p_company_id: companyId });

  if (res.error || !res.data || res.data.length === 0) return null;
  const row = res.data[0];

  const urlFor = (bucket: string, path: string) =>
    supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

  return mapDiscoverCompanyRow(
    // The single domain narrowing, at the boundary: `connection_state` is
    // generated as `string`. Every other column stays type-checked by name.
    { ...row, connection_state: row.connection_state as ConnectionState },
    urlFor,
  );
}

// ---- Company catalogue (slice 4 / T02) ----

/**
 * `DiscoverCompanyProfile → Shop["company"]` — the shape `ShopView` renders.
 *
 * Six fields are renamed across this boundary (`about→description`,
 * `countryCode→country`, `updatedAt→updated_at`,
 * `warehouseLocation→warehouse_location`, `logoPath→logo_path`,
 * `coverPath→cover_path`); the rest pass straight through. `countryName`,
 * `categories`, `connectionState` and `pricingRequested` are Discover-side
 * facts the shop chrome has no slot for and are deliberately dropped here.
 *
 * ⚠️ `logo_path` / `cover_path` are STORAGE PATHS. `ShopView` resolves them
 * itself; a resolved URL in either slot renders `…/shop-media/https://…` and
 * still type-checks, which is why this translation has its own unit spec.
 */
export function toShopCompany(profile: DiscoverCompanyProfile): Shop["company"] {
  return {
    id: profile.id,
    name: profile.name,
    tagline: profile.tagline,
    description: profile.about,
    cover_path: profile.coverPath,
    logo_path: profile.logoPath,
    updated_at: profile.updatedAt,
    warehouse_location: profile.warehouseLocation,
    country: profile.countryCode,
    address: profile.address,
    website: profile.website,
    links: profile.links,
    locations: profile.locations,
    tags: profile.tags,
  };
}

/** One row of `get_discoverable_shop`. `tiers` is the view's jsonb ladder —
 *  `unknown` because it is unvalidated at this boundary and `mapTiers` owns
 *  narrowing it (never a cast: the jsonb is snake_case and `PriceTier` is not). */
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
  tiers: unknown;
};

/**
 * Pure `ShopRow → ShopProduct` mapper — the buyer's catalogue in the SAME shape
 * the seller's `/present` grid consumes, so one `ProductCard` serves both
 * (G2 variant A).
 *
 * Three fields carry a guarantee the compiler cannot hold up:
 *  • `price_public` is forwarded VERBATIM. Hardcoding `true` would collapse
 *    "price on request" and "price not set yet" into one state and silently
 *    kill per-product Request-pricing for every buyer.
 *  • `profile_visible` is OMITTED entirely — it is seller shelf state, and an
 *    explicit `false` paints a "Hidden" badge on a buyer's card.
 *  • `tiers` goes through `mapTiers`; the RPC's jsonb is snake_case, so a cast
 *    yields `minGrams: undefined` and an empty ladder with every test green.
 *
 * Everything the RPC does not return is `null` / `[]` — never invented. That
 * includes `supplier_product_code` (buyers never see it, ADR-0005) and
 * `location` (no location column until T05, so no tabs).
 */
export function mapDiscoverShopRow(r: ShopRow): ShopProduct {
  const tiers = mapTiers(r.tiers);
  const images: ProductImage[] = (r.images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((im) => ({ id: im.id, path: im.path }));

  return {
    id: r.id,
    name: r.name,
    cultivar: r.cultivar,
    thc_percent: r.thc_percent,
    cbd_percent: r.cbd_percent,
    cbg_percent: null,
    cbn_percent: null,
    cultivator: null,
    lineage_parent_a: null,
    lineage_parent_b: null,
    irradiation_code: null,
    supplier_product_code: null,
    packaging_material: null,
    resealable: null,
    location: null,
    pack_size_grams: r.pack_size_grams,
    unit_code: r.unit_code,
    local_code_pzn: r.local_code_pzn,
    dominance_code: r.dominance_code,
    country_of_origin: r.country_of_origin,
    region: r.region,
    images,
    media: [],
    batches: [],
    terpPercent: null,
    price_public: r.price_public,
    price_per_gram: r.price_per_gram,
    // Bridge fields = rung 1, the same derivation the seller read uses
    // (`shop.ts:254-255`), so both grids agree on the volume bubble.
    bundle_threshold_grams: tiers[0]?.minGrams ?? null,
    bundle_price_per_gram: tiers[0]?.pricePerGram ?? null,
    tiers,
    packSizes: [],
  };
}

/**
 * The visible catalogue of a verified company, for the Discover profile. Goes
 * through the `get_discoverable_shop` SECURITY DEFINER RPC — the audience-scoped
 * window that returns only `profile_visible` products (prices only where public),
 * even when the viewer isn't connected. Empty array = L0 (locked / nothing shared).
 */
export async function getDiscoverableShop(companyId: string): Promise<ShopProduct[]> {
  const supabase = await createClient();

  const res = (await supabase.rpc("get_discoverable_shop" as never, {
    p_company_id: companyId,
  } as never)) as unknown as { data: ShopRow[] | null; error: { message: string } | null };

  if (res.error || !res.data) return [];

  return res.data.map(mapDiscoverShopRow);
}
