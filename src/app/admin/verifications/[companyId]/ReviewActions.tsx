'use client'

/**
 * ReviewActions — approve (one-click confirm) + reject (preset reason form).
 *
 * D-09: Approve requires a confirm dialog.
 * D-05: Reject requires a preset reason; Reject submit disabled until a preset is chosen.
 * D-06: presetCode goes to metadata.preset, note goes to audit_log.reason.
 * D-10: success toast; company leaves the pending list (revalidated server-side).
 * D-11: error toast; status unchanged; action is retryable.
 * T-03-13: presetCode validated against REJECT_PRESETS in rejectCompany (action layer).
 */

import { useState, useTransition } from 'react'
import { approveCompany, rejectCompany } from '../actions'
import {
  REJECT_PRESETS,
  REJECT_PRESET_LABELS,
  type RejectPreset,
} from '../reject-presets'

type Props = {
  companyId: string
  companyName: string
  /** Whether this company is still in a pending state (guards against decided companies) */
  isPending: boolean
}

type ToastState = { kind: 'ok' | 'err'; message: string } | null

export function ReviewActions({ companyId, companyName, isPending }: Props) {
  // Approve
  const [showConfirm, setShowConfirm] = useState(false)

  // Reject
  const [showReject, setShowReject] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<RejectPreset | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const [toast, setToast] = useState<ToastState>(null)
  const [isPending_, startTransition] = useTransition()

  function showToast(kind: 'ok' | 'err', message: string) {
    setToast({ kind, message })
    setTimeout(() => setToast(null), 3_500)
  }

  // ── Approve ────────────────────────────────────────────────────────────────
  function handleApprove() {
    setShowConfirm(false)
    startTransition(async () => {
      const result = await approveCompany(companyId)
      if ('ok' in result) {
        showToast('ok', `${companyName} approved — they'll enter Discover.`)
      } else {
        showToast('err', result.error)
      }
    })
  }

  // ── Reject ─────────────────────────────────────────────────────────────────
  function openRejectForm() {
    setSelectedPreset(null)
    setRejectNote('')
    setShowReject(true)
  }

  function handleReject() {
    if (!selectedPreset) return // should never happen (button is disabled until preset picked)
    setShowReject(false)
    startTransition(async () => {
      const result = await rejectCompany(companyId, selectedPreset, rejectNote.trim())
      if ('ok' in result) {
        showToast('ok', `${companyName} rejected.`)
      } else {
        showToast('err', result.error)
      }
    })
  }

  // ── Render: toast lives OUTSIDE the isPending guard so it survives the RSC
  //    re-render that flips isPending to false (revalidatePath causes the parent
  //    RSC to re-render with the new status, changing the isPending prop — if the
  //    toast were inside the guard it would be unmounted before the user sees it).
  return (
    <>
      {/* Already decided — no action buttons (but toast can still show above) */}
      {!isPending && (
        <div className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink-muted">
          This company has already been reviewed.
        </div>
      )}

      {/* ── Action bar (only when pending) ───────────────────────────────────── */}
      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isPending_}
            className="flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-extrabold text-white transition-opacity disabled:opacity-50"
          >
            Approve
          </button>

          <button
            onClick={openRejectForm}
            disabled={isPending_}
            className="flex items-center gap-2 rounded-xl border border-danger/30 bg-white px-4 py-2.5 text-sm font-extrabold text-danger transition-opacity hover:bg-red-50/50 disabled:opacity-50"
          >
            Reject…
          </button>
        </div>
      )}

      {/* ── Approve confirm dialog (D-09: one-click confirm) ────────────────── */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-ink/10 px-5 py-4">
              <h2 id="confirm-title" className="text-base font-extrabold text-ink">
                Approve {companyName}?
              </h2>
            </div>
            <div className="px-5 py-4 text-sm text-ink-muted">
              They&apos;ll enter Discover and will be visible to other verified companies.
              This action is recorded in the audit log and cannot be undone at MVP.
            </div>
            <div className="flex justify-end gap-3 border-t border-ink/10 px-5 py-4">
              <button
                onClick={() => setShowConfirm(false)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-bold text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={isPending_}
                className="rounded-xl bg-success px-5 py-2 text-sm font-extrabold text-white disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject form dialog (D-05: preset required, note optional) ─────────── */}
      {showReject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-ink/10 px-5 py-4">
              <h2 id="reject-title" className="text-base font-extrabold text-ink">
                Reject {companyName}
              </h2>
            </div>

            <div className="px-5 py-4">
              {/* Preset reasons (required — D-05) */}
              <p className="mb-2.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
                Reason (required)
              </p>
              <div className="mb-4 flex flex-col gap-1.5">
                {REJECT_PRESETS.map((code) => (
                  <label
                    key={code}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors ${
                      selectedPreset === code
                        ? 'border-danger/40 bg-red-50/60 font-semibold text-danger'
                        : 'border-ink/10 text-ink hover:bg-ink/[0.02]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="reject-preset"
                      value={code}
                      checked={selectedPreset === code}
                      onChange={() => setSelectedPreset(code)}
                      className="accent-danger"
                    />
                    {REJECT_PRESET_LABELS[code]}
                  </label>
                ))}
              </div>

              {/* Optional note (D-05/06) */}
              <p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-widest text-ink-muted/70">
                Note (optional)
              </p>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Add context for the audit log…"
                rows={3}
                className="w-full resize-none rounded-xl border border-ink/15 px-3 py-2.5 text-sm text-ink outline-none placeholder:text-ink-muted/60 focus:border-danger/40 focus:ring-1 focus:ring-danger/20"
              />
            </div>

            <div className="flex justify-end gap-3 border-t border-ink/10 px-5 py-4">
              <button
                onClick={() => setShowReject(false)}
                className="rounded-xl border border-ink/15 px-4 py-2 text-sm font-bold text-ink"
              >
                Cancel
              </button>
              {/* Reject submit disabled until preset is chosen (D-05 / prototype rule) */}
              <button
                onClick={handleReject}
                disabled={!selectedPreset || isPending_}
                className="rounded-xl border border-danger/30 bg-white px-5 py-2 text-sm font-extrabold text-danger transition-opacity hover:bg-red-50/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reject company
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast (D-10 success / D-11 error) */}
      {toast && (
        <div
          className={`fixed bottom-6 right-5 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-white shadow-xl transition-all ${
            toast.kind === 'ok' ? 'bg-success' : 'bg-danger'
          }`}
        >
          <span>{toast.kind === 'ok' ? '✓' : '⚠'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </>
  )
}
