/**
 * Read side of the Present shop. `getMyShop()` returns the logged-in company's
 * storefront — profile + products with their company-wide price. RLS scopes
 * everything to the caller's own company, so no company id is passed in.
 *
 * (Browsing *another* company's public shop — /present/[companyId] — comes later;
 * the public-read RLS from the foundation migration already supports it.)
 */
import { createClient } from "@/shared/db/server";
import { pickRepresentativeBatch, deriveTerpPercent } from "./shopMap";

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
  /** Sum of the representative batch's terpene rows (D-01) — derived, not a column. */
  terpPercent: number | null;
  profile_visible: boolean;
  price_public: boolean;
  price_per_gram: number | null;
  bundle_threshold_grams: number | null;
  bundle_price_per_gram: number | null;
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
    tags: string[];
  };
  products: ShopProduct[];
};

/** Pull the links array out of the company's jsonb metadata, tolerating any
 *  legacy/foreign shape (returns [] rather than throwing on unexpected data). */
function parseLinks(metadata: unknown): ShopLink[] {
  const raw = (metadata as { links?: unknown } | null)?.links;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (l): l is ShopLink => !!l && typeof (l as ShopLink).value === "string",
  );
}

export async function getMyShop(): Promise<Shop | null> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;

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
      "id, name, cultivar, thc_percent, cbd_percent, cbg_percent, cbn_percent, cultivator, lineage_parent_a, lineage_parent_b, irradiation_code, supplier_product_code, packaging_material, resealable, location, pack_size_grams, unit_code, local_code_pzn, dominance_code, country_of_origin, region, profile_visible, price_public, product_image(id, image_path, position), product_media(id, kind, path, url, label, position), product_batch(id, batch_number, ready_for_sale_date, expiry_date, thc_percent, cbd_percent, created_at, deleted_at, batch_terpene(percent)), pricelist_item(price_per_gram, bundle_threshold_grams, bundle_price_per_gram)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  const products: ShopProduct[] = (rows ?? []).map((r) => {
    const price = Array.isArray(r.pricelist_item) ? r.pricelist_item[0] : r.pricelist_item;
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
      terpPercent: deriveTerpPercent(repBatch),
      profile_visible: r.profile_visible,
      price_public: r.price_public,
      price_per_gram: price?.price_per_gram ?? null,
      bundle_threshold_grams: price?.bundle_threshold_grams ?? null,
      bundle_price_per_gram: price?.bundle_price_per_gram ?? null,
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
      tags: (company.company_type_assignment ?? []).map((t) => t.company_type_code),
    },
    products,
  };
}
