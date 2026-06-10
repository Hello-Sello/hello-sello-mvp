"use client";

import { useRef, useState } from "react";
import { FileText, Upload, Download } from "lucide-react";
import { uploadArtifact } from "../supabase/writes";
import { getArtifactDownloadUrl } from "../supabase/reads";
import type { ArtifactView, RelationshipView } from "../types";

/**
 * Docs tab (Phase 6) - relationship-level documents (company-wide files like
 * licenses, contracts, certificates). Real upload to a private Storage bucket
 * (magic-byte validated, ≤ 20 MB) + signed-URL download. Deal documents (COAs,
 * badges) stay inside the deal - the two-altitudes rule.
 */
export function DocsTab({
  relationshipId,
  relationship,
  artifacts,
}: {
  relationshipId: string;
  relationship: RelationshipView;
  artifacts: ArtifactView[];
}) {
  const [list, setList] = useState<ArtifactView[]>(artifacts);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const ownerLabel = (companyId: string) =>
    companyId === relationship.me.id ? "Yours" : relationship.them.name;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await uploadArtifact({
        relationshipId,
        file,
        title: file.name.replace(/\.[^.]+$/, ""),
        category: null,
      });
      setList((prev) => [saved, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(a: ArtifactView) {
    try {
      const url = await getArtifactDownloadUrl(a.storagePath);
      window.open(url, "_blank", "noopener");
    } catch {
      setError("Could not open the file.");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink/40">
          Artifacts · documents
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-[11px] font-medium text-white transition hover:bg-brand-deep disabled:opacity-50"
        >
          <Upload size={12} strokeWidth={2} />
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/heic"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {error && <p className="mb-2 text-[11px] text-danger">{error}</p>}

      {list.length === 0 ? (
        <div className="py-8 text-center text-sm text-ink/40">No documents yet.</div>
      ) : (
        <div className="space-y-1.5">
          {list.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-lg bg-white/50 px-3 py-2 text-[12px]"
            >
              <FileText size={14} strokeWidth={1.75} className="shrink-0 text-ink/45" />
              <span className="flex-1 truncate text-ink/70">{a.title}</span>
              <span className="shrink-0 text-[10px] text-ink/35">{ownerLabel(a.uploadedByCompanyId)}</span>
              <button
                type="button"
                onClick={() => handleDownload(a)}
                className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand transition hover:underline"
              >
                <Download size={12} strokeWidth={2} />
                Download
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-2 text-[10px] text-ink/35">
        Company-wide documents live here. Deal-specific files (COAs, badges) stay inside each deal.
      </p>
    </div>
  );
}
