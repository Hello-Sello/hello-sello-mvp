"use client";

/**
 * Shared branding-edit form (D-09). Mounted in BOTH:
 *   - AccountClient.tsx → Company tab (edit door 1)
 *   - ShopView.tsx → edit drawer (edit door 2)
 *
 * Both doors call the same `saveCompanyProfile` server action, which writes
 * through the single `companies.updateCompanyProfile` writer (D-07). This
 * ensures one DB row, one writer, and no F3-style drift between doors.
 *
 * Logo bytes upload client-direct to shop-media (dodges the 1 MB Server-Action
 * body cap). Only the resulting path string crosses into the server action.
 * Cover (shop banner) is Phase 7's concern and is NOT handled here.
 */

import { useRef, useState } from "react";
import { Building2, Globe, MapPin, Tag, ImagePlus, Check, Loader2 } from "lucide-react";
import { createClient } from "@/shared/db/client";
import { saveCompanyProfile } from "@/app/account/actions";
import type { CompanyProfile } from "@/modules/companies";

const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

type BrandingFields = {
  logoPath: string;
  city: string;
  tagline: string;
  website: string;
  address: string;
  description: string;
  primaryProducts: string;
};

function initFields(company: CompanyProfile): BrandingFields {
  return {
    logoPath: company.logoPath ?? "",
    city: company.city ?? "",
    tagline: company.tagline ?? "",
    website: company.website ?? "",
    address: company.address ?? "",
    description: company.description ?? "",
    primaryProducts: company.primaryProducts ?? "",
  };
}

/** Initials fallback badge (mirrors DiscoverDirectory Logo pattern). */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function BrandingEditForm({
  company,
  onDirty,
  onSaved,
}: {
  company: CompanyProfile;
  onDirty: (d: boolean) => void;
  onSaved?: () => void;
}) {
  const initial = initFields(company);
  const [base, setBase] = useState(initial);
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Derive the preview URL: if we've uploaded a new logo this session, use the
  // public URL for the stable path (same pattern as Discover/TopBar resolve).
  const logoPreviewUrl = f.logoPath
    ? createClient().storage.from("shop-media").getPublicUrl(f.logoPath).data.publicUrl
    : null;

  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  function set<K extends keyof BrandingFields>(k: K, v: BrandingFields[K]) {
    setF((s) => ({ ...s, [k]: v }));
    setSaved(false);
    onDirty(JSON.stringify({ ...f, [k]: v }) !== JSON.stringify(base));
  }

  // Upload logo bytes client-direct (avoids the 1 MB Server-Action body cap).
  // Stable path `${companyId}/logo` + upsert → overwrites in place, no orphans.
  async function uploadLogo(file: File): Promise<string | null> {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Use a JPG, PNG or WebP image.");
      return null;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be under 10 MB.");
      return null;
    }
    const path = `${company.id}/logo`;
    const { error: uploadError } = await createClient()
      .storage.from("shop-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      setError(`Logo upload failed: ${uploadError.message}`);
      return null;
    }
    return path;
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const path = await uploadLogo(file);
    if (path) set("logoPath", path);
    // Reset input so the same file can be re-picked if the user changes their mind.
    e.target.value = "";
  }

  async function save() {
    setBusy(true);
    setError(null);
    const r = await saveCompanyProfile({
      logoPath: f.logoPath || undefined,
      city: f.city,
      tagline: f.tagline,
      website: f.website,
      address: f.address,
      description: f.description,
      primaryProducts: f.primaryProducts,
    });
    setBusy(false);
    if (r.error) return setError(r.error);
    setBase(f);
    setSaved(true);
    onDirty(false);
    onSaved?.();
  }

  const inputCls =
    "w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft";

  return (
    <div className="space-y-5">
      {/* Logo upload */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => logoRef.current?.click()}
          className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-soft/30 text-brand shadow-sm transition hover:bg-brand-soft/50"
          title="Change company logo"
        >
          {logoPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreviewUrl} alt="Company logo" className="h-full w-full object-cover" />
          ) : (
            <span className="text-2xl font-bold">{initials(company.name)}</span>
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-white opacity-0 transition group-hover:bg-ink/55 group-hover:opacity-100">
            <ImagePlus size={16} />
            {logoPreviewUrl ? "Change" : "Add logo"}
          </span>
        </button>
        <input
          ref={logoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onLogoChange}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{company.name}</p>
          <p className="text-xs text-ink-muted">Click the logo to change it.</p>
          <p className="text-xs text-ink-muted">JPG, PNG or WebP — max 10 MB.</p>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <MapPin size={13} /> City
          </span>
          <input
            value={f.city}
            onChange={(e) => set("city", e.target.value)}
            placeholder="Berlin"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Building2 size={13} /> Tagline
          </span>
          <input
            value={f.tagline}
            onChange={(e) => set("tagline", e.target.value)}
            placeholder="Medical cannabis distribution…"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Globe size={13} /> Website
          </span>
          <input
            value={f.website}
            type="url"
            onChange={(e) => set("website", e.target.value)}
            placeholder="https://yoursite.com"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <MapPin size={13} /> Address
          </span>
          <input
            value={f.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder="Musterstraße 1, 10115 Berlin"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
            <Tag size={13} /> Primary products
          </span>
          <input
            value={f.primaryProducts}
            onChange={(e) => set("primaryProducts", e.target.value)}
            placeholder="Flowers, extracts…"
            className={inputCls}
          />
        </label>
        <label className="col-span-full flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold text-ink-muted">Description</span>
          <textarea
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </label>
      </div>

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3 border-t border-white/60 pt-4">
        {error && <span className="mr-auto text-sm text-danger">{error}</span>}
        {saved && !dirty && (
          <span className="mr-auto inline-flex items-center gap-1 text-sm text-success">
            <Check size={15} /> Saved
          </span>
        )}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? (
            <span className="flex items-center gap-1.5">
              <Loader2 size={14} className="animate-spin" /> Saving…
            </span>
          ) : (
            "Save changes"
          )}
        </button>
      </div>
    </div>
  );
}
