"use client";

/**
 * Product Basket read — the whole cart, grouped by seller company. RLS returns
 * only the viewer's own lines; we join product (name, cultivar, unit, price) and
 * company (name) to build each group. The seller company is product.company_id.
 * The viewer's own company (from person) flags the own-company group; the
 * relationship map lets the drawer resolve where an other-company offer goes.
 */
import { createClient } from "@/shared/db/client";
import { readCurrentPrices, type ProductPrice } from "@/modules/catalog/index.client";
import { groupBySeller } from "../lib/group";
import { EMPTY_BASKET, type BasketLine, type BasketView } from "../types";

export async function getMyBasket(): Promise<BasketView> {
  const supabase = createClient();
  // Which failures are legitimately an EMPTY basket, and which are errors, is
  // decided HERE and nowhere else. `BasketProvider` cannot tell them apart — it
  // only sees an exception — so it used to guess "signed out" for all of them
  // and silently blank the cart. Every `throw` below therefore means "the read
  // genuinely failed"; the provider renders any throw as an error state.
  //
  // An expired or invalid session is not a failure to report: the caller has no
  // basket because they are not signed in — the same outcome as no user at all.
  const { data: { user } = { user: null }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return EMPTY_BASKET;

  const { data: viewerPerson, error: personError } = await supabase
    .from("person").select("company_id").eq("id", user.id).single();
  // PGRST116 = `.single()` matched zero rows: a signed-up account that has not
  // finished onboarding yet. It has no basket, which is not an error. Any OTHER
  // person error (a grant, a transport fault) is real and must surface.
  if (personError?.code === "PGRST116") return EMPTY_BASKET;
  if (personError) throw personError;
  const viewerCompanyId = viewerPerson?.company_id ?? "";

  // Curated read, NOT a PostgREST embed off `product`.
  //
  // A basket line may legitimately point at a seller's HIDDEN product (T07
  // admits it when the product carries a public price), and `product` RLS does
  // not return that row — deliberately, because the row carries confidential
  // columns. An embed therefore yields `product: null` for exactly those lines
  // and the mapper below would blank the entire basket. `get_my_basket_lines()`
  // projects the ten fields rendered here and enforces ownership on auth.uid().
  const { data: rows, error } = await supabase.rpc("get_my_basket_lines");
  if (error) throw error;

  // No local re-assertion of the row shape: `database.types.ts` now declares the
  // six nullable columns as nullable, so there is ONE owner of that fact. The
  // details go null once the product stops being visible to this caller —
  // hidden, soft-deleted, out of its window, or the connection ended. The line
  // still returns so it can be seen and removed; only the details go dark.
  const typedRows = (rows ?? []).map((r) => ({
    id: r.id,
    pack_count: r.pack_count,
    pack_size_grams: r.pack_size_grams,
    product: {
      id: r.product_id,
      name: r.product_name ?? "No longer available",
      cultivar: r.cultivar,
      unit_code: r.unit_code,
      local_code_pzn: r.local_code_pzn,
      company_id: r.seller_company_id,
      company: r.seller_company_name === null
        ? null
        : { id: r.seller_company_id, name: r.seller_company_name },
    },
  }));

  const productIds = [...new Set((typedRows ?? []).map((r) => r.product.id))];
  const prices = productIds.length
    ? await readCurrentPrices(supabase, productIds)
    : new Map<string, ProductPrice>();

  const lines: BasketLine[] = (typedRows ?? []).map((r) => {
    // Supabase nests joined rows; the FK joins here are to-one.
    const p = r.product;
    const price = prices.get(p.id);
    return {
      id: r.id,
      productId: p.id,
      productName: p.name,
      cultivar: p.cultivar,
      unit: p.unit_code ?? "g",
      packCount: Number(r.pack_count),
      packSizeGrams: r.pack_size_grams == null ? null : Number(r.pack_size_grams),
      pricePerGram: price?.pricePerGram ?? null,
      currency: "EUR",
      pzn: p.local_code_pzn,
      sellerCompanyId: p.company_id,
      sellerCompanyName: p.company?.name ?? "Unknown company",
      tiers: price?.tiers ?? [],
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
