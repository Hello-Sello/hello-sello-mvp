'use client'

import { useState, useTransition } from 'react'
import { approveCompany } from '../actions'

type Props = {
  companyId: string
  companyName: string
  /** Whether this company is still in a pending state (guards against decided companies) */
  isPending: boolean
}

type ToastState = { kind: 'ok' | 'err'; message: string } | null

export function ReviewActions({ companyId, companyName, isPending }: Props) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [toast, setToast] = useState<ToastState>(null)
  const [isPending_, startTransition] = useTransition()

  function showToast(kind: 'ok' | 'err', message: string) {
    setToast({ kind, message })
    setTimeout(() => setToast(null), 3_500)
  }

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

  if (!isPending) {
    return (
      <div className="rounded-xl border border-ink/10 bg-white px-4 py-3 text-sm text-ink-muted">
        This company has already been reviewed.
      </div>
    )
  }

  return (
    <>
      {/* Action bar */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending_}
          className="flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-sm font-extrabold text-white transition-opacity disabled:opacity-50"
        >
          Approve
        </button>

        {/* Reject button — entry point present but inert; reject form lands in 03-03 */}
        <button
          disabled
          title="Reject with reason — coming in 03-03"
          className="flex items-center gap-2 rounded-xl border border-danger/30 bg-white px-4 py-2.5 text-sm font-extrabold text-danger/50 cursor-not-allowed"
        >
          Reject…
        </button>
      </div>

      {/* Approve confirm dialog (D-09: one-click confirm) */}
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
