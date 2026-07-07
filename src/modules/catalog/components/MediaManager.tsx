"use client";

/**
 * The Present card BACK — "Documents & media". A reusable manager that renders a
 * product's front-of-card media (gallery images + external video links) as a
 * drag-sortable grid, and its back-of-card documents (COA / custom-doc PDFs) as
 * download folders. In edit mode (owner + a companyId) it also uploads, deletes,
 * reorders, and pastes video links; without edit rights it is a read-only
 * view+download surface (buyer view, present mode).
 *
 * Storage contract (mirrors ShopView's gallery, D-11): image/PDF BYTES are
 * uploaded client-direct to the public `shop-media` bucket under
 * `{companyId}/products/{productId}-{uuid}.{ext}` — never through the server —
 * then a server action records only the resulting path/url. Images live in
 * `product_image` (addProductImageRecords / removeProductImage / setProductImageOrder);
 * video links + COA/doc PDFs live in `product_media` (addProductMediaRecord /
 * removeProductMedia). An upload that fails to record is rolled back (orphan
 * cleanup) so a stray object never lingers.
 *
 * Downloads use a fetch→blob→native `<a download>` (single + sequential
 * "download all") — NO zip dependency (RESEARCH: sequential native download).
 * The Sella "Marktvergleich" slot renders INERT (a static label, no figure) —
 * live price comparison is legal-gated (UWG §7).
 */
