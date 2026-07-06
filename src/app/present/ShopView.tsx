"use client";

/**
 * The seller storefront, with an owner edit mode. /present is always the caller's
 * OWN shop (getMyShop), so "Manage shop" is always available here; the visitor
 * view (/present/[companyId]) comes later. Products render as the redesigned
 * square 4-up grid, grouped under a per-location divider header, with a location
 * dropdown that re-contexts the grid to one location. The card itself is the
 * reusable ProductCard from the catalog module.
 *
 * The shop CHROME (07-05 + F-01) is fully in-place editable behind ONE "Manage
 * shop" entry: the whole surface takes a calm grey wash (data-edit), PresentBanner
 * (4:1 MVP banner, inline logo), an InfoBox row, and a sticky pulsing SaveBar. Any
 * banner/info/links change marks the shop dirty (pulsing the Save); Save commits
 * every chrome field — including the edited links — through the existing
 * updateShopProfile writer (no new manage.ts action, one links write). Logo/branding
 * stays behind the shared BrandingEditForm — the one logo writer (D-07). Editing
 * also exposes a "+ Add product" tile (opens the manual-add drawer) and a free-text
 * add-location that stages a group; empty location labels never persist.
 */
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Link2, UploadCloud, Plus, FileSpreadsheet, Globe, MapPin, ChevronDown, ChevronUp, X,
} from "lucide-react";
import { ProductCard, LocationGroup } from "@/modules/catalog";
import type { Shop, ShopLink } from "@/modules/catalog";
import { updateShopProfile } from "@/modules/catalog/manage";
import { createClient } from "@/shared/db/client";
import { AddProductsDrawer } from "./AddProductsDrawer";
import { PresentBanner } from "./PresentBanner";
import { SaveBar } from "./SaveBar";
import { InfoBox, DescriptionEditor } from "./InfoBox";
import { filterByLocation, groupByLocation, UNASSIGNED } from "./locationFilter";

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

// Present mode (D-07) renders the shop inside a self-contained full-window layer
// that COVERS the app chrome (IconRail + TopBar) — an in-app view that stays
// Zoom/Teams-shareable, NOT the OS Fullscreen API (which cuts off). Because the
// layer is opaque it must paint the same background as <body> to hide the chrome
// behind it; this mirrors the body rule in globals.css so no shared-file edit is
// needed (the plan's preferred self-contained approach).
const PAGE_BG =
  "radial-gradient(60rem 60rem at 10% -12%, rgba(255,183,213,0.55), transparent 60%)," +
  "radial-gradient(46rem 46rem at 108% 6%, rgba(227,11,93,0.10), transparent 55%)," +
  "linear-gradient(160deg, var(--bg-from) 0%, var(--bg-to) 100%)";

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

// The chrome fields the owner edits in place. These are exactly the text fields
// updateShopProfile persists as the shop banner + info. `links` is now editable
// here too (F-01): the edited array is sent on Save through the SAME
// updateShopProfile links write (no second writer). address/website are still
// round-tripped unchanged so the full-replace action never wipes them.
type ChromeEdits = {
  name: string;
  tagline: string;
  description: string;
  warehouse_location: string;
  links: ShopLink[];
};

function initEdits(c: Shop["company"]): ChromeEdits {
  return {
    name: c.name ?? "",
    tagline: c.tagline ?? "",
    description: c.description ?? "",
    warehouse_location: c.warehouse_location ?? "",
    links: c.links ?? [],
  };
}

