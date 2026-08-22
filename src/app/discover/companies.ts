import { createClient } from "@/shared/db/server";
import { countryName } from "@/shared/geo/countries";
import { categoryLabel } from "./taxonomy";
import {
  parseLinks,
  parsePackSizes,
  type Shop,
  type ShopLink,
  type ShopProduct,
  type ProductImage,
  type ProductMedia,
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

/**
 * One row of `get_discoverable_shop`, derived from the generated types rather
 * than hand-written — the same re-widen shape `ProfileRow` above uses for the
 * sibling RPC, so a column renamed in SQL fails `tsc` here instead of arriving
 * as `undefined` at runtime. A BARE generated row does not work: the generator
 * emits `jsonb` as `Json` (no `.slice()`, no field access) and marks every
 * `RETURNS TABLE` column NOT NULL, which is false for 21 of the 24 re-widened
 * below (the other three are the two jsonb galleries and the tiers ladder).
 *
 * Re-widened, and why:
 *  - `images` / `media` — `Json` → the ordered object arrays the RPC actually
 *    builds. Both are `coalesce`d to `[]` in SQL, so neither is null in
 *    practice; `| null` is kept as the honest boundary type.
 *  - `tiers` / `pack_sizes` — `unknown`, deliberately. Both are unvalidated
 *    jsonb and each has an owner that narrows it (`mapTiers`, `parsePackSizes`).
 *    Never a cast: the tier jsonb is snake_case and `PriceTier` is not.
 *  - every genuinely nullable column, including the T05 spec set.
 *
 * Do NOT collapse this back into an `as unknown as {…}` cast — that reinstates
 * exactly the blindness this shape removes.
 */
type ShopRpcRow = Database["public"]["Functions"]["get_discoverable_shop"]["Returns"][number];
type ShopRow = Omit<
  ShopRpcRow,
  | "cultivar"
  | "thc_percent"
  | "cbd_percent"
  | "pack_size_grams"
  | "unit_code"
  | "local_code_pzn"
  | "dominance_code"
  | "country_of_origin"
  | "region"
  | "images"
  | "price_per_gram"
  | "tiers"
  | "cbg_percent"
  | "cbn_percent"
  | "terpene_percent"
  | "cultivator"
  | "lineage_parent_a"
  | "lineage_parent_b"
  | "irradiation_code"
  | "packaging_material"
  | "resealable"
  | "location"
  | "pack_sizes"
  | "media"
> & {
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
  price_per_gram: number | null;
  tiers: unknown;
  cbg_percent: number | null;
  cbn_percent: number | null;
  terpene_percent: number | null;
  cultivator: string | null;
  lineage_parent_a: string | null;
  lineage_parent_b: string | null;
  irradiation_code: string | null;
  packaging_material: string | null;
  resealable: boolean | null;
  location: string | null;
  pack_sizes: unknown;
  media: { id: string; kind: string; path: string | null; url: string | null; label: string | null }[] | null;
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
 * Two fields stay `null` / `[]` even after T05, and neither is an omission:
 * `supplier_product_code` (the seller's internal code — buyers never see it,
 * ADR-0005, and the RPC does not return it) and `batches` (no lot list on a
 * buyer's card). `media` is NOT one of them — it rides the RPC.
 *
 * `terpPercent` is a straight passthrough of `r.terpene_percent`: the RPC
 * already applies manual-column-first / representative-lot-sum-fallback
 * server-side, the same derivation `shop.ts:249` runs for the seller. Deriving
 * it again here would be a second owner of the same rule.
 */
export function mapDiscoverShopRow(r: ShopRow): ShopProduct {
  const tiers = mapTiers(r.tiers);
  const images: ProductImage[] = (r.images ?? [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((im) => ({ id: im.id, path: im.path }));
  // Already position-ordered by the RPC (the jsonb_agg carries `order by
  // pm.position`), so no re-sort — unlike `images`, whose rows carry the
  // position and are re-sorted defensively.
  const media: ProductMedia[] = (r.media ?? []).map((m) => ({
    id: m.id,
    kind: m.kind as ProductMedia["kind"],
    path: m.path,
    url: m.url,
    label: m.label,
  }));

  return {
    id: r.id,
    name: r.name,
    cultivar: r.cultivar,
    thc_percent: r.thc_percent,
    cbd_percent: r.cbd_percent,
    cbg_percent: r.cbg_percent,
    cbn_percent: r.cbn_percent,
    cultivator: r.cultivator,
    lineage_parent_a: r.lineage_parent_a,
    lineage_parent_b: r.lineage_parent_b,
    irradiation_code: r.irradiation_code,
    supplier_product_code: null,
    packaging_material: r.packaging_material,
    resealable: r.resealable,
    location: r.location,
    pack_size_grams: r.pack_size_grams,
    unit_code: r.unit_code,
    local_code_pzn: r.local_code_pzn,
    dominance_code: r.dominance_code,
    country_of_origin: r.country_of_origin,
    region: r.region,
    images,
    media,
    batches: [],
    terpPercent: r.terpene_percent,
    price_public: r.price_public,
    price_per_gram: r.price_per_gram,
    // Bridge fields = rung 1, the same derivation the seller read uses
    // (`shop.ts:254-255`), so both grids agree on the volume bubble.
    bundle_threshold_grams: tiers[0]?.minGrams ?? null,
    bundle_price_per_gram: tiers[0]?.pricePerGram ?? null,
    tiers,
    // The SAME parser the seller's read uses (ADR :474-476) — the RPC returns
    // the raw `metadata->'pack_sizes'` jsonb, so the finite-and-positive filter
    // lives in exactly one place and the two shops cannot disagree.
    packSizes: parsePackSizes({ pack_sizes: r.pack_sizes }),
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

  const res = await supabase.rpc("get_discoverable_shop", { p_company_id: companyId });

  if (res.error || !res.data) return [];

  // The only narrowings at this boundary: the generator types both jsonb
  // galleries as the opaque `Json`, and neither `.slice()` nor field access
  // exists on it. Every other column stays type-checked BY NAME — a renamed
  // column now fails `tsc` here instead of arriving as `undefined`.
  return res.data.map((row) =>
    mapDiscoverShopRow({
      ...row,
      images: row.images as ShopRow["images"],
      media: row.media as ShopRow["media"],
    }),
  );
}