import { useRef, useState } from "react";
import {
  FileText, X, Download, Plus, Play, ChevronRight, Loader2, BarChart2, UploadCloud,
} from "lucide-react";
import type { ShopProduct, ProductImage, ProductMedia } from "../shop";
import { createClient } from "@/shared/db/client";
import {
  addProductImageRecords,
  removeProductImage,
  setProductImageOrder,
  addProductMediaRecord,
  removeProductMedia,
} from "../manage";
import { DocUploadModal } from "./DocUploadModal";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
/** Public URL for a `shop-media` storage path (same builder as ShopView). */
const mediaUrl = (path: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/shop-media/${path}`;

// Client-side upload guards. The `shop-media` bucket enforces these server-side
// too (10 MB + the allowed MIME list, incl. application/pdf since 07-01); these
// give a friendly message before we attempt the upload.
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — matches the bucket limit
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const PDF_TYPE = "application/pdf";

/** The last path segment, used as a human filename for downloads. */
const baseName = (path: string) => path.split("/").pop() || path;

/** fetch→blob→native `<a download>` so a cross-origin bucket file downloads
 *  instead of navigating (the `download` attr alone is ignored cross-origin). */
async function triggerDownload(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function MediaManager({
  product: p,
  companyId,
  editing = false,
  onChanged,
}: {
  product: ShopProduct;
  /** The owner's company id — required to upload (path is folder-scoped to it). */
  companyId?: string;
  editing?: boolean;
  /** Called after any successful mutation so the parent re-pulls the shop. */
  onChanged?: () => void;
}) {
  const canEdit = editing && !!companyId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [docModalOpen, setDocModalOpen] = useState(false);
  const dragImageId = useRef<string | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const images = p.images;
  const videos = p.media.filter((m) => m.kind === "video_link");
  const coas = p.media.filter((m) => m.kind === "coa");
  const docs = p.media.filter((m) => m.kind === "doc");
  const hasMediaFiles = images.length > 0; // only bucket files are downloadable
  const hasDocFiles = coas.length + docs.length > 0;

  // ── client-direct upload of image bytes → product_image ──────────────────
  async function uploadImages(files: FileList | null) {
    if (!files || files.length === 0 || !companyId) return;
    const list = [...files];
    for (const f of list) {
      if (!IMAGE_TYPES.includes(f.type)) return setError("Use a JPG, PNG or WebP image.");
      if (f.size > MAX_BYTES) return setError("Each image must be under 10 MB.");
    }
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const uploaded: string[] = [];
    try {
      for (const f of list) {
        const path = `${companyId}/products/${p.id}-${crypto.randomUUID()}.${IMAGE_EXT[f.type]}`;
        const { error: upErr } = await supabase.storage
          .from("shop-media")
          .upload(path, f, { contentType: f.type });
        if (upErr) throw new Error(upErr.message);
        uploaded.push(path);
      }
      const res = await addProductImageRecords(p.id, uploaded);
      if ("error" in res) throw new Error(res.error);
      onChanged?.();
    } catch (e) {
      if (uploaded.length > 0) await supabase.storage.from("shop-media").remove(uploaded);
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  // ── client-direct upload of a PDF → product_media (coa|doc) ───────────────
  // `name` is the custom-doc label from the popup; COA keeps the filename (minus .pdf).
  async function uploadDoc(file: File | undefined, kind: "coa" | "doc", name?: string) {
    if (!file || !companyId) return;
    if (file.type !== PDF_TYPE) return setError("Upload a PDF file.");
    if (file.size > MAX_BYTES) return setError("File must be under 10 MB.");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    let path: string | null = null;
    try {
      const candidate = `${companyId}/products/${p.id}-${crypto.randomUUID()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("shop-media")
        .upload(candidate, file, { contentType: PDF_TYPE });
      if (upErr) throw new Error(upErr.message);
      path = candidate;
      const label = kind === "coa" ? file.name.replace(/\.pdf$/i, "") : name?.trim() || file.name;
      const res = await addProductMediaRecord(p.id, { kind, path, label });
      if ("error" in res) throw new Error(res.error);
      onChanged?.();
    } catch (e) {
      if (path) await supabase.storage.from("shop-media").remove([path]);
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function addVideo() {
    const url = videoUrl.trim();
    if (!url) return;
    setBusy(true);
    setError(null);
    const res = await addProductMediaRecord(p.id, { kind: "video_link", url });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setVideoUrl("");
    onChanged?.();
  }

  async function deleteImage(id: string) {
    setBusy(true);
    setError(null);
    const res = await removeProductImage(id);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    if (res.path) await createClient().storage.from("shop-media").remove([res.path]);
    onChanged?.();
  }

  async function deleteMedia(m: ProductMedia) {
    setBusy(true);
    setError(null);
    const res = await removeProductMedia(m.id);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    if (res.path) await createClient().storage.from("shop-media").remove([res.path]);
    onChanged?.();
  }

  // Drag-reorder among IMAGES only (video links keep their own order). Drop the
  // dragged image before the target, then persist the full order (index 0 = cover).
  async function reorderImageDrop(targetId: string) {
    const from = dragImageId.current;
    dragImageId.current = null;
    if (!from || from === targetId) return;
    const ids = images.map((im) => im.id);
    const fromIdx = ids.indexOf(from);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    setBusy(true);
    setError(null);
    const res = await setProductImageOrder(p.id, ids);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    onChanged?.();
  }

  async function downloadAllMedia() {
    for (const im of images) await triggerDownload(mediaUrl(im.path), baseName(im.path));
  }
  async function downloadAllDocs() {
    for (const m of [...coas, ...docs]) {
      if (m.path) await triggerDownload(mediaUrl(m.path), m.label || baseName(m.path));
    }
  }

  const sectionHead =
    "mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-ink/45";
  const pillBtn =
    "inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold text-brand-deep hover:bg-brand/15 disabled:opacity-40";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center gap-2 bg-gradient-to-br from-brand-deep to-brand px-3.5 py-3 text-white">
        <FileText size={16} className="shrink-0" />
        <div className="min-w-0">
          <b className="block text-sm font-bold">Documents &amp; media</b>
          <small className="block truncate text-[11px] opacity-85">{p.name}</small>
        </div>
        {busy && <Loader2 size={15} className="ml-auto animate-spin" />}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {error && <p className="mb-2 text-[11px] font-semibold text-rose-600">{error}</p>}

        {/* ---------- Media (shows on the front) ---------- */}
        <div className={sectionHead}>
          <span>Media</span>
          <span className="font-medium normal-case tracking-normal text-ink/40">· shows on the front</span>
          <span className="ml-auto flex items-center gap-1.5">
            {canEdit && (
              <button
                type="button"
                className={pillBtn}
                disabled={busy}
                onClick={() => imageInput.current?.click()}
              >
                <Plus size={11} /> Upload
              </button>
            )}
            {hasMediaFiles && (
              <button
                type="button"
                aria-label="Download all media"
                className={pillBtn}
                onClick={downloadAllMedia}
              >
                <Download size={11} /> Download all
              </button>
            )}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          {images.map((im: ProductImage) => (
            <div
              key={im.id}
              className="group relative aspect-square overflow-hidden rounded-lg bg-brand-soft/40"
              draggable={canEdit}
              onDragStart={
                canEdit
                  ? (e) => {
                      dragImageId.current = im.id;
                      e.stopPropagation();
                    }
                  : undefined
              }
              onDragOver={canEdit ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
              onDrop={canEdit ? (e) => { e.stopPropagation(); void reorderImageDrop(im.id); } : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(im.path)} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-px text-[7px] font-bold uppercase text-white">
                Photo
              </span>
              <button
                type="button"
                aria-label="Download image"
                onClick={() => triggerDownload(mediaUrl(im.path), baseName(im.path))}
                className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-brand-deep opacity-0 transition group-hover:opacity-100"
              >
                <Download size={11} />
              </button>
              {canEdit && (
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={() => deleteImage(im.id)}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-rose-600"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}

          {videos.map((m) => (
            <div key={m.id} className="relative aspect-square overflow-hidden rounded-lg bg-ink/80">
              <a
                href={m.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                aria-label="Open video"
                className="grid h-full w-full place-items-center text-white"
              >
                <Play size={20} fill="currentColor" />
              </a>
              <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-px text-[7px] font-bold uppercase text-white">
                Video
              </span>
              {canEdit && (
                <button
                  type="button"
                  aria-label="Remove video"
                  onClick={() => deleteMedia(m)}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-rose-600"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          ))}

          {canEdit && (
            <button
              type="button"
              aria-label="Upload image"
              disabled={busy}
              onClick={() => imageInput.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink/25 bg-brand/[0.03] text-[9px] font-bold text-brand-deep hover:bg-brand/[0.06] disabled:opacity-40"
            >
              <UploadCloud size={16} /> Upload
            </button>
          )}
        </div>

        {canEdit && (
          <div className="mt-2 flex items-center gap-1.5">
            <input
              aria-label="Video link"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="Paste a YouTube / Vimeo / Loom link"
              className="min-w-0 flex-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-[11px] focus:border-brand focus:outline-none"
            />
            <button
              type="button"
              aria-label="Add video link"
              disabled={busy || !videoUrl.trim()}
              onClick={addVideo}
              className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[11px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              Add
            </button>
          </div>
        )}

        {/* Cluster G: trimmed — "shows on the front" duplicated the section
            header's own "· shows on the front" label. Kept the details the
            header doesn't carry (size limit, reorder, remove). */}
        <p className="mt-2 text-[10px] leading-relaxed text-ink/45">
          ≤10 MB each · Drag to re-sort · ✕ to remove.
        </p>

        {/* ---------- Documents (COA / custom) ---------- */}
        <div className={`${sectionHead} mt-4`}>
          <span>Documents</span>
          <span className="ml-auto flex items-center gap-1.5">
            {canEdit && (
              <button
                type="button"
                className={pillBtn}
                disabled={busy}
                onClick={() => setDocModalOpen(true)}
              >
                <Plus size={11} /> Upload document
              </button>
            )}
            {hasDocFiles && (
              <button
                type="button"
                aria-label="Download all documents"
                className={pillBtn}
                onClick={downloadAllDocs}
              >
                <Download size={11} /> Download all
              </button>
            )}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {/* Cluster G: a folder shell (title/subtitle/count/chevron) only ever
              renders once it has ≥1 file — an empty folder is hidden entirely,
              not shown with a "No files yet." placeholder. */}
          {coas.length > 0 && (
            <DocFolder title="COAs" subtitle="Certificates of Analysis" items={coas} canEdit={canEdit} onDelete={deleteMedia} />
          )}
          {docs.length > 0 && (
            <DocFolder title="Documents" subtitle="Custom uploads" items={docs} canEdit={canEdit} onDelete={deleteMedia} />
          )}
        </div>

        {/* ---------- inert Sella slot (legal-gated, no figure) ---------- */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-ink/10 bg-ink/[0.02] px-3 py-2.5">
          <BarChart2 size={15} className="shrink-0 text-ink/40" />
          <div className="min-w-0">
            <b className="block text-[11px] font-bold text-ink/70">Sella · Marktvergleich</b>
            <small className="block text-[10px] text-ink/45">Live market price comparison — coming soon</small>
          </div>
        </div>
      </div>

      {/* hidden inputs for the client-direct uploads (aria-labelled so tests and
          assistive tech can reach them) */}
      <input
        ref={imageInput}
        type="file"
        aria-label="Product image file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          void uploadImages(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Type-first document upload — one [Upload document] entry (F-03). The
          modal collects { kind, file, name? }; the existing uploadDoc path then
          uploads client-direct and records the label (custom name or filename). */}
      {docModalOpen && (
        <DocUploadModal
          productName={p.name}
          onClose={() => setDocModalOpen(false)}
          onSubmit={({ kind, file, name }) => {
            setDocModalOpen(false);
            void uploadDoc(file, kind, name);
          }}
        />
      )}
    </div>
  );
}

/** One collapsible document folder (COA or custom). Each row downloads its PDF;
 *  in edit mode a row can be removed. An empty folder shows a muted placeholder. */
function DocFolder({
  title,
  subtitle,
  items,
  canEdit,
  onDelete,
}: {
  title: string;
  subtitle: string;
  items: ProductMedia[];
  canEdit: boolean;
  onDelete: (m: ProductMedia) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="overflow-hidden rounded-xl border border-ink/10 bg-ink/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-brand/[0.04]"
      >
        <FileText size={15} className="shrink-0 text-brand-deep" />
        <span className="min-w-0 flex-1">
          <b className="block text-[12px] font-semibold text-ink">{title}</b>
          <small className="block text-[9px] uppercase tracking-wide text-ink/45">{subtitle}</small>
        </span>
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand/10 px-1 text-[10px] font-bold text-brand-deep">
          {items.length}
        </span>
        <ChevronRight size={14} className={`text-ink/40 transition ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-ink/10">
          {items.length === 0 ? (
            <p className="px-3.5 py-2 text-[10px] text-ink/40">No files yet.</p>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 border-t border-ink/5 px-3.5 py-2 first:border-t-0"
              >
                <a
                  href={m.path ? mediaUrl(m.path) : "#"}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => {
                    if (!m.path) return;
                    e.preventDefault();
                    void triggerDownload(mediaUrl(m.path), m.label || baseName(m.path));
                  }}
                  aria-label={`Download ${m.label || "document"}`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-ink hover:text-brand-deep"
                >
                  <span className="truncate text-[11.5px] font-medium">{m.label || baseName(m.path ?? "")}</span>
                  <small className="text-[8px] uppercase tracking-wide text-ink/40">PDF</small>
                  <Download size={12} className="ml-auto shrink-0 text-ink/40" />
                </a>
                {canEdit && (
                  <button
                    type="button"
                    aria-label="Remove document"
                    onClick={() => onDelete(m)}
                    className="shrink-0 rounded-md p-1 text-ink/40 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
