"use client";

/**
 * The seller storefront, with an owner edit mode. /present is always the caller's
 * OWN shop (getMyShop), so "Manage shop" is always available here; the visitor
 * view (/present/[companyId]) comes later. Read layout = the locked prototype
 * (cover + 3 profile cards + dominance filters + product grid). Edit mode swaps
 * the profile cards for a form and reveals per-product controls (photo, price
 * visibility); products are added through the drawer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useEmblaCarousel from "embla-carousel-react";
import {
  Heart, ShoppingCart, Link2, UploadCloud, Plus, FileSpreadsheet,
  Pencil, Check, ImagePlus, Loader2, Eye, EyeOff,
  Globe, Store, Trash2, ArrowLeft, ChevronLeft, ChevronRight, Star, X,
} from "lucide-react";
import type { Shop, ShopLink, ShopProduct, ProductImage } from "@/modules/catalog/shop";
import {
  updateShopProfile, addProductImageRecords, removeProductImage,
  setProductImageOrder, setProductPricePublic, setProductProfileVisible,
} from "@/modules/catalog/manage";
import { createClient } from "@/shared/db/client";
import { AddProductsDrawer } from "./AddProductsDrawer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Cover/logo now live at a STABLE path (overwritten in place, never orphaned), so
// their URL no longer changes on edit. Pass the company's `updated_at` as a `?v=`
// nonce to bust the browser cache after a swap. Gallery photos keep unique
// filenames, so they call this without a version.
const mediaUrl = (path: string, version?: string | null) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}${
    version ? `?v=${new Date(version).getTime()}` : ""
  }`;

// Client-side guards for direct-to-storage uploads. These mirror the bucket's
// own limits (the real enforcement lives in the shop-media bucket config); the
// checks here just give a friendly message before we attempt the upload.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket limit
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const imageExt = (file: File) =>
  file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";

const DOMINANCE_LABEL: Record<string, string> = {
  indica: "Indica",
  sativa: "Sativa",
  hybrid: "Hybrid",
  indica_dominant: "Indica-Dominant",
  sativa_dominant: "Sativa-Dominant",
};
const TAG_LABEL: Record<string, string> = {
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  importer: "Importer",
  cultivator: "Cultivator",
  pharmacy: "Pharmacy",
};
const eur = (n: number) => `${n.toFixed(2).replace(".", ",")}€`;
const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const FILTERS = ["All", "indica", "indica_dominant", "hybrid", "sativa_dominant", "sativa"];

// Brand glyphs (lucide dropped its deprecated brand icons). Single-path marks
// from simple-icons, tinted via currentColor so they inherit the link colour.
const BRAND_PATH: Record<"linkedin" | "instagram" | "x", string> = {
  linkedin: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z",
  instagram: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
};
function BrandGlyph({ name, size = 15 }: { name: keyof typeof BRAND_PATH; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" role="img" aria-hidden>
      <path d={BRAND_PATH[name]} />
    </svg>
  );
}

export function ShopView({ shop }: { shop: Shop }) {
  const { company, products } = shop;
  const router = useRouter();
  const [dom, setDom] = useState("All");
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto pb-6">
      {/* Owner action bar. While editing, the editor owns Save/Cancel — a single
          explicit save path, so leaving edit mode can never silently drop changes. */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep"
        >
          <Plus size={16} /> Add products
        </button>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink/75 hover:bg-white"
          >
            <Pencil size={16} /> Manage shop
          </button>
        )}
      </div>

      {editing ? (
        <ProfileEditor
          company={company}
          onSaved={() => { setEditing(false); router.refresh(); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <ProfileHero company={company} />
      )}

      {products.length === 0 ? (
        <EmptyShop onAdd={() => setDrawerOpen(true)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setDom(f)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  dom === f ? "bg-brand text-white shadow-sm" : "bg-white/60 text-ink/70 hover:bg-white/90"
                }`}
              >
                {f === "All" ? "All" : DOMINANCE_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {products
              .filter((p) => dom === "All" || p.dominance_code === dom)
              .map((p) => (
                <ProductCard key={p.id} p={p} companyId={company.id} editing={editing} onChanged={() => router.refresh()} />
              ))}
          </div>
        </>
      )}

      <AddProductsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onImported={() => { setDrawerOpen(false); router.refresh(); }}
      />
    </div>
  );
}

// ---------- profile: read ----------
function ProfileHero({ company }: { company: Shop["company"] }) {
  const cover = company.cover_path ? mediaUrl(company.cover_path, company.updated_at) : null;
  const logo = company.logo_path ? mediaUrl(company.logo_path, company.updated_at) : null;
  const hq = company.address || company.country || "—";

  return (
    <>
      <div className="relative">
        <div
          className="h-44 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-green-700 to-lime-600 bg-cover bg-center"
          style={cover ? { backgroundImage: `url(${cover})` } : undefined}
        />
        <div className="absolute -bottom-6 left-6 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-ink text-white shadow-lg">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={company.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl">❀</span>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr_1fr]">
        <div className="glass rounded-3xl p-5">
          <h1 className="text-2xl font-bold text-ink">{company.name}</h1>
          {company.tagline && <p className="mt-1 font-semibold text-ink/80">{company.tagline}</p>}
          {company.description && (
            <p className="mt-3 text-sm leading-relaxed text-ink/60">“{company.description}”</p>
          )}
        </div>
        <div className="glass rounded-3xl p-5">
          <div className="flex flex-col gap-0.5">
            {company.tags.length > 0 ? (
              company.tags.map((t) => (
                <span key={t} className="font-bold text-ink">#{TAG_LABEL[t] ?? titleCase(t)}</span>
              ))
            ) : (
              <span className="text-sm text-ink/40">No tags yet</span>
            )}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div>
              <div className="font-bold text-ink">Headquarter:</div>
              <div className="text-ink/70">{hq}</div>
            </div>
            {company.warehouse_location && (
              <div>
                <div className="font-bold text-ink">Warehouse:</div>
                <div className="text-ink/70">{company.warehouse_location}</div>
              </div>
            )}
          </div>
        </div>
        <div className="glass rounded-3xl p-5">
          {company.website || company.links.length > 0 ? (
            <div className="flex flex-col gap-2">
              {company.website && (
                <LinkRow icon={<Globe size={16} />} label="Website" url={company.website} />
              )}
              {company.links.map((l, i) => (
                <LinkRow key={i} icon={linkIcon(l.platform)} label={linkLabel(l)} url={linkHref(l)} />
              ))}
            </div>
          ) : (
            <span className="text-sm text-ink/40">No links yet</span>
          )}
        </div>
      </div>
    </>
  );
}

const PLATFORM_LABEL: Record<ShopLink["platform"], string> = {
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X",
  custom: "Link",
};
function linkIcon(platform: ShopLink["platform"]) {
  if (platform === "linkedin") return <BrandGlyph name="linkedin" size={16} />;
  if (platform === "instagram") return <BrandGlyph name="instagram" size={16} />;
  if (platform === "x") return <BrandGlyph name="x" size={16} />;
  return <Link2 size={16} />;
}
function linkHref(l: ShopLink) {
  if (l.platform === "instagram") return `https://instagram.com/${l.value}`;
  if (l.platform === "x") return `https://x.com/${l.value}`;
  return l.value; // linkedin / custom carry a full URL
}
function linkLabel(l: ShopLink) {
  if (l.platform === "instagram" || l.platform === "x") return `@${l.value}`;
  if (l.platform === "custom") return l.label || l.value;
  return PLATFORM_LABEL[l.platform];
}
function LinkRow({ icon, label, url }: { icon: React.ReactNode; label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer"
       className="flex items-center gap-2 font-bold text-ink hover:text-brand">
      {icon} {label}
    </a>
  );
}

// ---------- profile: edit ----------
function ProfileEditor({
  company, onSaved, onCancel,
}: { company: Shop["company"]; onSaved: () => void; onCancel: () => void }) {
  const [cover, setCover] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const linkVal = (p: ShopLink["platform"]) =>
    company.links.find((l) => l.platform === p)?.value ?? "";
  const [website, setWebsite] = useState(company.website ?? "");
  const [linkedin, setLinkedin] = useState(linkVal("linkedin"));
  const [instagram, setInstagram] = useState(linkVal("instagram"));
  const [x, setX] = useState(linkVal("x"));
  const [custom, setCustom] = useState<{ label: string; url: string }[]>(
    company.links.filter((l) => l.platform === "custom").map((l) => ({ label: l.label ?? "", url: l.value })),
  );

  const coverUrl = cover ? URL.createObjectURL(cover) : company.cover_path ? mediaUrl(company.cover_path, company.updated_at) : null;
  const logoUrl = logo ? URL.createObjectURL(logo) : company.logo_path ? mediaUrl(company.logo_path, company.updated_at) : null;

  const touch = () => setDirty(true);
  const pickCover = (f: File) => { setCover(f); touch(); };
  const pickLogo = (f: File) => { setLogo(f); touch(); };

  function cancel() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  }

  // Upload a freshly-picked cover/logo straight to storage (client-direct), so the
  // bytes never hit the Server-Action body limit (1 MB / 4.5 MB). Stable filenames
  // (${id}/cover|logo) + upsert overwrite the one file in place — no orphans. The
  // server action then records only the returned path string.
  async function uploadSlot(file: File | null, slot: "cover" | "logo"): Promise<{ path?: string; error?: string }> {
    if (!file) return {};
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WebP image." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be under 10 MB." };
    const path = `${company.id}/${slot}`;
    const { error } = await createClient().storage
      .from("shop-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    return error ? { error: `${slot} upload failed: ${error.message}` } : { path };
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Capture the form NOW: `e.currentTarget` is nulled once the event finishes
    // dispatching, and we await the uploads below before reading the fields.
    const form = e.currentTarget;
    setBusy(true);
    setError(null);

    const c = await uploadSlot(cover, "cover");
    if (c.error) { setError(c.error); setBusy(false); return; }
    const l = await uploadSlot(logo, "logo");
    if (l.error) { setError(l.error); setBusy(false); return; }

    const fd = new FormData(form);
    if (c.path) fd.set("cover_path", c.path);
    if (l.path) fd.set("logo_path", l.path);
    const links = [
      ...(linkedin.trim() ? [{ platform: "linkedin", value: linkedin.trim() }] : []),
      ...(instagram.trim() ? [{ platform: "instagram", value: instagram.trim() }] : []),
      ...(x.trim() ? [{ platform: "x", value: x.trim() }] : []),
      ...custom
        .filter((c) => c.url.trim())
        .map((c) => ({ platform: "custom", value: c.url.trim(), label: c.label.trim() || c.url.trim() })),
    ];
    fd.set("links", JSON.stringify(links));
    const res = await updateShopProfile(fd);
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    onSaved();
  }

  const input = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none";

  return (
    <form onSubmit={save} onChange={touch} className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={cancel}
            className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-2 text-sm font-bold text-ink/75 hover:bg-white"
          >
            <ArrowLeft size={16} /> Back to shop
          </button>
          <h2 className="text-lg font-bold text-ink">Edit shop</h2>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-bold text-white hover:bg-brand-deep disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="relative">
        <div
          className="h-44 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-green-700 to-lime-600 bg-cover bg-center"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        />
        <ImagePicker label="Change cover" onPick={pickCover} className="absolute right-3 top-3" />
        <div className="absolute -bottom-6 left-6 h-28 w-28">
          <button
            type="button"
            onClick={() => logoRef.current?.click()}
            className="group relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-ink text-white shadow-lg"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl">❀</span>
            )}
            {/* Hover reveals the full affordance... */}
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold opacity-0 transition group-hover:bg-ink/55 group-hover:opacity-100">
              <ImagePlus size={18} />
              {logoUrl ? "Change logo" : "Add logo"}
            </span>
            {/* ...while a persistent badge signals it's editable even without hover. */}
            <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded-full bg-ink/70 px-2 py-1 text-[10px] font-semibold transition group-hover:opacity-0">
              <ImagePlus size={12} /> Logo
            </span>
          </button>
          <input
            ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickLogo(f); }}
          />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-ink/70">Company name *</span>
          <input name="name" required defaultValue={company.name} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/70">Tagline</span>
          <input name="tagline" defaultValue={company.tagline ?? ""} className={input} />
        </label>
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-ink/70">Description</span>
          <textarea name="description" rows={2} defaultValue={company.description ?? ""} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/70">Warehouse location</span>
          <input name="warehouse_location" defaultValue={company.warehouse_location ?? ""} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-ink/70">Address</span>
          <input name="address" defaultValue={company.address ?? ""} className={input} />
        </label>
      </div>

      {/* Links — website keeps its column; the rest live in metadata.links */}
      <div className="space-y-2 pt-1">
        <span className="text-xs font-semibold text-ink/70">Links</span>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          <LinkField icon={<Globe size={15} />} placeholder="https://yoursite.com"
                     value={website} onChange={setWebsite} type="url" />
          <LinkField icon={<BrandGlyph name="linkedin" />} placeholder="linkedin.com/company/…"
                     value={linkedin} onChange={setLinkedin} type="url" />
          <LinkField icon={<BrandGlyph name="instagram" />} placeholder="username" prefix="@"
                     value={instagram} onChange={setInstagram} />
          <LinkField icon={<BrandGlyph name="x" />} placeholder="username" prefix="@"
                     value={x} onChange={setX} />
        </div>

        {custom.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              placeholder="Label" value={c.label} className={`${input} lg:w-40`}
              onChange={(e) => { const v = e.target.value; setCustom((cs) => cs.map((row, j) => j === i ? { ...row, label: v } : row)); }}
            />
            <input
              placeholder="https://…" type="url" value={c.url} className={input}
              onChange={(e) => { const v = e.target.value; setCustom((cs) => cs.map((row, j) => j === i ? { ...row, url: v } : row)); }}
            />
            <button
              type="button" aria-label="Remove link"
              onClick={() => { setCustom((cs) => cs.filter((_, j) => j !== i)); touch(); }}
              className="rounded-lg p-2 text-ink/40 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => { setCustom((cs) => [...cs, { label: "", url: "" }]); touch(); }}
          className="flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-deep"
        >
          <Plus size={14} /> Add custom link
        </button>
      </div>
    </form>
  );
}

