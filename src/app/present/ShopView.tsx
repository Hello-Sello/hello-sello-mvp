"use client";

/**
 * The seller storefront (visitor view), wired to real data. Design = the locked
 * prototype: LinkedIn-style cover + 3 profile cards + dominance filters + the
 * dual-pane product card grid. Owner edit mode + the add-products drawer land in
 * the next chunk; this renders the read-only shop and the empty first-run state.
 */
import { useState } from "react";
import { Heart, ShoppingCart, Link2, Lock, MapPin, UploadCloud, Plus, FileSpreadsheet } from "lucide-react";
import type { Shop, ShopProduct } from "@/modules/catalog/shop";

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
  const [dom, setDom] = useState("All");

  const cover = company.cover_path ? mediaUrl(company.cover_path) : null;
  const logo = company.logo_path ? mediaUrl(company.logo_path) : null;
  const hq = company.address || company.country || "—";

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto pb-6">
      {/* Cover + logo */}
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

      {/* Profile cards */}
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

      {products.length === 0 ? (
        <EmptyShop />
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
              .map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </>
      )}
    </div>
  );
}

function ProductCard({ p }: { p: ShopProduct }) {
  const img = p.image_path ? mediaUrl(p.image_path) : null;
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
      <div className="mt-2 p-1.5">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt={p.name} className="aspect-square w-full rounded-xl object-cover" />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-gradient-to-br from-rose-200 to-pink-400 text-xs font-semibold text-white/80">
            {p.cultivar ?? "No photo"}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 pb-3 text-sm">
        <span className="font-semibold text-ink">
          THC {p.thc_percent ?? "—"}% · CBD {p.cbd_percent ?? "—"}%
        </span>
        {p.price_public && p.price_per_gram != null ? (
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

function EmptyShop() {
  return (
    <div className="glass mt-2 flex flex-1 flex-col items-center justify-center rounded-3xl p-12 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft/50 text-brand-deep">
        <UploadCloud size={30} />
      </div>
      <h2 className="text-xl font-bold text-ink">Your shop is empty</h2>
      <p className="mt-1 max-w-sm text-sm text-ink/55">
        Upload your product list as a CSV, or add a product manually. Then attach photos and your shop goes live.
      </p>
      <div className="mt-5 flex gap-2 opacity-60">
        <span className="flex items-center gap-1.5 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">
          <FileSpreadsheet size={16} /> Upload product CSV
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-white/70 px-5 py-2.5 text-sm font-bold text-ink/75">
          <Plus size={16} /> Add manually
        </span>
      </div>
      <p className="mt-3 text-xs text-ink/40">(Manage-shop tools land in the next build step.)</p>
    </div>
  );
}
