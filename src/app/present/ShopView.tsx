"use client";

/**
 * The seller storefront, with an owner edit mode. /present is always the caller's
 * OWN shop (getMyShop), so "Manage shop" is always available here; the visitor
 * view (/present/[companyId]) comes later. Products render as the redesigned
 * square 4-up grid, grouped under a per-location divider header, with a location
 * dropdown that re-contexts the grid to one location. The card itself is the
 * reusable ProductCard from the catalog module.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2, UploadCloud, Plus, FileSpreadsheet, Pencil, Check,
  ImagePlus, Loader2, Globe, Trash2, ArrowLeft, MapPin, ChevronDown,
} from "lucide-react";
import { ProductCard, LocationGroup } from "@/modules/catalog";
import type { Shop, ShopLink } from "@/modules/catalog";
import { updateShopProfile } from "@/modules/catalog/manage";
import { createClient } from "@/shared/db/client";
import { AddProductsDrawer } from "./AddProductsDrawer";
import { filterByLocation, groupByLocation } from "./locationFilter";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
// Cover/logo now live at a STABLE path (overwritten in place, never orphaned), so
// their URL no longer changes on edit. Pass the company's `updated_at` as a `?v=`
// nonce to bust the browser cache after a swap.
const mediaUrl = (path: string, version?: string | null) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}${
    version ? `?v=${new Date(version).getTime()}` : ""
  }`;

// Client-side guards for direct-to-storage uploads. These mirror the bucket's
// own limits (the real enforcement lives in the shop-media bucket config); the
// checks here just give a friendly message before we attempt the upload.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket limit
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const TAG_LABEL: Record<string, string> = {
  wholesaler: "Wholesaler",
  distributor: "Distributor",
  importer: "Importer",
  cultivator: "Cultivator",
  pharmacy: "Pharmacy",
};
const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

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

import type { CompanyProfile } from "@/modules/companies";
import { BrandingEditForm } from "./BrandingEditForm";

export function ShopView({ shop, company: companyProfile }: { shop: Shop; company: CompanyProfile | null }) {
  const { company, products } = shop;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Active location tab. "All" shows every location group; a named location
  // re-contexts the grid to that one group.
  const [loc, setLoc] = useState("All");

  // The location groups to render for the active tab (already square + 4-up
  // inside each LocationGroup). Grouping is pure — see ./locationFilter.
  const visibleGroups = groupByLocation(filterByLocation(products, loc));

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
          companyProfile={companyProfile}
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
          <LocationTabs products={products} active={loc} onSelect={setLoc} />
          {visibleGroups.map((g) => (
            <LocationGroup key={g.location} location={g.location} count={g.products.length} editing={editing}>
              {g.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  companyId={company.id}
                  editing={editing}
                  onChanged={() => router.refresh()}
                />
              ))}
            </LocationGroup>
          ))}
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

// ---------- location dropdown ----------
// Re-contexts the grid to one location. "All" shows every group; a named location
// shows only its own. Counts come from the pure filterByLocation helper.
function LocationTabs({
  products, active, onSelect,
}: {
  products: Shop["products"];
  active: string;
  onSelect: (loc: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // Distinct named locations, first-seen order; "All" always leads.
  const named = products.reduce<string[]>((acc, p) => {
    if (p.location && !acc.includes(p.location)) acc.push(p.location);
    return acc;
  }, []);
  const options = ["All", ...named];
  const count = (loc: string) => filterByLocation(products, loc).length;

  return (
    <div className="relative w-fit">
      <button
        type="button"
        data-testid="location-menu-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-semibold text-ink/80 hover:bg-white"
      >
        <MapPin size={15} className="text-brand" />
        {active === "All" ? "All locations" : active}
        <ChevronDown size={15} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-1.5 min-w-[220px] rounded-2xl bg-white p-1.5 shadow-lg ring-1 ring-ink/5"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-ink/40">
            Shop location
          </div>
          {options.map((o) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={active === o}
              data-testid="location-option"
              data-loc={o}
              onClick={() => { onSelect(o); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium ${
                active === o ? "bg-brand/5 text-brand-deep" : "text-ink hover:bg-brand/[0.04]"
              }`}
            >
              <span className="flex-1 text-left">{o === "All" ? "All locations" : o}</span>
              <span className="text-xs text-ink-muted">{count(o)}</span>
            </button>
          ))}
        </div>
      )}
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
// ProfileEditor is split into two sections:
//   1. Cover banner (updateShopProfile — ShopView's own writer for cover_path + links)
//   2. BrandingEditForm (saveCompanyProfile — the one writer for logo + city + text fields)
function ProfileEditor({
  company, companyProfile, onSaved, onCancel,
}: {
  company: Shop["company"];
  companyProfile: CompanyProfile | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

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

  const touch = () => setDirty(true);
  const pickCover = (f: File) => { setCover(f); touch(); };

  function cancel() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onCancel();
  }

  // Upload cover straight to storage (client-direct). Stable filename
  // (${id}/cover) + upsert — overwrites in place, no orphans.
  async function uploadCover(file: File | null): Promise<{ path?: string; error?: string }> {
    if (!file) return {};
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WebP image." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be under 10 MB." };
    const path = `${company.id}/cover`;
    const { error } = await createClient().storage
      .from("shop-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    return error ? { error: `cover upload failed: ${error.message}` } : { path };
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);

    const c = await uploadCover(cover);
    if (c.error) { setError(c.error); setBusy(false); return; }

    const fd = new FormData(form);
    if (c.path) fd.set("cover_path", c.path);
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
    <div className="space-y-6">
      {/* -- Cover banner (ShopView's writer: cover_path + company name + links) -- */}
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
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save cover &amp; links
          </button>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="relative">
          <div
            className="h-44 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-green-700 to-lime-600 bg-cover bg-center"
            style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
          />
          <ImagePicker label="Change cover" onPick={pickCover} className="absolute right-3 top-3" />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink/70">Company name *</span>
            <input name="name" required defaultValue={company.name} className={input} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink/70">Warehouse location</span>
            <input name="warehouse_location" defaultValue={company.warehouse_location ?? ""} className={input} />
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

      {/* -- Branding (logo + city + text) — shared form, writes via saveCompanyProfile -- */}
      {companyProfile && (
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Logo &amp; branding</h3>
          <BrandingEditForm
            company={companyProfile}
            onDirty={() => {/* branding form manages its own dirty state */}}
            onSaved={onSaved}
          />
        </div>
      )}
    </div>
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
