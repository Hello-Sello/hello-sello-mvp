/**
 * Read side of the Present shop. `getMyShop()` returns the logged-in company's
 * storefront — profile + products with their company-wide price. RLS scopes
 * everything to the caller's own company, so no company id is passed in.
 *
 * (Browsing *another* company's public shop — /present/[companyId] — comes later;
 * the public-read RLS from the foundation migration already supports it.)
 */
import { createClient } from "@/shared/db/server";

export type ShopProduct = {
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
  image_path: string | null;
  price_public: boolean;
  price_per_gram: number | null;
  bundle_threshold_grams: number | null;
  bundle_price_per_gram: number | null;
};

export type Shop = {
  company: {
    id: string;
    name: string;
    tagline: string | null;
    description: string | null;
    cover_path: string | null;
    logo_path: string | null;
    warehouse_location: string | null;
    country: string | null;
    address: string | null;
    website: string | null;
    tags: string[];
  };
  products: ShopProduct[];
};

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
      "id, name, tagline, description, cover_path, logo_path, warehouse_location, country, address, website, company_type_assignment(company_type_code)",
    )
    .eq("id", companyId)
    .single();
  if (!company) return null;

  const { data: rows } = await supabase
    .from("product")
    .select(
      "id, name, cultivar, thc_percent, cbd_percent, pack_size_grams, unit_code, local_code_pzn, dominance_code, country_of_origin, region, image_path, price_public, pricelist_item(price_per_gram, bundle_threshold_grams, bundle_price_per_gram)",
    )
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("name");

  const products: ShopProduct[] = (rows ?? []).map((r) => {
    const price = Array.isArray(r.pricelist_item) ? r.pricelist_item[0] : r.pricelist_item;
    return {
      id: r.id,
      name: r.name,
      cultivar: r.cultivar,
      thc_percent: r.thc_percent,
      cbd_percent: r.cbd_percent,
      pack_size_grams: r.pack_size_grams,
      unit_code: r.unit_code,
      local_code_pzn: r.local_code_pzn,
      dominance_code: r.dominance_code,
      country_of_origin: r.country_of_origin,
      region: r.region,
      image_path: r.image_path,
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
      warehouse_location: company.warehouse_location,
      country: company.country,
      address: company.address,
      website: company.website,
      tags: (company.company_type_assignment ?? []).map((t) => t.company_type_code),
    },
    products,
  };
}
