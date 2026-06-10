"use server";

/**
 * Owner write side of the Present shop — the "Manage shop" actions. Each resolves
 * the caller's company from the session (never a passed-in id) and relies on the
 * company-scoped RLS (company_update / product_all / shop_media_*), so a caller
 * can only ever modify their OWN shop.
 *
 * Media lands in the public `shop-media` bucket under {company_id}/..., which the
 * insert policy requires. Every upload uses a fresh uuid filename: the public URL
 * is derived from the path, so a new path is a new URL — replacing a cover/logo/
 * photo busts the browser + CDN cache for free (no stale image after an edit).
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/shared/db/server";
import { getCurrentCompanyId } from "@/shared/auth";
import type { TablesUpdate } from "@/types/database.types";

export type ManageResult = { ok: true } | { error: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (fd: FormData, k: string) => str(fd, k) || null;

const LINK_PLATFORMS = new Set(["linkedin", "instagram", "x", "custom"]);

/** Reduce instagram/x input to a bare handle no matter what the seller typed —
 *  an @prefix, or a full profile URL pasted in. linkedin/custom keep their URL. */
function normalizeLinkValue(platform: string, raw: string): string {
  let v = raw.trim();
  if (platform === "instagram" || platform === "x") {
    v = v.replace(/^@+/, "");
    v = v.replace(/^https?:\/\/(www\.)?(instagram\.com|x\.com|twitter\.com)\//i, "");
    v = v.replace(/[/?#].*$/, ""); // drop any trailing path/query/fragment
  }
  return v.trim();
}

/** Validate the client-supplied links JSON into a clean array before it lands in
 *  metadata. Drops anything malformed rather than trusting the payload. */
function parseLinks(raw: FormDataEntryValue | null): Array<{ platform: string; label?: string; value: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((l) => {
    const platform = (l as { platform?: unknown })?.platform;
    const rawValue = (l as { value?: unknown })?.value;
    if (typeof platform !== "string" || !LINK_PLATFORMS.has(platform)) return [];
    if (typeof rawValue !== "string") return [];
    const value = normalizeLinkValue(platform, rawValue);
    if (!value) return [];
    const label = (l as { label?: unknown })?.label;
    return [{ platform, value, ...(typeof label === "string" && label.trim() ? { label: label.trim() } : {}) }];
  });
}

function imageExt(file: File): string {
  const m = /\.([a-z0-9]+)$/i.exec(file.name);
  if (m) return m[1].toLowerCase();
  return file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
}

/** Update the shop profile (text) plus optional cover/logo replacement. */
export async function updateShopProfile(formData: FormData): Promise<ManageResult> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return { error: "No company in session." };

  const name = str(formData, "name");
  if (!name) return { error: "Company name is required." };

  const patch: TablesUpdate<"company"> = {
    name,
    tagline: orNull(formData, "tagline"),
    description: orNull(formData, "description"),
    warehouse_location: orNull(formData, "warehouse_location"),
    address: orNull(formData, "address"),
    website: orNull(formData, "website"),
  };

  // Links live in metadata.links (one column per link would not scale). Merge so
  // any other metadata keys survive; the client sends the full links array.
  const { data: existing } = await supabase
    .from("company")
    .select("metadata")
    .eq("id", companyId)
    .single();
  const baseMeta =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};
  patch.metadata = { ...baseMeta, links: parseLinks(formData.get("links")) };

  for (const [field, key] of [["cover_path", "cover"], ["logo_path", "logo"]] as const) {
    const file = formData.get(key);
    if (file instanceof File && file.size > 0) {
      const path = `${companyId}/${key}-${crypto.randomUUID()}.${imageExt(file)}`;
      const { error } = await supabase.storage
        .from("shop-media")
        .upload(path, file, { contentType: file.type });
      if (error) return { error: `${key} upload failed: ${error.message}` };
      patch[field] = path;
    }
  }

  const { error } = await supabase.from("company").update(patch).eq("id", companyId);
  if (error) return { error: error.message };
  revalidatePath("/present");
  return { ok: true };
}

/** Attach or replace a single product's photo. */
export async function setProductImage(productId: string, formData: FormData): Promise<ManageResult> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return { error: "No company in session." };

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "No image provided." };

  const path = `${companyId}/products/${productId}-${crypto.randomUUID()}.${imageExt(file)}`;
  const { error: upErr } = await supabase.storage
    .from("shop-media")
    .upload(path, file, { contentType: file.type });
  if (upErr) return { error: `Image upload failed: ${upErr.message}` };

  // RLS (product_all) scopes the update to the caller's company.
  const { error } = await supabase.from("product").update({ image_path: path }).eq("id", productId);
  if (error) return { error: error.message };
  revalidatePath("/present");
  return { ok: true };
}

/** Toggle a product between a public price and "Request pricing". */
export async function setProductPricePublic(productId: string, isPublic: boolean): Promise<ManageResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("product")
    .update({ price_public: isPublic })
    .eq("id", productId);
  if (error) return { error: error.message };
  revalidatePath("/present");
  return { ok: true };
}
