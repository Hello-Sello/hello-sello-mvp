"use client";

/**
 * The MVP shop banner (D-05). A LinkedIn-proportion 4:1 cover carrying the logo
 * tile + enlarged company name (h1) and sub-headline (tagline), with the
 * banner-mounted owner controls "+Add products", "Manage shop" and "Present mode"
 * shown ONLY when not editing.
 *
 * Unified edit model (F-01): "Manage shop" is the single edit entry — pink stays
 * reserved for the Save bar, so this is a calm white system button. In edit mode
 * the whole page enters a grey wash (owned by ShopView), the banner controls row
 * collapses, the name/tagline become in-place editable, "Change banner" uploads a
 * new cover (client-direct → cover_path), and the LOGO TILE ITSELF becomes the
 * inline edit affordance — clicking it opens the shared BrandingEditForm, the ONE
 * writer for the company logo (D-07 / D-REUSE-4). There is no longer a separate
 * "Edit logo & branding" button, and this component never writes the logo itself.
 *
 * DEV-117: the prototype's old full-width location strip element is intentionally
 * dropped here (not carried over).
 */
import { useRef } from "react";
import Link from "next/link";
import { Plus, Pencil, ImagePlus, ScreenShare } from "lucide-react";

export function PresentBanner({
  companyName,
  coverUrl,
  logoUrl,
  editing,
  presenting,
  name,
  tagline,
  onNameChange,
  onTaglineChange,
  onPickCover,
  onAddProducts,
  onManage,
  onEditLogo,
  onPresent,
}: {
  companyName: string;
  coverUrl: string | null;
  logoUrl: string | null;
  editing: boolean;
  presenting: boolean;
  name: string;
  tagline: string;
  onNameChange: (v: string) => void;
  onTaglineChange: (v: string) => void;
  onPickCover: (f: File) => void;
  onAddProducts: () => void;
  onManage: () => void;
  onEditLogo: () => void;
  onPresent: () => void;
}) {
  return (
    <section data-testid="present-banner" className="flex flex-col gap-2">
      {/* Banner-mounted owner controls, shown ONLY when not editing/presenting.
          "+Add products" opens the manual-add drawer; "Manage shop" is the single
          edit entry (the sticky SaveBar then owns Save/Exit); "Present mode" hides
          the app chrome (07-06 — an in-app view, not the OS Fullscreen API). In
          edit mode the row collapses: Save/Exit live in the pink SaveBar, the logo
          is edited inline, and products are added via the in-grid "+ Add product". */}
      {!presenting && !editing && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onAddProducts}
            className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand-deep"
          >
            <Plus size={16} /> Add products
          </button>
          <button
            type="button"
            onClick={onManage}
            className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink/75 shadow-sm hover:bg-white"
          >
            <Pencil size={16} /> Manage shop
          </button>
          <button
            type="button"
            onClick={onPresent}
            title="Present mode — hides the app chrome so you can share this window in a meeting"
            className="flex items-center gap-1.5 rounded-full bg-white/70 px-4 py-2 text-sm font-bold text-ink/75 shadow-sm hover:bg-white"
          >
            <ScreenShare size={16} /> Present mode
          </button>
        </div>
      )}

      {/* LinkedIn 4:1 cover (DEV-118). aspect-[4/1] holds the ratio at any width. */}
      <div className="relative aspect-[4/1] w-full overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-950 via-green-800 to-lime-700 shadow-lg">
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />
        )}
        {/* legibility scrim under the name/tagline */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />

        {editing && <ChangeBanner onPick={onPickCover} />}

        <div className="absolute inset-x-6 bottom-5 z-10 flex items-end gap-4 text-white">
          {/* Enlarged company name + sub-headline (DEV-115). In edit mode both
              are in-place editable inputs with a calm ring + wash. Otherwise the
              logo + name form a clickable "company chip" that opens your own
              Present page (DEV-127 / UX-06). */}
          {editing ? (
            <>
              <EditableLogoTile
                logoUrl={logoUrl}
                companyName={companyName}
                onEditLogo={onEditLogo}
              />
              <div className="min-w-0 flex-1">
                <input
                  aria-label="Company name"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  className="w-full rounded-lg bg-white/15 px-2 py-0.5 text-3xl font-bold tracking-tight text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.5)] outline-none focus:bg-white/25"
                />
                <input
                  aria-label="Sub-headline"
                  value={tagline}
                  placeholder="Add a sub-headline…"
                  onChange={(e) => onTaglineChange(e.target.value)}
                  className="mt-1.5 w-full rounded-lg bg-white/15 px-2 py-0.5 text-base font-medium text-white shadow-[inset_0_0_0_1.5px_rgba(255,255,255,0.5)] outline-none placeholder:text-white/50 focus:bg-white/25"
                />
              </div>
            </>
          ) : (
            <Link
              href="/present"
              data-testid="company-chip"
              title="Your company → your Present shop"
              className="flex min-w-0 flex-1 items-end gap-4 rounded-2xl outline-none transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <LogoTile logoUrl={logoUrl} companyName={companyName} />
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-bold tracking-tight drop-shadow-lg">{name}</h1>
                {tagline && <p className="mt-1 truncate text-base font-medium opacity-95">{tagline}</p>}
              </div>
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/** Edit-mode wrapper turning the logo tile itself into the inline edit affordance
 *  (F-01, replaces the retired "Edit logo & branding" button). Clicking it opens
 *  the shared BrandingEditForm — the ONE logo writer (D-07); this never writes the
 *  logo. A hover cue signals it is editable. */
function EditableLogoTile({
  logoUrl,
  companyName,
  onEditLogo,
}: {
  logoUrl: string | null;
  companyName: string;
  onEditLogo: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="edit-logo-btn"
      onClick={onEditLogo}
      title="Edit logo & branding"
      className="group relative flex-none rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <LogoTile logoUrl={logoUrl} companyName={companyName} />
      {/* subtle hover cue that the tile is the inline edit control */}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl bg-ink/50 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100">
        <ImagePlus size={16} /> Edit
      </span>
    </button>
  );
}

/** The square logo tile shown at the banner's lower-left. Reused by the editable
 *  and the chip (link) variants so the two stay pixel-identical. */
function LogoTile({ logoUrl, companyName }: { logoUrl: string | null; companyName: string }) {
  return (
    <div className="grid h-[70px] w-[70px] flex-none place-items-center rounded-2xl border border-white/35 bg-white/15 text-3xl backdrop-blur-sm">
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={companyName} className="h-full w-full rounded-2xl object-cover" />
      ) : (
        <span>❀</span>
      )}
    </div>
  );
}

/** Cover-upload affordance shown top-right of the banner in edit mode. Uploads
 *  client-direct to shop-media (handled by the parent via onPick → cover_path). */
function ChangeBanner({ onPick }: { onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.click()}
        className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-ink shadow-sm hover:bg-white"
      >
        <ImagePlus size={14} /> Change banner
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