function LinkField({
  icon, value, onChange, placeholder, type, prefix,
}: {
  icon: React.ReactNode; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; prefix?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-3 focus-within:border-brand">
      <span className="text-ink/40">{icon}</span>
      {prefix && <span className="text-sm font-semibold text-ink/40">{prefix}</span>}
      <input
        type={type ?? "text"} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent py-2 text-sm focus:outline-none"
      />
    </div>
  );
}

function ImagePicker({
  label, onPick, className,
}: { label: string; onPick: (f: File) => void; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className={`flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink ${className ?? ""}`}
      >
        <ImagePlus size={14} /> {label}
      </button>
      <input
        ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
      />
    </>
  );
}

// ---------- product image gallery (carousel + owner edit controls) ----------
// A product has many photos; the one at index 0 is the cover. Read mode is an
// Embla carousel (swipe + arrows + dots). Edit mode adds a multi-upload button
// and a thumbnail strip whose move / make-cover / remove actions all resolve to
// one ordered id list written through setProductImageOrder.
function ProductGallery({
  productId, companyId, label, images, editing, onChanged,
}: {
  productId: string;
  companyId: string;
  label: string;
  images: ProductImage[];
  editing: boolean;
  onChanged: () => void;
}) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false });
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLInputElement>(null);

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);
  // Re-measure when photos are added / removed / reordered.
  useEffect(() => { emblaApi?.reInit(); }, [emblaApi, images.length]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    await fn();
    setBusy(false);
    onChanged();
  }
  // Upload each file straight from the browser to the shop-media bucket (Storage
  // RLS scopes writes to this company's folder), then record only the paths via
  // a server action. The bytes never touch the server, so no body-size limit
  // applies. If recording the metadata fails, delete the just-uploaded objects
  // so we don't leave orphaned files behind.
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file
    if (files.length === 0) return;

    const tooBig = files.find((f) => f.size > MAX_IMAGE_BYTES);
    if (tooBig) { setError(`"${tooBig.name}" is over 10 MB.`); return; }
    const wrongType = files.find((f) => !ACCEPTED_IMAGE_TYPES.includes(f.type));
    if (wrongType) { setError(`"${wrongType.name}" must be JPG, PNG, or WebP.`); return; }

    setError(null);
    setBusy(true);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      for (const file of files) {
        const path = `${companyId}/products/${productId}-${crypto.randomUUID()}.${imageExt(file)}`;
        const { error: upErr } = await supabase.storage
          .from("shop-media")
          .upload(path, file, { contentType: file.type });
        if (upErr) throw new Error(upErr.message);
        uploaded.push(path);
      }
      const res = await addProductImageRecords(productId, uploaded);
      if ("error" in res) throw new Error(res.error);
    } catch (err) {
      if (uploaded.length > 0) await supabase.storage.from("shop-media").remove(uploaded);
      setError(err instanceof Error ? err.message : "Upload failed.");
      setBusy(false);
      return;
    }
    setBusy(false);
    onChanged();
  }
  // Delete the metadata row (server), then the file straight from the browser
  // (same client that uploaded it). Best-effort on the file — an orphan is
  // harmless; what we must avoid is a row pointing at a deleted file.
  async function remove(imageId: string) {
    setError(null);
    setBusy(true);
    const res = await removeProductImage(imageId);
    if ("error" in res) { setError(res.error); setBusy(false); return; }
    await createClient().storage.from("shop-media").remove([res.path]);
    setBusy(false);
    onChanged();
  }
  function move(idx: number, dir: -1 | 1) {
    const ids = images.map((im) => im.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    run(() => setProductImageOrder(productId, ids));
  }
  function makeCover(idx: number) {
    const ids = images.map((im) => im.id);
    const [picked] = ids.splice(idx, 1);
    ids.unshift(picked);
    run(() => setProductImageOrder(productId, ids));
  }

  const hasImages = images.length > 0;

  return (
    <div className="relative mt-2 p-1.5">
      {hasImages ? (
        <div className="relative">
          <div className="overflow-hidden rounded-xl" ref={emblaRef}>
            <div className="flex">
              {images.map((im) => (
                <div key={im.id} className="min-w-0 flex-[0_0_100%]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(im.path)} alt={label} className="aspect-[4/3] w-full object-cover" />
                </div>
              ))}
            </div>
          </div>
          {images.length > 1 && (
            <>
              <button
                type="button" aria-label="Previous photo" onClick={() => emblaApi?.scrollPrev()}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/55 p-1 text-white hover:bg-ink"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button" aria-label="Next photo" onClick={() => emblaApi?.scrollNext()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-ink/55 p-1 text-white hover:bg-ink"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                {images.map((im, i) => (
                  <button
                    key={im.id} type="button" aria-label={`Go to photo ${i + 1}`}
                    onClick={() => emblaApi?.scrollTo(i)}
                    className={`h-1.5 rounded-full transition-all ${i === selected ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-gradient-to-br from-rose-200 to-pink-400 text-xs font-semibold text-white/80">
          {label}
        </div>
      )}

      {editing && (
        <>
          <button
            type="button" onClick={() => addRef.current?.click()} disabled={busy}
            className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
            Add photos
          </button>
          <input
            ref={addRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={add}
          />
          {error && (
            <p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600">{error}</p>
          )}
          {hasImages && (
            <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
              {images.map((im, i) => (
                <div key={im.id} className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={mediaUrl(im.path)} alt=""
                    className={`h-14 w-14 rounded-lg object-cover ring-2 ${i === 0 ? "ring-brand" : "ring-white/60"}`}
                  />
                  {i === 0 && (
                    <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-lg bg-brand px-1 py-0.5 text-[8px] font-bold text-white">
                      Cover
                    </span>
                  )}
                  <div className="mt-0.5 flex items-center justify-center gap-0.5">
                    <button
                      type="button" aria-label="Move left" disabled={busy || i === 0} onClick={() => move(i, -1)}
                      className="rounded p-0.5 text-ink/60 hover:bg-white disabled:opacity-30"
                    >
                      <ChevronLeft size={12} />
                    </button>
                    {i !== 0 && (
                      <button
                        type="button" aria-label="Make cover" disabled={busy} onClick={() => makeCover(i)}
                        className="rounded p-0.5 text-ink/60 hover:bg-white"
                      >
                        <Star size={12} />
                      </button>
                    )}
                    <button
                      type="button" aria-label="Remove photo" disabled={busy}
                      onClick={() => remove(im.id)}
                      className="rounded p-0.5 text-rose-500 hover:bg-white disabled:opacity-30"
                    >
                      <X size={12} />
                    </button>
                    <button
                      type="button" aria-label="Move right" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)}
                      className="rounded p-0.5 text-ink/60 hover:bg-white disabled:opacity-30"
                    >
                      <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- product card (read + owner controls) ----------
function ProductCard({ p, companyId, editing, onChanged }: { p: ShopProduct; companyId: string; editing: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePrice() {
    setError(null);
    setBusy(true);
    const res = await setProductPricePublic(p.id, !p.price_public);
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    onChanged();
  }

  async function toggleVisible() {
    setError(null);
    setBusy(true);
    const res = await setProductProfileVisible(p.id, !p.profile_visible);
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    onChanged();
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-brand-soft/40 ring-1 ring-white/60">
      <div className="px-3 pt-3">
        <div className="font-bold text-brand-deep">{p.name}</div>
        {p.cultivar && <div className="text-sm text-ink/70">{p.cultivar}</div>}
        {p.local_code_pzn && <div className="text-[11px] text-ink/50">Code: PZN{p.local_code_pzn}</div>}
      </div>
      <div className="mt-2 flex justify-end gap-1.5 px-3">
        <button className="rounded-full bg-brand p-1.5 text-white"><Heart size={14} /></button>
        <button className="rounded-full bg-brand p-1.5 text-white"><ShoppingCart size={14} /></button>
      </div>
      <ProductGallery
        productId={p.id}
        companyId={companyId}
        label={p.cultivar ?? p.name}
        images={p.images}
        editing={editing}
        onChanged={onChanged}
      />
      <div className="flex items-center justify-between px-3 pb-3 text-sm">
        <span className="font-semibold text-ink">
          THC {p.thc_percent ?? "—"}% · CBD {p.cbd_percent ?? "—"}%
        </span>
        {editing ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={toggleVisible}
              disabled={busy}
              title="Show this product on your public Discover profile"
              className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold disabled:opacity-50 ${
                p.profile_visible
                  ? "bg-brand text-white hover:bg-brand-deep"
                  : "bg-white/70 text-ink/60 hover:bg-white"
              }`}
            >
              <Store size={13} />
              {p.profile_visible ? "On profile" : "Off profile"}
            </button>
            <button
              type="button"
              onClick={togglePrice}
              disabled={busy || !p.profile_visible}
              title={
                p.profile_visible
                  ? 'Show the price (vs "Request pricing")'
                  : "Put the product on your profile first"
              }
              className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-brand-deep hover:bg-white disabled:opacity-40"
            >
              {p.price_public ? <Eye size={13} /> : <EyeOff size={13} />}
              {p.price_public ? "Price public" : "Price hidden"}
            </button>
          </div>
        ) : p.price_public && p.price_per_gram != null ? (
          <span className="font-bold text-brand-deep">{eur(p.price_per_gram)}/g</span>
        ) : (
          <button className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-brand-deep hover:bg-white">
            Request pricing
          </button>
        )}
      </div>
      {error && (
        <p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-600 mx-3 mb-3">{error}</p>
      )}
    </div>
  );
}

function EmptyShop({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass mt-2 flex flex-1 flex-col items-center justify-center rounded-3xl p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft/50 text-brand-deep">
        <UploadCloud size={30} />
      </div>
      <h2 className="text-xl font-bold text-ink">Your shop is empty</h2>
      <p className="mt-1 max-w-sm text-sm text-ink/55">
        Upload your product list as a CSV, or add a product manually. Then attach photos and your shop goes live.
      </p>
      <div className="mt-5 flex gap-2">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-deep"
        >
          <FileSpreadsheet size={16} /> Upload product CSV
        </button>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-5 py-2.5 text-sm font-bold text-ink/75 hover:bg-white"
        >
          <Plus size={16} /> Add manually
        </button>
      </div>
    </div>
  );
}
