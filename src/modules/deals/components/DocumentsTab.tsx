"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { FileText, Lock, Upload } from "lucide-react";
import type { ArtifactView } from "../types";
import { uploadDealInvoice } from "../supabase/writes";
import { finalizeDeal } from "../actions";

/**
 * The Documents tab - the real `deal_artifact` list (Phase 5) PLUS the real
 * invoice-PDF upload control (Phase 7, D-27/D-28). Each row shows the document
 * title, its category, and its scan status. A PRIVATE document (D-13) carries the
 * dashed deep-pink lock chip; the read (RLS) already hides OTHER companies'
 * private documents.
 *
 * The upload is no longer a parked stub. D-27 makes the SELLER uploading a real
 * invoice PDF the ONE trigger that closes the deal, so the seller sees a real
 * `<input type="file" accept="application/pdf">` control here: on select it
 * uploads the PDF (`uploadDealInvoice`), then closes the deal (`finalizeDeal`,
 * the seller-invoice gate), then dispatches `hs:deal-updated` so the host re-reads
 * the card + list. The BUYER sees the list read-only (ASVS V4 - only the seller
 * can finalize). D-28 one-shot: once an invoice exists, no second upload.
 */
export interface DocumentsTabProps {
  artifacts: ArtifactView[];
  /** the deal_workspace_id - the storage folder AND the artifact's workspace. */
  workspaceId: string;
  /** the deal_card this tab belongs to - the invoice upload closes it (D-27). */
  dealCardId: string;
  /**
   * Whether THIS viewer may upload the invoice. D-27 / ASVS V4: only the SELLER
   * can close the deal, so the host passes `viewerSide === "seller"`. The buyer
   * sees the list read-only.
   */
  canUpload: boolean;
}

export function DocumentsTab({
  artifacts,
  workspaceId,
  dealCardId,
  canUpload,
}: DocumentsTabProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // D-28 one-shot: the invoice is final. Once one exists, no second upload.
  const hasInvoice = artifacts.some((a) => a.category === "invoice");
  const showRealControl = canUpload && !hasInvoice;

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // clear the input so re-selecting the SAME file still fires a change event
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      // D-27: the seller's upload itself closes the deal. Upload the PDF, then
      // finalize (the seller-invoice gate), then let the host re-read the card.
      await uploadDealInvoice({ workspaceId, dealCardId, file });
      await finalizeDeal({ dealCardId });
      window.dispatchEvent(
        new CustomEvent("hs:deal-updated", { detail: { dealCardId } }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink/45">
          Deal documents ({artifacts.length})
        </span>
        {showRealControl ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFile}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              title="Upload the invoice PDF to close the deal"
              className="flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand-deep transition hover:bg-brand/15 disabled:opacity-50"
            >
              <Upload size={12} strokeWidth={2} />
              {busy ? "Uploading" : "Upload invoice"}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled
            title={
              hasInvoice
                ? "The invoice is uploaded - the deal is closed"
                : "Only the seller can upload the invoice"
            }
            className="flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/40"
          >
            <Upload size={12} strokeWidth={2} />
            {hasInvoice ? "Invoice uploaded" : "Upload"}
          </button>
        )}
      </div>

      {error && <p className="px-1 text-[12px] text-danger">{error}</p>}

      {artifacts.length === 0 ? (
        <div className="glass rounded-2xl p-6 text-center text-xs text-ink/45">
          No documents yet.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {artifacts.map((a) => (
            <DocumentRow key={a.id} artifact={a} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DocumentRow({ artifact }: { artifact: ArtifactView }) {
  return (
    <li className="glass flex items-center gap-3 rounded-xl px-3 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/8 text-brand-deep">
        <FileText size={16} strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-medium text-ink">{artifact.title}</span>
          {/* the LOCK chip on private docs (D-13) - the same CardFront dashed deep-pink treatment */}
          {artifact.isPrivate && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-md border border-dashed px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-brand-deep"
              style={{
                borderColor: "color-mix(in srgb, var(--color-brand-deep) 32%, transparent)",
                background: "color-mix(in srgb, var(--color-brand-deep) 5%, transparent)",
              }}
            >
              <Lock className="h-[11px] w-[11px] text-brand-deep" />
              private
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-ink/45">
          {artifact.category && <span className="truncate">{artifact.category}</span>}
          {artifact.category && <span className="text-ink/25">·</span>}
          <span className="truncate">{artifact.scanStatus}</span>
        </div>
      </div>
    </li>
  );
}
