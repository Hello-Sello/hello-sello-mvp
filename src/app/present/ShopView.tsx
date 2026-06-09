"use client";

/**
 * The seller storefront, with an owner edit mode. /present is always the caller's
 * OWN shop (getMyShop), so "Manage shop" is always available here; the visitor
 * view (/present/[companyId]) comes later. Read layout = the locked prototype
 * (cover + 3 profile cards + dominance filters + product grid). Edit mode swaps
 * the profile cards for a form and reveals per-product controls (photo, price
 * visibility); products are added through the drawer.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Heart, ShoppingCart, Link2, UploadCloud, Plus, FileSpreadsheet,
  Pencil, Check, ImagePlus, Loader2, Eye, EyeOff,
} from "lucide-react";
import type { Shop, ShopProduct } from "@/modules/catalog/shop";
import { updateShopProfile, setProductImage, setProductPricePublic } from "@/modules/catalog/manage";
import { AddProductsDrawer } from "./AddProductsDrawer";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

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

export function ShopView({ shop }: { shop: Shop }) {
  const { company, products } = shop;
  const router = useRouter();
  const [dom, setDom] = useState("All");
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto pb-6">
      {/* Owner action bar */}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep"
        >
          <Plus size={16} /> Add products
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink/75 hover:bg-white"
        >
          {editing ? <><Check size={16} /> Done</> : <><Pencil size={16} /> Manage shop</>}
        </button>
      </div>

      {editing ? (
        <ProfileEditor company={company} onSaved={() => { setEditing(false); router.refresh(); }} />
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
                <ProductCard key={p.id} p={p} editing={editing} onChanged={() => router.refresh()} />
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
  const cover = company.cover_path ? mediaUrl(company.cover_path) : null;
  const logo = company.logo_path ? mediaUrl(company.logo_path) : null;
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
          {company.website ? (
            <a href={company.website} target="_blank" rel="noreferrer"
               className="flex items-center gap-2 font-bold text-ink hover:text-brand">
              <Link2 size={16} /> Website
            </a>
          ) : (
            <span className="text-sm text-ink/40">No links yet</span>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- profile: edit ----------
function ProfileEditor({ company, onSaved }: { company: Shop["company"]; onSaved: () => void }) {
  const [cover, setCover] = useState<File | null>(null);
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const coverUrl = cover ? URL.createObjectURL(cover) : company.cover_path ? mediaUrl(company.cover_path) : null;
  const logoUrl = logo ? URL.createObjectURL(logo) : company.logo_path ? mediaUrl(company.logo_path) : null;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (cover) fd.set("cover", cover);
    if (logo) fd.set("logo", logo);
    const res = await updateShopProfile(fd);
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    onSaved();
  }

  const input = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-brand focus:outline-none";

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="relative">
        <div
          className="h-44 w-full overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900 via-green-700 to-lime-600 bg-cover bg-center"
          style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        />
        <ImagePicker label="Change cover" onPick={setCover} className="absolute right-3 top-3" />
        <div className="absolute -bottom-6 left-6 flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-ink text-white shadow-lg">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl">❀</span>
          )}
          <ImagePicker label="" onPick={setLogo} className="absolute bottom-1 right-1" />
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
        <label className="block lg:col-span-2">
          <span className="text-xs font-semibold text-ink/70">Website</span>
          <input name="website" type="url" defaultValue={company.website ?? ""} className={input} placeholder="https://…" />
        </label>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save profile
      </button>
    </form>
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

// ---------- product card (read + owner controls) ----------
function ProductCard({ p, editing, onChanged }: { p: ShopProduct; editing: boolean; onChanged: () => void }) {
  const img = p.image_path ? mediaUrl(p.image_path) : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("image", file);
    await setProductImage(p.id, fd);
    setBusy(false);
    onChanged();
  }

  async function togglePrice() {
    setBusy(true);
    await setProductPricePublic(p.id, !p.price_public);
    setBusy(false);
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
      <div className="relative mt-2 p-1.5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} className="aspect-square w-full rounded-xl object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-rose-200 to-pink-400 text-xs font-semibold text-white/80">
            {p.cultivar ?? "No photo"}
          </div>
        )}
        {editing && (
          <>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink disabled:opacity-50"
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
              {img ? "Replace" : "Add photo"}
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={uploadImage} />
          </>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-3 text-sm">
        <span className="font-semibold text-ink">
          THC {p.thc_percent ?? "—"}% · CBD {p.cbd_percent ?? "—"}%
        </span>
        {editing ? (
          <button
            type="button"
            onClick={togglePrice}
            disabled={busy}
            className="flex items-center gap-1 rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-brand-deep hover:bg-white disabled:opacity-50"
          >
            {p.price_public ? <Eye size={13} /> : <EyeOff size={13} />}
            {p.price_public ? "Price public" : "Price hidden"}
          </button>
        ) : p.price_public && p.price_per_gram != null ? (
          <span className="font-bold text-brand-deep">{eur(p.price_per_gram)}/g</span>
        ) : (
          <button className="rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-brand-deep hover:bg-white">
            Request pricing
          </button>
        )}
      </div>
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
