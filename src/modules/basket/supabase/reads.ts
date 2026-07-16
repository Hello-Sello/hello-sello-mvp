"use client";

/**
 * Product Basket read — the whole cart, grouped by seller company. RLS returns
 * only the viewer's own lines; we join product (name, cultivar, unit, price) and
 * company (name) to build each group. The seller company is product.company_id.
 * The viewer's own company (from person) flags the own-company group; the
 * relationship map lets the drawer resolve where an other-company offer goes.
 */
import { createClient } from "@/shared/db/client";
import { groupBySeller } from "../lib/group";
import type { BasketLine, BasketView } from "../types";

export async function getMyBasket(): Promise<BasketView> {
  const supabase = createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) return { groups: [], totalLineCount: 0 };

  const { data: viewerPerson, error: personError } = await supabase
    .from("person").select("company_id").eq("id", user.id).single();
  if (personError) throw personError;
  const viewerCompanyId = viewerPerson?.company_id ?? "";

  // RLS-scoped: only my lines. Join the product + its owning company + list price.
  // pricelist_item is a many-to-one embed (a product can have more than one
  // pricelist row); order most-recently-updated first so repeated reads are
  // deterministic, with id as a final tie-break for equal timestamps. This is
  // a pragmatic choice, not full price-list resolution (no is_active/is_default
  // flag exists on pricelist_item to prefer instead).
  const { data: rows, error } = await supabase
    .from("product_basket_line")
    .select(
      "id, pack_count, pack_size_grams, " +
      "product:product_id(id, name, cultivar, unit_code, local_code_pzn, company_id, " +
      "company:company_id(id, name), pricelist_item(price_per_gram))",
    )
    .order("created_at", { ascending: true })
    .order("updated_at", { referencedTable: "product.pricelist_item", ascending: false })
    .order("id", { referencedTable: "product.pricelist_item", ascending: false });
  if (error) throw error;

  const typedRows = rows as unknown as Array<{
    id: string;
    pack_count: number;
    pack_size_grams: number | null;
    product: {
      id: string; name: string; cultivar: string | null; unit_code: string | null;
      local_code_pzn: string | null; company_id: string;
      company: { id: string; name: string } | null;
      pricelist_item: { price_per_gram: number | null }[] | { price_per_gram: number | null } | null;
    };
  }>;

  const lines: BasketLine[] = (typedRows ?? []).map((r) => {
    // Supabase nests joined rows; the FK joins here are to-one.
    const p = r.product as unknown as {
      id: string; name: string; cultivar: string | null; unit_code: string | null;
      local_code_pzn: string | null; company_id: string;
      company: { id: string; name: string } | null;
      pricelist_item: { price_per_gram: number | null }[] | { price_per_gram: number | null } | null;
    };
    const price = Array.isArray(p.pricelist_item) ? p.pricelist_item[0] : p.pricelist_item;
    return {
      id: r.id,
      productId: p.id,
      productName: p.name,
      cultivar: p.cultivar,
      unit: p.unit_code ?? "g",
      packCount: Number(r.pack_count),
      packSizeGrams: r.pack_size_grams == null ? null : Number(r.pack_size_grams),
      pricePerGram: price?.price_per_gram ?? null,
      currency: "EUR",
      pzn: p.local_code_pzn,
      sellerCompanyId: p.company_id,
      sellerCompanyName: p.company?.name ?? "Unknown company",
    };
  });

  // relationship map: for every OTHER seller company in the cart, the relationship id.
  const otherCompanyIds = [...new Set(lines.map((l) => l.sellerCompanyId))]
    .filter((id) => id !== viewerCompanyId);
  const relByCompany = new Map<string, string>();
  if (otherCompanyIds.length) {
    const { data: rels, error: relError } = await supabase
      .from("relationship")
      .select("id, company_a_id, company_b_id")
      .is("deleted_at", null);
    if (relError) throw relError;
    for (const rel of rels ?? []) {
      const other = rel.company_a_id === viewerCompanyId ? rel.company_b_id : rel.company_a_id;
      if (otherCompanyIds.includes(other)) relByCompany.set(other, rel.id);
    }
  }

  const groups = groupBySeller(lines, viewerCompanyId, relByCompany);
  return { groups, totalLineCount: lines.length };
}
