"use client";

/**
 * The card-back "Upload document" popup (Cluster C, F-03). A self-contained
 * in-DOM overlay — NEVER a native dialog/confirm/alert (those freeze the browser
 * extension and block the E2E). It asks the document TYPE before a file is
 * chosen: "COA (Certificate of Analysis)" shows only a file drop; "Custom
 * document" adds a Name field (persisted later in product_media.label — no
 * migration). It does NOT upload: on Upload it hands the parent { kind, file,
 * name? } and MediaManager reuses the existing client-direct uploadDoc path.
 *
 * Upload is gated pink — disabled until a file is chosen and, for a custom
 * document, a name is entered. Closes on the ✕, a backdrop click, Cancel, or Esc.
 */
import { useEffect, useRef, useState } from "react";
import { X, UploadCloud, FileText } from "lucide-react";

export type DocUploadKind = "coa" | "doc";
export type DocUploadSubmit = { kind: DocUploadKind; file: File; name?: string };

export function DocUploadModal({
  productName,
  onSubmit,
  onClose,
}: {
  productName: string;
  /** The parent uploads (kind + optional custom name); the modal only collects intent. */
  onSubmit: (payload: DocUploadSubmit) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<DocUploadKind>("coa");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Esc closes — mirrors the app's Dialog grammar (relationship/Dialog.tsx).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isCustom = kind === "doc";
  const canUpload = !!file && (!isCustom || name.trim().length > 0);

  const fieldLabel =
    "mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink/45";
  const fieldBox =
    "w-full rounded-xl border border-ink/15 bg-white px-3 py-2.5 text-[13px] focus:border-brand focus:outline-none";

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Upload document"
        className="relative max-h-[88vh] w-full max-w-[420px] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl"
      >
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-[17px] font-bold tracking-tight text-ink">Upload document</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto grid h-8 w-8 place-items-center rounded-full bg-black/5 text-ink/50 hover:bg-black/10 hover:text-ink"
          >
            <X size={15} />
          </button>
        </div>
        <p className="mb-3.5 text-[12px] leading-relaxed text-ink/55">
          Add any document to <b className="font-semibold text-ink/75">{productName}</b> — it shows on
          the back of the card.
        </p>

        {/* Document type — asked FIRST, before any file */}
        <label className={fieldLabel}>Document type</label>
        <select
          aria-label="Document type"
          value={kind}
          onChange={(e) => setKind(e.target.value as DocUploadKind)}
          className={`${fieldBox} mb-3`}
        >
          <option value="coa">COA (Certificate of Analysis)</option>
          <option value="doc">Custom document</option>
        </select>

        {/* Name — only for a custom document, above the drop */}
        {isCustom && (
          <>
            <label className={fieldLabel}>Name</label>
            <input
              aria-label="Document name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product catalogue, price sheet, brochure…"
              className={`${fieldBox} mb-3`}
            />
          </>
        )}

        {/* File drop → hidden PDF input (client-direct upload happens in the parent) */}
        <label className={fieldLabel}>File</label>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-ink/25 bg-brand/[0.04] px-4 py-6 text-center text-[13px] text-ink/55 hover:bg-brand/[0.07]"
        >
          {file ? (
            <span className="flex items-center gap-1.5 font-semibold text-ink/75">
              <FileText size={15} /> {file.name}
            </span>
          ) : (
            <>
              <UploadCloud size={22} className="text-ink/45" />
              Drop a PDF or file (≤10 MB)
            </>
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          aria-label="Document file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />

        {/* Actions — Upload is pink + gated; Cancel discards */}
        <div className="mt-4 flex items-center gap-2.5">
          <button
            type="button"
            disabled={!canUpload}
            onClick={() => {
              if (!file) return;
              onSubmit({ kind, file, name: isCustom ? name.trim() : undefined });
            }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-[13px] font-bold text-white hover:bg-brand-deep disabled:opacity-40"
          >
            <UploadCloud size={15} /> Upload
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-black/5 px-5 py-2.5 text-[13px] font-bold text-ink hover:bg-black/10"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
