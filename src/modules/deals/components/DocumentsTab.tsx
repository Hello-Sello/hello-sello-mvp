"use client";

import { FileText, Lock, Upload } from "lucide-react";
import type { ArtifactView } from "../types";

/**
 * The Documents tab (Phase 5) - the real `deal_artifact` list (replaces the old
 * StubCard). Each row shows the document title, its category, and its scan
 * status. A PRIVATE document (D-13) carries the same dashed deep-pink lock chip
 * as a private Thing - a document's visibility FOLLOWS its linked thing
 * (resolved decision). The read (Plan 01 RLS) already hides OTHER companies'
 * private documents, so any private document the viewer sees is their own.
 *
 * The upload pipeline is a PARKED slice - the upload control here is a disabled
 * stub for now. This tab's job is the LIST + the lock icons, not the upload.
 */
export interface DocumentsTabProps {
  artifacts: ArtifactView[];
}

export function DocumentsTab({ artifacts }: DocumentsTabProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink/45">
          Deal documents ({artifacts.length})
        </span>
        <button
          type="button"
          disabled
          title="Upload coming soon"
          className="flex items-center gap-1 rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-medium text-ink/40"
        >
          <Upload size={12} strokeWidth={2} />
          Upload
        </button>
      </div>

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