export function ShopView({ shop, company: companyProfile }: { shop: Shop; company: CompanyProfile | null }) {
  const { company, products } = shop;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  // Present mode (D-07): an in-app UI state that hides the app chrome. NEVER the
  // OS Fullscreen API (no requestFullscreen anywhere in this surface).
  const [presenting, setPresenting] = useState(false);

  // In-place edit state (D-03). `edits` holds the live field values; `dirty` drives
  // the SaveBar pulse; `coverFile` is a picked-but-not-yet-uploaded banner image.
  const [edits, setEdits] = useState<ChromeEdits>(() => initEdits(company));
  const [dirty, setDirty] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active location tab. "All" shows every location group; a named location
  // re-contexts the grid to that one group.
  const [loc, setLoc] = useState("All");
  // Client-only custom order of the location sections in edit mode (drag a header
  // to reorder). Persisting a bespoke group order is Phase 16 (structured
  // locations own ordering), so this stays ephemeral.
  const [groupOrder, setGroupOrder] = useState<string[]>([]);
  // Free-text locations staged in edit mode (F-01). A staged label renders an
  // empty drop-target group; it only PERSISTS once a product is dragged into it
  // (setProductLocation). Empty groups never persist — this stays client-only and
  // resets on reload / leaving edit mode, so unfilled labels simply disappear.
  const [pendingLocations, setPendingLocations] = useState<string[]>([]);

  function addLocation(label: string) {
    const value = label.trim();
    if (!value) return; // empty labels do not persist (D-05 / Cluster D)
    // Skip if a real group or a staged label already carries it.
    if (products.some((p) => p.location === value)) return;
    setPendingLocations((prev) => (prev.includes(value) ? prev : [...prev, value]));
  }

  const updateEdit = <K extends keyof ChromeEdits>(k: K, v: ChromeEdits[K]) => {
    setEdits((e) => ({ ...e, [k]: v }));
    setDirty(true);
  };

  function enterEdit() {
    setEdits(initEdits(company));
    setCoverFile(null);
    setDirty(false);
    setError(null);
    setPendingLocations([]);
    setEditing(true);
  }

  function discard() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    setEditing(false);
    setBrandingOpen(false);
    setDirty(false);
    setCoverFile(null);
    setError(null);
    setPendingLocations([]);
  }

  // Present mode never carries edit mode (prototype: setPresent → setEdit(false)),
  // so entering it drops any in-progress edit without prompting — it is a view
  // toggle, not a destructive action, and the SaveBar only renders while editing.
  function enterPresent() {
    setEditing(false);
    setBrandingOpen(false);
    setDirty(false);
    setCoverFile(null);
    setError(null);
    setPendingLocations([]);
    setPresenting(true);
  }

  // ESC leaves present mode (matches the prototype + the Exit control). The
  // listener is attached only while presenting so it never shadows other ESC use.
  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPresenting(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [presenting]);

  // Client-direct cover upload to a STABLE path (upsert → no orphan); the action
  // records only the path string. Mirrors the retired ProfileEditor.uploadCover.
  async function uploadCover(file: File): Promise<{ path?: string; error?: string }> {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return { error: "Use a JPG, PNG or WebP image." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "Image must be under 10 MB." };
    const path = `${company.id}/cover`;
    const { error } = await createClient().storage
      .from("shop-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    return error ? { error: `cover upload failed: ${error.message}` } : { path };
  }

  async function save() {
    setBusy(true);
    setError(null);

    let coverPath: string | undefined;
    if (coverFile) {
      const c = await uploadCover(coverFile);
      if (c.error) { setError(c.error); setBusy(false); return; }
      coverPath = c.path;
    }

    // updateShopProfile is a full-replace writer: any field it reads and we omit is
    // nulled, and its links come solely from the form. We send the edited chrome
    // fields + the edited links array (F-01: links are now editable, committed
    // through this ONE links write / parseLinks). address/website are round-tripped
    // unchanged so the full-replace never wipes them.
    const fd = new FormData();
    fd.set("name", edits.name);
    fd.set("tagline", edits.tagline);
    fd.set("description", edits.description);
    fd.set("warehouse_location", edits.warehouse_location);
    fd.set("address", company.address ?? "");
    fd.set("website", company.website ?? "");
    fd.set("links", JSON.stringify(edits.links));
    if (coverPath) fd.set("cover_path", coverPath);

    const res = await updateShopProfile(fd);
    setBusy(false);
    if ("error" in res) { setError(res.error); return; }
    setEditing(false);
    setBrandingOpen(false);
    setDirty(false);
    setCoverFile(null);
    setPendingLocations([]);
    router.refresh();
  }

  const coverUrl = coverFile
    ? URL.createObjectURL(coverFile)
    : company.cover_path
    ? mediaUrl(company.cover_path, company.updated_at)
    : null;
  const logoUrl = company.logo_path ? mediaUrl(company.logo_path, company.updated_at) : null;

  // The location groups to render for the active tab (already square + 4-up
  // inside each LocationGroup). Grouping is pure — see ./locationFilter.
  const visibleGroups = groupByLocation(filterByLocation(products, loc));
  const orderedGroups =
    groupOrder.length === 0
      ? visibleGroups
      : [...visibleGroups].sort(
          (a, b) =>
            (groupOrder.indexOf(a.location) + 1 || 999) -
            (groupOrder.indexOf(b.location) + 1 || 999),
        );

  // Staged (empty) location groups render as drop targets while editing so the
  // seller can drag products into a freshly-typed location. They carry no products
  // yet, so they never persist — a group becomes real only once a product is
  // assigned (setProductLocation on drop). Hidden under a specific location tab
  // that isn't the staged label.
  const pendingGroups = editing
    ? pendingLocations
        .filter((l) => loc === "All" || loc === l)
        .filter((l) => !orderedGroups.some((g) => g.location === l))
        .map((l) => ({ location: l, products: [] as Shop["products"] }))
    : [];
  const renderGroups = [...orderedGroups, ...pendingGroups];

  function reorderGroups(from: string, to: string) {
    const current = orderedGroups.map((g) => g.location);
    const fromIdx = current.indexOf(from);
    const toIdx = current.indexOf(to);
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
    current.splice(toIdx, 0, current.splice(fromIdx, 1)[0]);
    setGroupOrder(current);
  }

  const surface = (
    <>
      {/* Sticky pulsing Save appears only while editing; "Manage shop" / "+Add
          products" / "Present mode" live in the banner below. (Never both edit
          and present at once — enterPresent() clears edit mode.) */}
      {editing && (
        <SaveBar dirty={dirty} busy={busy} error={error} onSave={save} onDiscard={discard} />
      )}

      <PresentBanner
        companyName={company.name}
        coverUrl={coverUrl}
        logoUrl={logoUrl}
        editing={editing}
        presenting={presenting}
        name={editing ? edits.name : company.name}
        tagline={editing ? edits.tagline : company.tagline ?? ""}
        onNameChange={(v) => updateEdit("name", v)}
        onTaglineChange={(v) => updateEdit("tagline", v)}
        onPickCover={(f) => { setCoverFile(f); setDirty(true); }}
        onAddProducts={() => setDrawerOpen(true)}
        onManage={enterEdit}
        onEditLogo={() => setBrandingOpen((v) => !v)}
        onPresent={enterPresent}
      />

      <ShopInfoRow
        company={company}
        editing={editing}
        edits={edits}
        onEdit={updateEdit}
      />

      {/* Logo & branding — the shared one-writer form (D-07), opened by clicking
          the inline logo tile in edit mode (F-01; no separate branding button). */}
      {editing && brandingOpen && companyProfile && (
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-4 text-sm font-bold text-ink">Logo &amp; branding</h3>
          <BrandingEditForm
            company={companyProfile}
            onDirty={() => {/* branding form owns its own dirty state + Save */}}
            onSaved={() => { setBrandingOpen(false); router.refresh(); }}
          />
        </div>
      )}

      {products.length === 0 ? (
        <EmptyShop onAdd={() => setDrawerOpen(true)} />
      ) : (
        <>
          <LocationTabs products={products} active={loc} onSelect={setLoc} />
          {renderGroups.map((g) => (
            <LocationGroup
              key={g.location}
              location={g.location}
              targetLocation={g.location === UNASSIGNED ? null : g.location}
              count={g.products.length}
              editing={editing}
              onChanged={() => router.refresh()}
              onReorder={reorderGroups}
            >
              {g.products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  companyId={company.id}
                  editing={editing}
                  onChanged={() => router.refresh()}
                />
              ))}
              {/* "+ Add product" tile — edit mode only. Opens the EXISTING manual-add
                  drawer (one validation authority); it does not create a product
                  itself. New products land unassigned + draggable into this group. */}
              {editing && (
                <AddProductTile
                  location={g.location === UNASSIGNED ? null : g.location}
                  onClick={() => setDrawerOpen(true)}
                />
              )}
            </LocationGroup>
          ))}
          {editing && <AddLocationInput onAdd={addLocation} />}
        </>
      )}

      <AddProductsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onImported={() => { setDrawerOpen(false); router.refresh(); }}
      />
    </>
  );

  // Present mode wraps the same surface in a fixed full-window layer that covers
  // the app chrome (below drawers/modals at z-50). An Exit control + ESC restore
  // normal chrome. The fade-in is gated behind prefers-reduced-motion.
  if (presenting) {
    return (
      <div
        data-testid="present-layer"
        className="present-layer fixed inset-0 z-40 overflow-auto"
        style={{ background: PAGE_BG }}
      >
        <style jsx>{`
          @media (prefers-reduced-motion: no-preference) {
            .present-layer {
              animation: presentIn 0.18s ease-out both;
            }
          }
          @keyframes presentIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        `}</style>
        <button
          type="button"
          data-testid="exit-present"
          onClick={() => setPresenting(false)}
          className="fixed right-4 top-4 z-50 flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white shadow-lg hover:bg-brand-deep"
        >
          <X size={16} /> Exit present
        </button>
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-6 py-6 sm:px-8">
          {surface}
        </div>
      </div>
    );
  }

  // The whole-page edit context (F-01): `data-edit` drives a calm grey wash over
  // the entire surface while editing — a background tint only (no image filters),
  // so scroll stays smooth. `dirty`/`save()`/`discard()` remain the single spine
  // F-02 extends its inline field edits into.
  return (
    <div
      data-testid="shop-surface"
      data-edit={editing ? "on" : "off"}
      className={`flex h-full flex-col gap-2.5 overflow-auto pb-6 transition-colors ${
        editing ? "rounded-2xl bg-ink/[0.045]" : ""
      }`}
    >
      {surface}
    </div>
  );
}

