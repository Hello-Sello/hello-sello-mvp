'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, User, Building2, Settings as SettingsIcon, Mail, Phone, Languages,
  Link2, Globe, MapPin, Tag, Clock, CheckCircle2, LogOut, Check, Copy, ExternalLink,
} from 'lucide-react'
import { Avatar } from '@/shared/ui/Avatar'
import { AvatarUpload } from '@/shared/ui/AvatarUpload'
import { signOut } from '@/app/(auth)/actions'
import type { MyProfile } from '@/modules/profile'
import type { CompanyProfile } from '@/modules/companies'
import { saveMyProfile, saveCompanyProfile, saveAvatar } from './actions'

type Tab = 'profile' | 'company' | 'settings'

export function AccountClient({ profile, company, initialTab = 'profile' }: { profile: MyProfile; company: CompanyProfile | null; initialTab?: Tab }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [dirty, setDirty] = useState(false)

  function back() {
    if (dirty && !confirm('You have unsaved changes. Leave anyway?')) return
    router.back()
  }
  // switching tabs with unsaved edits warns too (keeps work safe)
  function switchTab(t: Tab) {
    if (dirty && t !== tab && !confirm('You have unsaved changes. Switch anyway?')) return
    setDirty(false)
    setTab(t)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <button
        onClick={back}
        className="mb-5 inline-flex items-center gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 text-sm font-medium text-ink shadow-sm ring-1 ring-black/5 transition hover:bg-white"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="glass-strong h-fit w-full shrink-0 rounded-2xl p-3 md:w-56">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Account</p>
          <TabBtn active={tab === 'profile'} onClick={() => switchTab('profile')} icon={User} label="My Profile" />
          <TabBtn active={tab === 'company'} onClick={() => switchTab('company')} icon={Building2} label="Company Profile" />
          <TabBtn active={tab === 'settings'} onClick={() => switchTab('settings')} icon={SettingsIcon} label="Settings" />
        </nav>

        <section className="glass-strong flex-1 rounded-3xl p-7">
          {tab === 'profile' && <ProfileForm profile={profile} onDirty={setDirty} />}
          {tab === 'company' && <CompanyForm company={company} onDirty={setDirty} />}
          {tab === 'settings' && <SettingsPanel email={profile.email} />}
        </section>
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof User; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition ${active ? 'bg-brand text-white' : 'text-ink hover:bg-white/70'}`}
    >
      <Icon size={16} /> {label}
    </button>
  )
}

// ---- My Profile -------------------------------------------------------------
function ProfileForm({ profile, onDirty }: { profile: MyProfile; onDirty: (d: boolean) => void }) {
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
    onDirty(JSON.stringify({ ...f, [k]: v }) !== JSON.stringify(base))
  }
  async function save() {
    setBusy(true)
    setError(null)
    const r = await saveMyProfile(f)
    setBusy(false)
    if (r.error) return setError(r.error)
    setBase(f)
    setSaved(true)
    onDirty(false)
  }

  return (
    <Panel title="My Profile" subtitle="How you appear on your card and to partners.">
      <AvatarUpload personId={profile.id} name={f.displayName} initialUrl={profile.avatarUrl} onSaved={saveAvatar} />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Display name" value={f.displayName} onChange={(v) => set('displayName', v)} icon={User} />
        <Field label="Title / role" value={f.title} onChange={(v) => set('title', v)} placeholder="Head of Procurement" />
        <Field label="Phone" value={f.phone} onChange={(v) => set('phone', v)} icon={Phone} type="tel" />
        <Field label="Language" value={f.language} onChange={(v) => set('language', v)} icon={Languages} placeholder="English" />
        <Field label="LinkedIn" value={f.linkedin} onChange={(v) => set('linkedin', v)} icon={Link2} placeholder="linkedin.com/in/…" />
        <ReadOnly label="Email (sign-in)" value={profile.email} icon={Mail} />
      </div>
      {profile.publicHandle && <PublicProfileCallout handle={profile.publicHandle} name={profile.displayName} url={profile.avatarUrl} />}
      <SaveBar busy={busy} dirty={dirty} saved={saved} error={error} onSave={save} />
    </Panel>
  )
}

function PublicProfileCallout({ handle, name, url }: { handle: string; name: string; url: string | null }) {
  const [copied, setCopied] = useState(false)
  const path = `/c/${handle}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`)
      setCopied(true)
    } catch {
      /* clipboard blocked — ignore */
    }
  }
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-brand/20 bg-brand-soft/10 p-4">
      <Avatar url={url} name={name} size={48} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">Your public profile</p>
        <p className="truncate text-xs text-ink-muted">{`hello-sello.com${path}`}</p>
      </div>
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-xl border border-brand/40 px-3 py-2 text-sm font-semibold text-brand">
        {copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}
      </button>
      <a href={path} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white">
        <ExternalLink size={15} /> View
      </a>
    </div>
  )
}

// ---- Company Profile --------------------------------------------------------
function CompanyForm({ company, onDirty }: { company: CompanyProfile | null; onDirty: (d: boolean) => void }) {
  if (!company) {
    return (
      <Panel title="Company Profile" subtitle="Your company details.">
        <p className="text-sm text-ink-muted">You&apos;re not linked to a company yet. Finish onboarding to set one up.</p>
      </Panel>
    )
  }
  return <CompanyFormInner company={company} onDirty={onDirty} />
}

function CompanyFormInner({ company, onDirty }: { company: CompanyProfile; onDirty: (d: boolean) => void }) {
  const initial = {
    tagline: company.tagline,
    address: company.address,
    description: company.description,
    primaryProducts: company.primaryProducts,
    website: company.website,
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
    onDirty(JSON.stringify({ ...f, [k]: v }) !== JSON.stringify(base))
  }
  async function save() {
    setBusy(true)
    setError(null)
    const r = await saveCompanyProfile(f)
    setBusy(false)
    if (r.error) return setError(r.error)
    setBase(f)
    setSaved(true)
    onDirty(false)
  }

  return (
    <Panel title="Company Profile" subtitle="Your company details, shown on your public profile.">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft/40 text-brand"><Building2 size={22} /></span>
          <h3 className="text-base font-semibold text-ink">{company.name}</h3>
        </div>
        <VerifyBadge status={company.verificationStatus} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReadOnly label="Company name" value={company.name} icon={Building2} />
        <ReadOnly label="Country" value={company.country} icon={MapPin} />
        <Field label="Tagline" value={f.tagline} onChange={(v) => set('tagline', v)} placeholder="Medical cannabis distribution…" />
        <Field label="Website" value={f.website} onChange={(v) => set('website', v)} icon={Globe} type="url" />
        <Field label="Address" value={f.address} onChange={(v) => set('address', v)} icon={MapPin} />
        <Field label="Primary products" value={f.primaryProducts} onChange={(v) => set('primaryProducts', v)} icon={Tag} />
      </div>
      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span className="text-ink-muted">Description</span>
        <textarea
          value={f.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          className="resize-none rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>
      <SaveBar busy={busy} dirty={dirty} saved={saved} error={error} onSave={save} />
    </Panel>
  )
}

function VerifyBadge({ status }: { status: string }) {
  return status === 'verified' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success"><CheckCircle2 size={13} /> Verified</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-info/10 px-3 py-1 text-xs font-semibold text-info"><Clock size={13} /> Verification pending</span>
  )
}

// ---- Settings ---------------------------------------------------------------
function SettingsPanel({ email }: { email: string }) {
  return (
    <Panel title="Settings" subtitle="Account and sign-out. More options coming soon.">
      <div className="divide-y divide-black/5">
        <Row icon={Mail} label="Email" sub={email} right={<span className="text-xs text-ink-muted">sign-in address</span>} />
        <Row icon={SettingsIcon} label="Theme" sub="Light is the current platform theme" right={<span className="rounded-full bg-brand-soft/40 px-2.5 py-0.5 text-xs font-medium text-brand-deep">Light</span>} />
      </div>
      <form action={signOut} className="mt-6 rounded-2xl border border-danger/20 bg-danger/5 p-4">
        <button type="submit" className="inline-flex items-center gap-2 text-sm font-semibold text-danger"><LogOut size={16} /> Sign out</button>
      </form>
    </Panel>
  )
}

// ---- shared bits ------------------------------------------------------------
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <>
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <p className="mb-6 text-sm text-ink-muted">{subtitle}</p>
      {children}
    </>
  )
}
function Field({ label, value, onChange, placeholder, type = 'text', icon: Icon }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; icon?: typeof Mail }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-ink focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft">
        {Icon && <Icon size={15} className="shrink-0 text-brand" />}
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-transparent outline-none" />
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
function Row({ icon: Icon, label, sub, right }: { icon: typeof Mail; label: string; sub?: string; right: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-1 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/[0.04] text-ink-muted"><Icon size={17} /></span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium text-ink">{label}</p>{sub && <p className="truncate text-xs text-ink-muted">{sub}</p>}</div>
      <div className="shrink-0">{right}</div>
    </div>
  )
}
function SaveBar({ busy, dirty, saved, error, onSave }: { busy: boolean; dirty: boolean; saved: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="mt-7 flex items-center justify-end gap-3 border-t border-white/60 pt-4">
      {error && <span className="mr-auto text-sm text-danger">{error}</span>}
      {saved && !dirty && <span className="mr-auto inline-flex items-center gap-1 text-sm text-success"><Check size={15} /> Saved</span>}
      <button
        type="button"
        disabled={!dirty || busy}
        onClick={onSave}
        className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}
