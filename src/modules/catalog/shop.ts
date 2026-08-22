/**
 * Read side of the Present shop. `getMyShop()` returns the logged-in company's
 * storefront — profile + products with their company-wide price. RLS scopes
 * everything to the caller's own company, so no company id is passed in.
 *
 * Browsing *another* company's public shop is a SEPARATE read, and it does NOT
 * live here: it goes through `get_discoverable_shop` and the mapper in
 * `src/app/discover/companies.ts`, rendering at /discover/[companyId] (slug 0022).
 * There is deliberately ONE read door per surface — see ARCHITECTURE-NOTES.md:423.
 * (The old note here said that read "comes later" at /present/[companyId]; both
 * the timing and the route were wrong by the time T03 opened this file.)
 */
import { createClient } from "@/shared/db/server";
import { getCurrentUser } from "@/shared/auth";
import { pickRepresentativeBatch, deriveTerpPercent } from "./shopMap";
import { deriveInitialLocations, type WarehouseLocation } from "./locations";
import { readCurrentPrices, type ProductPrice } from "./pricelist";
import type { PriceTier } from "./pricing";

export type { WarehouseLocation };

/** One image in a product's gallery, ordered by the seller. The first entry
 *  (lowest position) is the cover / thumbnail. `path` is a `shop-media` storage
 *  path; the UI builds the public URL from it. */
export type ProductImage = { id: string; path: string };

/** One "Documents & Media" item on the card back (D-11). A `video_link` carries
 *  an external `url` (no file); a `coa`/`doc` carries a `shop-media` `path`. */
export type ProductMedia = {
  id: string;
  kind: "video_link" | "coa" | "doc";
  path: string | null;
  url: string | null;
  label: string | null;
};

/** A lot on the product, surfaced for the optional batch affordance (DEV-108).
 *  Measured CoA values only; seller cost is never surfaced on the card. */
export type ProductBatchLite = {
  id: string;
  batch_number: string;
  thc_percent: number | null;
  cbd_percent: number | null;
  expiry_date: string | null;
};

export type ShopProduct = {
  id: string;
  name: string;
  cultivar: string | null;
  thc_percent: number | null;
  cbd_percent: number | null;
  cbg_percent: number | null;
  cbn_percent: number | null;
  cultivator: string | null;
  lineage_parent_a: string | null;
  lineage_parent_b: string | null;
  irradiation_code: string | null;
  supplier_product_code: string | null;
  packaging_material: string | null;
  resealable: boolean | null;
  location: string | null;
  pack_size_grams: number | null;
  unit_code: string | null;
  local_code_pzn: string | null;
  dominance_code: string | null;
  country_of_origin: string | null;
  region: string | null;
  images: ProductImage[];
  media: ProductMedia[];
  batches: ProductBatchLite[];
  /** Headline total-terpenes %: the manual `product.terpene_percent` column when
   *  set (D-01, F-02), otherwise the derived sum of the representative batch's
   *  terpene rows. Cost/COGS is never surfaced. */
  terpPercent: number | null;
  /** Seller-side shelf state: whether the product shows in the owner's own shop
   *  listing. OPTIONAL because it is seller state — a buyer-facing mapper never
   *  has it and must never render it. Absent ≠ hidden: only an explicit `false`
   *  means the seller hid it (see `ProductCard.tsx`'s "Hidden" badge guard). */
  profile_visible?: boolean;
  price_public: boolean;
  price_per_gram: number | null;
  /** BRIDGE (retired by T04/T05, columns dropped in C): rung 1 of `tiers`
   *  surfaced under the old single-bracket names so the current bubble UI keeps
   *  rendering — post-backfill rung 1 IS the old bracket. */
  bundle_threshold_grams: number | null;
  bundle_price_per_gram: number | null;
  /** The full tier ladder, camelCase, from the current-price view. */
  tiers: PriceTier[];
  /** Extra sellable pack sizes beyond the product's own `pack_size_grams` — a
   *  lightweight v0 (stored in `product.metadata.pack_sizes`, no schema change)
   *  ahead of a proper `product_pack_size` table in a later phase. */
  packSizes: number[];
};

/** A profile link, stored in `company.metadata.links` (no column per link).
 *  `value` is platform-dependent: a bare handle for instagram/x (so the link
 *  survives a domain change like twitter.com→x.com and renders as @handle), or a
 *  full URL for linkedin/custom (no single handle format). `label` is custom-only. */
export type ShopLink = {
  platform: "linkedin" | "instagram" | "x" | "custom";
  value: string;
  label?: string;
};

export type Shop = {
  company: {
    id: string;
    name: string;
    tagline: string | null;
    description: string | null;
    cover_path: string | null;
    logo_path: string | null;
    updated_at: string | null;
    warehouse_location: string | null;
    country: string | null;
    address: string | null;
    website: string | null;
    links: ShopLink[];
    /** The small named warehouse list (F-07 / Cluster H): Headquarter stays the
     *  separate `address`/`country` display above — this is Warehouse 1/2/3, free
     *  text, seeded from the legacy `warehouse_location` column on first read. */
    locations: WarehouseLocation[];
    tags: string[];
  };
  products: ShopProduct[];
};