// ---------- info boxes ----------
// The equal-height storefront info row: About (description, 2600-cap edit),
// Location (HQ + single warehouse line, editable), Links (display only — Phase 16
// owns per-shop link management). Each box expands over the grid (InfoBox owns the
// stacking-context + click-away bug fixes).
function ShopInfoRow({
  company, editing, edits, onEdit,
}: {
  company: Shop["company"];
  editing: boolean;
  edits: ChromeEdits;
  onEdit: <K extends keyof ChromeEdits>(k: K, v: ChromeEdits[K]) => void;
}) {
  const hq = company.address || company.country || "—";
  const tagRows =
    company.tags.length > 0
      ? company.tags.map((t) => (
          <span key={t} className="font-bold text-ink">#{TAG_LABEL[t] ?? titleCase(t)}</span>
        ))
      : <span className="text-sm text-ink/40">No tags yet</span>;

  const links = (
    <div className="flex flex-col gap-2">
      {company.website && <LinkRow icon={<Globe size={16} />} label="Website" url={company.website} />}
      {company.links.map((l, i) => (
        <LinkRow key={i} icon={linkIcon(l.platform)} label={linkLabel(l)} url={linkHref(l)} />
      ))}
    </div>
  );
  const hasAnyLink = Boolean(company.website) || company.links.length > 0;

  return (
    <div className="grid grid-cols-1 items-stretch gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
      {/* About + description */}
      <InfoBox
        testId="info-card-about"
        title={editing ? edits.name : company.name}
        preview={
          editing ? (
            <DescriptionEditor value={edits.description} onChange={(v) => onEdit("description", v)} />
          ) : company.description ? (
            <p className="line-clamp-4 text-sm leading-relaxed text-ink/70">“{company.description}”</p>
          ) : (
            <span className="text-sm text-ink/40">No description yet</span>
          )
        }
        more={
          !editing && company.description ? (
            <p className="text-sm leading-relaxed text-ink/75">“{company.description}”</p>
          ) : undefined
        }
      />

      {/* Location: HQ + single warehouse line (D-05 — one line; multi-warehouse is Phase 16) */}
      <InfoBox
        testId="info-card-warehouse"
        title="Location"
        preview={
          <div className="space-y-2 text-sm">
            <div className="flex flex-col gap-0.5">{tagRows}</div>
            <div>
              <div className="font-bold text-ink">Headquarter:</div>
              <div className="text-ink/70">{hq}</div>
            </div>
          </div>
        }
        more={
          <div className="text-sm">
            <div className="font-bold text-ink">Warehouse:</div>
            {editing ? (
              <input
                aria-label="Warehouse location"
                value={edits.warehouse_location}
                onChange={(e) => onEdit("warehouse_location", e.target.value)}
                placeholder="e.g. Berlin"
                className="mt-1 w-full rounded-lg border border-ink/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
            ) : (
              <div className="text-ink/70">{company.warehouse_location || "Not set"}</div>
            )}
          </div>
        }
      />

      {/* Links — editable in edit mode (F-01: add / remove / reorder custom links,
          committed via the ONE updateShopProfile links write). Display-only when
          not editing. Per-country-shop link scoping is Phase 16 / DEV-112. */}
      <InfoBox
        testId="info-card-links"
        title="Links"
        preview={
          editing ? (
            <LinksEditor links={edits.links} onChange={(next) => onEdit("links", next)} />
          ) : hasAnyLink ? (
            links
          ) : (
            <span className="text-sm text-ink/40">No links yet</span>
          )
        }
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

// ---------- link display helpers (shared by the Links InfoBox) ----------
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

// ---------- links editor (edit mode) ----------
// Add / remove / reorder custom links over a local edits.links array. Every change
// flows back through onChange → edits.links, marking the shop dirty; Save sends the
// whole array through the ONE updateShopProfile links write (parseLinks validates +
// normalizes handles). No second links writer.
const LINK_TYPE_OPTIONS: { value: ShopLink["platform"]; label: string }[] = [
  { value: "linkedin", label: "LinkedIn" },
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X" },
  { value: "custom", label: "Custom" },
];

function LinksEditor({
  links,
  onChange,
}: {
  links: ShopLink[];
  onChange: (next: ShopLink[]) => void;
}) {
  const [platform, setPlatform] = useState<ShopLink["platform"]>("linkedin");
  const [value, setValue] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  function add() {
    const v = value.trim();
    if (!v) return; // empty links are dropped (parseLinks would drop them anyway)
    const link: ShopLink = {
      platform,
      value: v,
      ...(platform === "custom" && customLabel.trim() ? { label: customLabel.trim() } : {}),
    };
    onChange([...links, link]);
    setValue("");
    setCustomLabel("");
  }
  function remove(i: number) {
    onChange(links.filter((_, idx) => idx !== i));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= links.length) return;
    const next = [...links];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  const field =
    "rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-xs outline-none focus:border-brand";

  return (
    <div className="flex flex-col gap-2">
      {links.length === 0 && <span className="text-sm text-ink/40">No links yet</span>}
      {links.map((l, i) => (
        <div key={i} className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2.5 py-1.5">
          <span className="text-ink">{linkIcon(l.platform)}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{linkLabel(l)}</span>
          <button
            type="button" aria-label="Move link up" onClick={() => move(i, -1)} disabled={i === 0}
            className="rounded p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-30"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button" aria-label="Move link down" onClick={() => move(i, 1)}
            disabled={i === links.length - 1}
            className="rounded p-1 text-ink/50 hover:bg-ink/5 disabled:opacity-30"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button" aria-label="Remove link" onClick={() => remove(i)}
            className="rounded p-1 text-rose-500 hover:bg-rose-50"
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Link type"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as ShopLink["platform"])}
          className={`${field} font-semibold`}
        >
          {LINK_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {platform === "custom" && (
          <input
            aria-label="Custom link name"
            value={customLabel}
            placeholder="Name"
            onChange={(e) => setCustomLabel(e.target.value)}
            className={`${field} w-24`}
          />
        )}
        <input
          aria-label="Link URL or handle"
          value={value}
          placeholder="handle or URL"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className={`${field} min-w-0 flex-1`}
        />
        <button
          type="button"
          data-testid="add-link-btn"
          aria-label="Add link"
          onClick={add}
          className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white hover:bg-brand-deep"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

// ---------- add-product tile (edit mode) ----------
// A grid cell that opens the EXISTING manual-add drawer (one validation authority);
// it never creates a product itself. Shown per location group while editing.
function AddProductTile({ location, onClick }: { location: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      data-testid="add-product-tile"
      onClick={onClick}
      className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/20 bg-brand/[0.03] p-6 text-sm font-bold text-brand-deep transition hover:border-brand hover:bg-brand/[0.06]"
    >
      <span className="grid h-11 w-11 place-items-center rounded-full bg-brand text-white">
        <Plus size={22} />
      </span>
      Add product
      {location && <span className="text-xs font-medium text-ink/50">to {location}</span>}
    </button>
  );
}

// ---------- add-location input (edit mode) ----------
// Type a free-text location label to STAGE a group. The staged group persists only
// once a product is dragged into it (setProductLocation); empty labels never persist.
function AddLocationInput({ onAdd }: { onAdd: (label: string) => void }) {
  const [value, setValue] = useState("");
  function submit() {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue("");
  }
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-ink/20 bg-white/50 px-3.5 py-2.5">
      <MapPin size={16} className="text-brand" />
      <input
        data-testid="add-location-input"
        aria-label="Add a location"
        value={value}
        placeholder="Add a location / shop (e.g. Vienna, AT)"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink/40"
      />
      <button
        type="button"
        data-testid="add-location-btn"
        onClick={submit}
        className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white hover:bg-brand-deep"
      >
        Add
      </button>
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
