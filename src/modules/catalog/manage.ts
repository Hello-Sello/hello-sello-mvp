"use server";

/**
 * Owner write side of the Present shop — the "Manage shop" actions. Each resolves
 * the caller's company from the session (never a passed-in id) and relies on the
 * company-scoped RLS (company_update / product_all / shop_media_*), so a caller
 * can only ever modify their OWN shop.
 *
 * Media lands in the public `shop-media` bucket under {company_id}/..., which the
 * insert policy requires. Gallery photos use a fresh uuid filename (new path = new
 * URL). Cover/logo are single-slot, so they use a STABLE filename
 * ({company_id}/cover|logo) + upsert — the upload overwrites the one file instead
 * of orphaning the old one; a `?v=updated_at` nonce on read busts the cache. All
 * media bytes are uploaded client-direct (see ShopView); these actions only record
 * the resulting path string, never the file — dodging the Server-Action body limit.
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

  // Cover/logo bytes are uploaded client-direct (ShopView) to a stable path; we
  // persist only the path string. An empty value means "unchanged this save".
  const coverPath = str(formData, "cover_path");
  const logoPath = str(formData, "logo_path");
  if (coverPath) patch.cover_path = coverPath;
  if (logoPath) patch.logo_path = logoPath;

  const { error } = await supabase.from("company").update(patch).eq("id", companyId);
  if (error) return { error: error.message };
  revalidatePath("/present");
  return { ok: true };
}

/** Link already-uploaded gallery photos to a product (metadata only).
 *
 *  The browser uploads the files straight to the `shop-media` bucket — Storage
 *  RLS scopes writes to the company's own folder — and hands us only the
 *  resulting storage paths. Keeping the bytes off the server sidesteps the
 *  Next.js Server Action body limit (1 MB) and Vercel's platform body cap
 *  (4.5 MB), which a multi-photo gallery would blow past. This action just
 *  appends the rows after the current last position (index 0 = cover). */
export async function addProductImageRecords(productId: string, paths: string[]): Promise<ManageResult> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return { error: "No company in session." };
  if (paths.length === 0) return { error: "No image provided." };

  const { data: last } = await supabase
    .from("product_image")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);
  let position = (last?.[0]?.position ?? -1) + 1;

  const rows = paths.map((path) => ({
    product_id: productId,
    company_id: companyId,
    image_path: path,
    position: position++,
  }));
  const { error } = await supabase.from("product_image").insert(rows);
  if (error) return { error: error.message };
  revalidatePath("/present");
  return { ok: true };
}

export type RemoveResult = { ok: true; path: string } | { error: string };

/** Remove one image's metadata row and return its storage path so the caller can
 *  delete the file from the browser (same client that uploaded it — storage I/O
 *  stays client-side on both add and remove). Row first, then file: an orphaned
 *  file is harmless, whereas a row pointing at a deleted file shows a broken
 *  image. Remaining positions are left as-is (ordering is by position, so gaps
 *  are harmless and the next reorder rewrites them). */
export async function removeProductImage(imageId: string): Promise<RemoveResult> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return { error: "No company in session." };

  const { data: row } = await supabase
    .from("product_image")
    .select("image_path")
    .eq("id", imageId)
    .single();
  if (!row) return { error: "Image not found." };

  const { error } = await supabase.from("product_image").delete().eq("id", imageId);
  if (error) return { error: error.message };

  revalidatePath("/present");
  return { ok: true, path: row.image_path };
}

/** Set the display order of a product's gallery. `orderedIds` is the full image
 *  id list in the desired order; index 0 becomes the cover. This is the single
 *  authoritative writer of `position` — "make cover" and move-left/right both
 *  resolve to a reordered list passed here. */
export async function setProductImageOrder(productId: string, orderedIds: string[]): Promise<ManageResult> {
  const supabase = await createClient();
  const companyId = await getCurrentCompanyId();
  if (!companyId) return { error: "No company in session." };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("product_image")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("product_id", productId);
    if (error) return { error: error.message };
  }
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