/** Pull the links array out of the company's jsonb metadata, tolerating any
 *  legacy/foreign shape (returns [] rather than throwing on unexpected data). */
export function parseLinks(metadata: unknown): ShopLink[] {
  const raw = (metadata as { links?: unknown } | null)?.links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is ShopLink => !!l && typeof (l as ShopLink).value === "string",
  );
}

/** Extra pack sizes stashed in `product.metadata.pack_sizes` (v0, no schema
 *  change). Tolerant of any legacy/foreign shape — returns [] rather than
 *  throwing on unexpected data. */
export function parsePackSizes(metadata: unknown): number[] {
  const raw = (metadata as { pack_sizes?: unknown } | null)?.pack_sizes;
  if (!Array.isArray(raw)) return [];
  return raw.filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0);
}

export async function getMyShop(): Promise<Shop | null> {
  // Shares the request-memoized auth check with every other accessor (see
  // shared/auth) instead of calling supabase.auth.getClaims() on its own fresh
  // client — that redundant concurrent read (racing getCompanyProfile() in the
  // same Promise.all) was the root cause of a transient logout-on-save bug.
  const user = await getCurrentUser();
  if (!user) return null;
  const uid = user.id;

  const supabase = await createClient();

  const { data: person } = await supabase
    .from("person")
    .select("company_id")
    .eq("id", uid)
    .single();
  const companyId = person?.company_id;
  if (!companyId) return null;

  const { data: company } = await supabase
    .from("company")
    .select(
      "id, name, tagline, description, cover_path, logo_path, updated_at, warehouse_location, country, address, website, metadata, company_type_assignment(company_type_code)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return null;

  const { data: rows } = await supabase
    .from("product")
    .select(
      "id, name, cultivar, thc_percent, cbd_percent, cbg_percent, cbn_percent, terpene_percent, cultivator, lineage_parent_a, lineage_parent_b, irradiation_code, supplier_product_code, packaging_material, resealable, location, pack_size_grams, unit_code, local_code_pzn, dominance_code, country_of_origin, region, profile_visible, price_public, metadata, product_image(id, image_path, position), product_media(id, kind, path, url, label, position), product_batch(id, batch_number, ready_for_sale_date, expiry_date, thc_percent, cbd_percent, created_at, deleted_at, batch_terpene(percent))",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  // Prices come from the single owner (current-price view), stitched by id.
  // Degrade contract: a failed price read yields a priceless shop (null
  // price, empty tiers) — never a broken /present page.
  let prices = new Map<string, ProductPrice>();
  if (rows?.length) {
    try {
      prices = await readCurrentPrices(supabase, rows.map((r) => r.id));
    } catch {
      // priceless, not broken — see the degrade contract above
    }
  }

  const products: ShopProduct[] = (rows ?? []).map((r) => {
    const price = prices.get(r.id);
    const images: ProductImage[] = (r.product_image ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((im) => ({ id: im.id, path: im.image_path }));
    const media: ProductMedia[] = (r.product_media ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((m) => ({
        id: m.id,
        kind: m.kind as ProductMedia["kind"],
        path: m.path,
        url: m.url,
        label: m.label,
      }));
    // Soft-deleted lots are excluded from both the batch list and the Terp% pick.
    const liveBatches = (r.product_batch ?? []).filter((b) => b.deleted_at === null);
    const repBatch = pickRepresentativeBatch(liveBatches);
    const batches: ProductBatchLite[] = liveBatches.map((b) => ({
      id: b.id,
      batch_number: b.batch_number,
      thc_percent: b.thc_percent,
      cbd_percent: b.cbd_percent,
      expiry_date: b.expiry_date,
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
      supplier_product_code: r.supplier_product_code,
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
      batches,
      // Manual column wins; the derived batch-terpene sum is the fallback (F-02).
      terpPercent: r.terpene_percent ?? deriveTerpPercent(repBatch),
      profile_visible: r.profile_visible,
      price_public: r.price_public,
      price_per_gram: price?.pricePerGram ?? null,
      // Bridge fields = rung 1 (see ShopProduct — T04/T05 retire the consumers).
      bundle_threshold_grams: price?.tiers[0]?.minGrams ?? null,
      bundle_price_per_gram: price?.tiers[0]?.pricePerGram ?? null,
      tiers: price?.tiers ?? [],
      packSizes: parsePackSizes(r.metadata),
    };
  });

  return {
    company: {
      id: company.id,
      name: company.name,
      tagline: company.tagline,
      description: company.description,
      cover_path: company.cover_path,
      logo_path: company.logo_path,
      updated_at: company.updated_at,
      warehouse_location: company.warehouse_location,
      country: company.country,
      address: company.address,
      website: company.website,
      links: parseLinks(company.metadata),
      locations: deriveInitialLocations(company.metadata, company.warehouse_location),
      tags: (company.company_type_assignment ?? []).map((t) => t.company_type_code),
    },
    products,
  };
}
