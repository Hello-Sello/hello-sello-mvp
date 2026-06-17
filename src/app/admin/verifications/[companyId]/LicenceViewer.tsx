'use client'

/**
 * LicenceViewer — view-only, in-platform licence document renderer.
 *
 * D-02: View-only — signed URLs with 60 s TTL, generated on deliberate panel-open.
 *        No link href with file-serve attribute; no public storage URL (createSignedUrl only).
 * D-03: Renders multiple files; shows the seller's optional description.
 * D-04: Graceful empty state when no licence was uploaded.
 * Pitfall 6: log_license_viewed called once per deliberate view; fail-soft so a
 *            logging error never blocks the review.
 */

import { useState, useTransition } from 'react'
import { fetchLicenceUrls } from '../licenceActions'

export type LicenceFileMeta = {
  id: string
  storage_path: string
  original_filename: string
  mime_type: string
  description: string | null
  scan_status: string
}

type Props = {
  companyId: string
  licences: LicenceFileMeta[]
  sellerDescription: string | null
}

type UrlMap = Record<string, string> // id → signed URL

export function LicenceViewer({ companyId, licences, sellerDescription }: Props) {
  const [open, setOpen] = useState(false)
  const [urls, setUrls] = useState<UrlMap>({})
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, startTransition] = useTransition()

  function handleOpen() {
    if (open) return // already open — do not re-log
    startTransition(async () => {
      const result = await fetchLicenceUrls(companyId)
      if ('error' in result) {
        setLoadError(result.error)
        // Still open the panel — log failure is non-blocking (Pitfall 6)
      } else {
        setUrls(result.urls)
        setLoadError(null)
      }
      setOpen(true)
    })
  }

  // ── Empty state (D-04) ───────────────────────────────────────────────────
  if (licences.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-dashed border-ink/20 bg-ink/[0.02] px-4 py-4 text-sm text-ink-muted">
        <span className="mt-0.5 text-base">⚠</span>
        <div>
          <p className="font-semibold text-ink">No licence file uploaded</p>
          <p className="mt-0.5">
            The company did not upload a licence document during onboarding. Reviewer applies judgment.
          </p>
        </div>
      </div>
    )
  }

  // ── Collapsed panel (before deliberate open) ─────────────────────────────
  if (!open) {
    return (
      <div>
        {sellerDescription && (
          <div className="mb-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm">
            <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
              Seller description
            </p>
            <p className="text-ink">{sellerDescription}</p>
          </div>
        )}
        <button
          onClick={handleOpen}
          disabled={isLoading}
          className="inline-flex items-center gap-2 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm font-bold text-ink transition-opacity hover:bg-ink/[0.03] disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
              Loading documents…
            </>
          ) : (
            <>
              <span>🔍</span>
              View licence document{licences.length > 1 ? `s (${licences.length})` : ''}
            </>
          )}
        </button>
        <p className="mt-1.5 text-[11px] text-ink-muted/70">
          View-only · access logged
        </p>
      </div>
    )
  }

  // ── Open panel — render each file inline ──────────────────────────────────
  return (
    <div>
      {sellerDescription && (
        <div className="mb-3 rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm">
          <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
            Seller description
          </p>
          <p className="text-ink">{sellerDescription}</p>
        </div>
      )}

      {loadError && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-800">
          Access logging failed (non-blocking): {loadError}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {licences.map((file) => {
          const signedUrl = urls[file.id]
          const isPdf = file.mime_type === 'application/pdf'
          const isImage = file.mime_type.startsWith('image/')

          return (
            <div
              key={file.id}
              className="overflow-hidden rounded-xl border border-ink/10 bg-white"
            >
              {/* File header row */}
              <div className="flex items-center gap-3 border-b border-ink/10 px-4 py-2.5">
                <span className="text-base">{isPdf ? '📄' : '🖼'}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-bold text-ink">
                    {file.original_filename}
                  </p>
                  {file.description && (
                    <p className="truncate text-xs text-ink-muted">{file.description}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  view only
                </span>
              </div>

              {/* Inline viewer — view-only signed URL, 60 s TTL (D-02) */}
              {!signedUrl ? (
                <div className="flex items-center justify-center px-4 py-8 text-sm text-ink-muted">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/20 border-t-ink" />
                  <span className="ml-2">Generating secure view…</span>
                </div>
              ) : isPdf ? (
                <iframe
                  src={signedUrl}
                  title={`Licence document: ${file.original_filename}`}
                  className="h-[480px] w-full border-0"
                  sandbox=""
                />
              ) : isImage ? (
                <div className="flex items-center justify-center bg-ink/[0.02] p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedUrl}
                    alt={`Licence document: ${file.original_filename}`}
                    className="max-h-[480px] max-w-full rounded object-contain"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-sm text-ink-muted">
                  Unsupported file type ({file.mime_type}) — cannot render inline.
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[11px] text-ink-muted/70">
        View-only · signed URLs expire in 60 s · access logged
      </p>
    </div>
  )
}
