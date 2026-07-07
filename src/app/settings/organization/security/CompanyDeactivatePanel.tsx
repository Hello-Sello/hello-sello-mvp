'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Power, Building2, RotateCcw, Info, X } from 'lucide-react'
import type { ActionResult } from '@/app/settings/security/actions'

/**
 * The thin Organization → Security tab (D-06 — a small tab, NOT a permissions matrix).
 * It hosts the single reversible company-deactivate action (D-12): deactivating hides the
 * company from Discover and bounces the whole team to the safe no-company state; members
 * keep their accounts and it's reactivatable — there is NO self-serve hard-delete in v1.
 *
 * Dumb + fed: the deactivate / reactivate server actions arrive as props from the server
 * page (the composition root), so this stays a pure presentational client component. The
 * confirm modal + inline error mirror the personal Danger-zone affordance. The
 * deactivate_company / reactivate_company RPCs re-assert has_permission server-side (the
 * real boundary); this UI only confirms intent and surfaces the friendly `{ error }`.
 */
export function CompanyDeactivatePanel({
  companyName,
  deactivated,
  onDeactivate,
  onReactivate,
}: {
  companyName: string | null
  deactivated: boolean
  onDeactivate: () => Promise<ActionResult>
  onReactivate: () => Promise<ActionResult>
}) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const where = companyName ?? 'your company'

  async function reactivate() {
    setBusy(true)
    setError(null)
    const r = await onReactivate()
    setBusy(false)
    if ('error' in r) return setError(r.error)
    router.refresh()
  }

  // Already paused → the reversible reactivate control (D-12).
  if (deactivated) {
    return (
      <section className="glass-strong rounded-3xl p-6 md:p-7 ring-1 ring-danger/25">
        <h2 className="text-base font-bold text-danger">Company is deactivated</h2>
        <p className="mb-5 mt-1 text-sm text-ink-muted">
          {where} is hidden from Discover and your team is in the no-company state. Nothing is
          deleted — reactivate any time to bring everyone back.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={reactivate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
          >
            <RotateCcw size={16} /> {busy ? 'Reactivating…' : 'Reactivate company'}
          </button>
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>
      </section>
    )
  }

  return (
    <section className="glass-strong rounded-3xl p-6 md:p-7 ring-1 ring-danger/25">
      <h2 className="text-base font-bold text-danger">Deactivate company</h2>
      <p className="mb-4 mt-1 text-sm text-ink-muted">
        Hide {where} from Discover and sign your whole team out to the no-company state. Members
        keep their accounts and can be re-added. Nothing is deleted — you can reactivate any time.
      </p>

      {/* D-12: reversible, no self-serve hard-delete in v1. */}
      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-black/[0.08] bg-black/[0.03] p-4">
        <Info size={16} className="mt-0.5 shrink-0 text-ink-muted" />
        <div className="text-xs leading-relaxed text-ink-muted">
          There&apos;s <b className="font-semibold text-ink">no self-serve way</b> to permanently
          delete a company. If you truly need full erasure, contact Hello Sello and we&apos;ll
          handle it with you.
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setError(null)
          setConfirmOpen(true)
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
      >
        <Power size={16} /> Deactivate company
      </button>

      {error && !confirmOpen && <p className="mt-3 text-sm text-danger">{error}</p>}

      {confirmOpen && (
        <ConfirmModal
          companyName={where}
          onDeactivate={onDeactivate}
          onClose={() => setConfirmOpen(false)}
          onDone={() => {
            setConfirmOpen(false)
            router.refresh()
          }}
        />
      )}
    </section>
  )
}

// Explicit confirm before the high-blast-radius action (mirrors the personal
// Danger-zone DeactivateModal). Inline `{ error }` — incl. the action's forbidden mapping.
function ConfirmModal({
  companyName,
  onDeactivate,
  onClose,
  onDone,
}: {
  companyName: string
  onDeactivate: () => Promise<ActionResult>
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const r = await onDeactivate()
    setBusy(false)
    if ('error' in r) return setError(r.error)
    onDone()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-surface p-6 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <Building2 size={20} />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-muted transition hover:bg-black/[0.05]"
          >
            <X size={18} />
          </button>
        </div>
        <h3 className="text-lg font-bold text-ink">Deactivate {companyName}?</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink">
          The company is hidden from Discover and your whole team is signed out to the no-company
          state. Members keep their accounts. <b>Nothing is deleted</b> — reactivate any time.
        </p>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="flex-1 rounded-xl border border-black/10 bg-white/70 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="flex-1 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Deactivating…' : 'Deactivate company'}
          </button>
        </div>
      </div>
    </div>
  )
}
