'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check, Power, Trash2, AlertTriangle, Clock, X } from 'lucide-react'
import {
  changePassword,
  deactivateAccount,
  requestAccountDeletion,
  cancelAccountDeletion,
  unlinkIdentity,
} from './actions'
import { changeEmail } from '@/app/account/actions'

/**
 * The Login & security surface (SET-01 Personal group / SET-02). Client component so
 * the change-password, unlink, email-change, and password-gated danger-zone flows are
 * interactive; the thin server route (page.tsx) loads the data. Every privileged write
 * goes through a ./actions server action (which fronts a 13-02 definer RPC) — this UI
 * only collects input, shows the explicit edit/save affordance, and renders errors.
 *
 * Follows Muskan's affordance rule: read-only + Change → Save/Cancel, visible feedback,
 * no always-editable fields with dead buttons. Aurora/glass theme via the shared tokens.
 */

export type LinkedIdentity = { identityId: string; provider: string; email: string }

const PROVIDER = {
  google: { label: 'Google', badge: 'G', tint: 'linear-gradient(135deg,#ea4335,#4285f4)' },
  azure: { label: 'Outlook', badge: 'O', tint: '#0f6cbd' },
  email: { label: 'Email & password', badge: '@', tint: 'linear-gradient(135deg,#ffb7d5,#e30b5d)' },
} as const

function providerOf(p: string) {
  return (PROVIDER as Record<string, { label: string; badge: string; tint: string }>)[p] ?? {
    label: p.charAt(0).toUpperCase() + p.slice(1),
    badge: p.charAt(0).toUpperCase(),
    tint: 'linear-gradient(135deg,#ffb7d5,#e30b5d)',
  }
}

export function SecurityClient({
  email,
  pendingEmail,
  identities,
  deletionScheduledFor,
}: {
  email: string
  pendingEmail: string | null
  identities: LinkedIdentity[]
  deletionScheduledFor: string | null
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="px-1">
        <h1 className="text-lg font-bold text-ink">Login &amp; security</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Manage how you sign in, and the reversible or permanent actions on your account.
        </p>
      </header>

      <PasswordCard />
      <LinkedAccountsCard identities={identities} />
      <EmailCard email={email} pendingEmail={pendingEmail} />
      <DangerZoneCard deletionScheduledFor={deletionScheduledFor} />
    </div>
  )
}

// ---- Card shell -------------------------------------------------------------
function Card({
  title,
  subtitle,
  danger = false,
  children,
}: {
  title: string
  subtitle?: string
  danger?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={`glass-strong rounded-3xl p-6 md:p-7 ${danger ? 'ring-1 ring-danger/25' : ''}`}
    >
      <h2 className={`text-base font-bold ${danger ? 'text-danger' : 'text-ink'}`}>{title}</h2>
      {subtitle && <p className="mb-5 mt-1 text-sm text-ink-muted">{subtitle}</p>}
      {children}
    </section>
  )
}

// ---- 1. Change password (D-05) ---------------------------------------------
function PasswordCard() {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (pw.length < 8) return setError('Password must be at least 8 characters')
    if (pw !== confirm) return setError('The two passwords don’t match')
    setBusy(true)
    setError(null)
    const r = await changePassword(pw)
    setBusy(false)
    if ('error' in r) return setError(r.error)
    setPw('')
    setConfirm('')
    setSaved(true)
  }

  return (
    <Card title="Password" subtitle="Change the password you use to sign in.">
      <div className="flex flex-col gap-3 sm:max-w-sm">
        <PwField
          label="New password"
          value={pw}
          onChange={(v) => {
            setPw(v)
            setSaved(false)
            setError(null)
          }}
          placeholder="At least 8 characters"
        />
        <PwField
          label="Confirm new password"
          value={confirm}
          onChange={(v) => {
            setConfirm(v)
            setSaved(false)
            setError(null)
          }}
          placeholder="Re-type new password"
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || pw.length === 0}
          onClick={save}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <Check size={15} /> Password updated
          </span>
        )}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Sign in with Google or Outlook only? Set a password here to add email + password as a backup
        way in.
      </p>
    </Card>
  )
}

