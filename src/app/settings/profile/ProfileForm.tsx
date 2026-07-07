'use client'

import { useState } from 'react'
import { User, Mail, Phone, Languages, Link2, Check } from 'lucide-react'
import { AvatarUpload } from '@/shared/ui/AvatarUpload'
import type { MyProfile } from '@/modules/profile'
import { saveMyProfile, saveAvatar } from '@/app/account/actions'

/**
 * The re-homed personal-profile form (SET-01 / D-04). This mirrors the shape of
 * the old AccountClient ProfileForm but stands alone at /settings/profile and
 * reuses the SAME `saveMyProfile` / `saveAvatar` server actions + the shared
 * AvatarUpload — one writer, not a fork (AccountClient itself is left untouched,
 * since 13-08/13-10 also reference it).
 *
 * Explicit edit/save affordance (Muskan): fields edit live, but nothing persists
 * until Save, and Save shows a visible "Saved" confirmation — never a silent swap.
 */
export function ProfileForm({ profile }: { profile: MyProfile }) {
  const initial = {
    displayName: profile.displayName,
    title: profile.title,
    phone: profile.phone,
    language: profile.language,
    linkedin: profile.linkedin,
  }
  const [base, setBase] = useState(initial)
  const [f, setF] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(f) !== JSON.stringify(base)
  const set = (k: keyof typeof f, v: string) => {
    setF((s) => ({ ...s, [k]: v }))
    setSaved(false)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const r = await saveMyProfile(f)
    setBusy(false)
    if (r.error) return setError(r.error)
    setBase(f)
    setSaved(true)
  }

  return (
    <section className="glass-strong rounded-3xl p-6 md:p-7">
      <h1 className="text-lg font-bold text-ink">Profile</h1>
      <p className="mb-6 text-sm text-ink-muted">
        Your personal details on Hello Sello. Company details live under Organization → Company
        profile.
      </p>

      <AvatarUpload
        personId={profile.id}
        name={f.displayName}
        initialUrl={profile.avatarUrl}
        onSaved={saveAvatar}
      />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full name" value={f.displayName} onChange={(v) => set('displayName', v)} icon={User} />
        <Field label="Title / role" value={f.title} onChange={(v) => set('title', v)} placeholder="Head of Procurement" />
        <Field label="Phone" value={f.phone} onChange={(v) => set('phone', v)} icon={Phone} type="tel" />
        <Field label="Language" value={f.language} onChange={(v) => set('language', v)} icon={Languages} placeholder="English" />
        <Field label="LinkedIn" value={f.linkedin} onChange={(v) => set('linkedin', v)} icon={Link2} placeholder="linkedin.com/in/…" />
        <ReadOnly label="Email (sign-in)" value={profile.email} icon={Mail} />
      </div>

      <div className="mt-7 flex items-center justify-end gap-3 border-t border-white/60 pt-4">
        {error && <span className="mr-auto text-sm text-danger">{error}</span>}
        {saved && !dirty && (
          <span className="mr-auto inline-flex items-center gap-1 text-sm text-success">
            <Check size={15} /> Saved
          </span>
        )}
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={save}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  icon: Icon,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  icon?: typeof Mail
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft">
        {Icon && <Icon size={15} className="shrink-0 text-brand" />}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent outline-none"
        />
      </span>
    </label>
  )
}

function ReadOnly({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof Mail }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-white/50 bg-black/[0.03] px-3 py-2 text-ink-muted">
        {Icon && <Icon size={15} className="shrink-0" />}
        <span className="truncate">{value || '—'}</span>
      </span>
    </label>
  )
}