function PwField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <input
        type="password"
        autoComplete="new-password"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
      />
    </label>
  )
}

// ---- 2. Linked sign-in accounts (D-05) -------------------------------------
function LinkedAccountsCard({ identities }: { identities: LinkedIdentity[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sole = identities.length <= 1

  async function unlink(identityId: string) {
    setBusyId(identityId)
    setError(null)
    const r = await unlinkIdentity(identityId)
    setBusyId(null)
    if ('error' in r) return setError(r.error)
    router.refresh()
  }

  return (
    <Card
      title="Linked sign-in accounts"
      subtitle="The accounts you can use to sign in. Keep at least one — it's how you get back in."
    >
      {identities.length === 0 ? (
        <p className="text-sm text-ink-muted">No linked sign-in accounts found.</p>
      ) : (
        <div className="flex flex-col">
          {identities.map((id) => {
            const p = providerOf(id.provider)
            return (
              <div
                key={id.identityId}
                className="flex items-center gap-3 border-t border-black/[0.06] py-3 first:border-t-0"
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold text-white"
                  style={{ background: p.tint }}
                >
                  {p.badge}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{p.label}</p>
                  <p className="truncate text-xs text-ink-muted">{id.email || '—'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <button
                    type="button"
                    disabled={sole || busyId === id.identityId}
                    onClick={() => unlink(id.identityId)}
                    className="shrink-0 rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {busyId === id.identityId ? 'Unlinking…' : 'Unlink'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {sole && identities.length === 1 && (
        <p className="mt-3 inline-flex items-start gap-1.5 text-xs font-medium text-ink-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-info" />
          This is your only way to sign in. Add another sign-in method before unlinking it.
        </p>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Card>
  )
}

// ---- 3. Email (replicated change-email row over the existing action) --------
function EmailCard({ email, pendingEmail }: { email: string; pendingEmail: string | null }) {
  const [editing, setEditing] = useState(false)
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState<string | null>(null)

  const awaiting = pendingEmail ?? requested
  const target = next.trim()
  const canSave = target.length > 0 && target !== email

  async function save() {
    if (!canSave) return
    setBusy(true)
    setError(null)
    const r = await changeEmail(target)
    setBusy(false)
    if ('error' in r) return setError(r.error)
    setRequested(target)
    setEditing(false)
  }

  return (
    <Card title="Email" subtitle="The address you use to sign in and receive account emails.">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-ink-muted">
          <Mail size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{email}</p>
          <p className="text-xs text-ink-muted">Sign-in address</p>
        </div>
        {!awaiting && !editing && (
          <button
            type="button"
            onClick={() => {
              setNext('')
              setError(null)
              setEditing(true)
            }}
            className="shrink-0 rounded-xl border border-brand/40 px-3 py-1.5 text-sm font-semibold text-brand transition hover:bg-brand-soft/20"
          >
            Change email
          </button>
        )}
      </div>

      {awaiting ? (
        <div className="mt-3 rounded-2xl border border-brand/20 bg-brand-soft/10 p-4">
          <p className="text-sm font-semibold text-ink">Confirmation sent to {awaiting}</p>
          <p className="mt-1 text-xs text-ink-muted">
            Open the link we sent to the new address — your sign-in email switches only once the new
            address is verified.
          </p>
        </div>
      ) : editing ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-ink-muted">New email</span>
            <span className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft">
              <Mail size={15} className="shrink-0 text-brand" />
              <input
                type="email"
                autoFocus
                placeholder="you@company.com"
                value={next}
                onChange={(e) => {
                  setNext(e.target.value)
                  setError(null)
                }}
                className="w-full bg-transparent outline-none"
              />
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canSave || busy}
              onClick={save}
              className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
            >
              {busy ? 'Sending…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setNext('')
                setError(null)
              }}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-ink-muted transition hover:bg-black/[0.04] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </Card>
  )
}

// ---- 4. Danger zone (D-09 / D-10 / D-11) -----------------------------------
function DangerZoneCard({ deletionScheduledFor }: { deletionScheduledFor: string | null }) {
  const router = useRouter()
  const [modal, setModal] = useState<null | 'deactivate' | 'delete'>(null)

  if (deletionScheduledFor) {
    return <DeletionScheduledCard scheduledFor={deletionScheduledFor} onCancelled={() => router.refresh()} />
  }

  return (
    <Card
      title="Danger zone"
      danger
      subtitle="These affect your own account. Deactivating is reversible; deleting is permanent after a grace period."
    >
      <div className="flex flex-col divide-y divide-black/[0.06]">
        <div className="flex items-start gap-3 py-3 first:pt-0">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Deactivate account</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Take a break. Your profile is hidden and you’re signed out everywhere. Nothing is
              deleted — sign back in any time to reactivate.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink">Delete account</p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Request permanent deletion (GDPR erasure). Disabled straight away, then scheduled for
              erasure with 30 days to cancel.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setModal('deactivate')}
          className="inline-flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/10"
        >
          <Power size={16} /> Deactivate account
        </button>
        <button
          type="button"
          onClick={() => setModal('delete')}
          className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          <Trash2 size={16} /> Delete account
        </button>
      </div>

      {modal === 'deactivate' && (
        <DeactivateModal onClose={() => setModal(null)} onDone={() => router.push('/login')} />
      )}
      {modal === 'delete' && (
        <DeleteModal onClose={() => setModal(null)} onDone={() => router.refresh()} />
      )}
    </Card>
  )
}

function DeletionScheduledCard({
  scheduledFor,
  onCancelled,
}: {
  scheduledFor: string
  onCancelled: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const when = new Date(scheduledFor)
  const dateLabel = Number.isNaN(when.getTime())
    ? 'in 30 days'
    : `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`

  async function cancel() {
    setBusy(true)
    setError(null)
    const r = await cancelAccountDeletion()
    setBusy(false)
    if ('error' in r) return setError(r.error)
    onCancelled()
  }

  return (
    <Card title="Account scheduled for deletion" danger>
      <div className="flex items-start gap-2 rounded-2xl border border-danger/20 bg-danger/5 p-4">
        <Clock size={16} className="mt-0.5 shrink-0 text-danger" />
        <div className="text-sm text-ink">
          <p className="font-semibold text-danger">Your account will be permanently erased {dateLabel}.</p>
          <p className="mt-1 text-xs text-ink-muted">
            It’s disabled for now. You can cancel any time before then — after that your name, email
            and photo are scrubbed and this can’t be undone.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Cancel deletion — keep my account'}
        </button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </Card>
  )
}

// ---- Modals -----------------------------------------------------------------
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
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
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-ink-muted transition hover:bg-black/[0.05]"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function DeactivateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const r = await deactivateAccount()
    setBusy(false)
    if ('error' in r) return setError(r.error)
    onDone()
  }

  return (
    <Modal title="Deactivate your account?" onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink">
        This is like taking a break. Your profile is hidden, you’re signed out everywhere, and{' '}
        <b>nothing is deleted</b>. Next time you sign in, we’ll ask if you want to reactivate.
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
          {busy ? 'Deactivating…' : 'Deactivate'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const r = await requestAccountDeletion(password)
    setBusy(false)
    if ('error' in r) return setError(r.error)
    onDone()
  }

  return (
    <Modal title="Delete your account" onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink">
        This starts a <b>permanent deletion</b> (GDPR erasure). Your account is disabled straight
        away.
      </p>
      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand/20 bg-brand-soft/10 p-3.5">
        <Clock size={15} className="mt-0.5 shrink-0 text-brand-deep" />
        <p className="text-xs leading-relaxed text-ink">
          <b>You have 30 days to change your mind.</b> Sign in and cancel any time in that window.
          After 30 days your name, email and photo are permanently scrubbed. Your company’s audit
          history is kept in anonymized form, as the law requires.
        </p>
      </div>
      <label className="mt-4 block text-sm">
        <span className="text-ink-muted">Confirm it’s you — enter your password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          placeholder="Your password"
          onChange={(e) => {
            setPassword(e.target.value)
            setError(null)
          }}
          className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>
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
          disabled={busy || password.length === 0}
          onClick={confirm}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Trash2 size={15} /> {busy ? 'Requesting…' : 'Request deletion'}
        </button>
      </div>
    </Modal>
  )
}
