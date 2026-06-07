'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  PartyPopper,
  Plus,
  Users,
  X,
} from 'lucide-react'
import { Wordmark } from '@/shared/ui/Wordmark'
import {
  createCompany,
  markEmailConnected,
  saveCompanyDetails,
  saveProfile,
  type ActionResult,
} from './actions'

type CompanyType = { code: string; description: string }
type ResumeStep = 'connect_email' | 'profile' | 'company_details'
type Prefill = {
  displayName?: string
  title?: string
  phone?: string
  language?: string
  address?: string
  description?: string
  primaryProducts?: string
  website?: string
}

// TEMP (testing, 2026-06-08): licence upload made optional so test runs don't
// fill the bucket with throwaway files. The 2026-05-25 lock makes it REQUIRED —
// flip this back to `true` (here AND in actions.ts) before shipping.
const LICENCE_REQUIRED = false

// ISO-2 codes for the markets the MVP cares about (company.country is a bare
// CHAR(2), not a DB lookup, so this short list is the authoritative UI set).
const COUNTRIES: { code: string; name: string }[] = [
  { code: 'DE', name: 'Germany' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AT', name: 'Austria' },
  { code: 'ES', name: 'Spain' },
  { code: 'PT', name: 'Portugal' },
  { code: 'IT', name: 'Italy' },
  { code: 'FR', name: 'France' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
]

// The forced creation steps, then the skippable modal sequence. Team setup is
// deliberately NOT here — it moved to Settings (decision 2026-06-08).
const FORWARD: Step[] = [
  'start',
  'company',
  'submitted',
  'connect_email',
  'profile',
  'company_details',
  'welcome',
]

type Step =
  | 'start'
  | 'company'
  | 'submitted'
  | 'connect_email'
  | 'profile'
  | 'company_details'
  | 'welcome'

export function OnboardingStepper({
  firstName,
  companyTypes,
  resumeStep = null,
  prefill = {},
}: {
  firstName: string | null
  companyTypes: CompanyType[]
  resumeStep?: ResumeStep | null
  prefill?: Prefill
}) {
  const router = useRouter()
  const resuming = resumeStep !== null
  const [step, setStep] = useState<Step>(resumeStep ?? 'start')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Company-setup fields.
  const [name, setName] = useState('')
  const [country, setCountry] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<File[]>([])

  // Profile fields.
  const [displayName, setDisplayName] = useState(prefill.displayName ?? firstName ?? '')
  const [title, setTitle] = useState(prefill.title ?? '')
  const [phone, setPhone] = useState(prefill.phone ?? '')
  const [language, setLanguage] = useState(prefill.language ?? '')

  // Company-details fields.
  const [address, setAddress] = useState(prefill.address ?? '')
  const [description, setDescription] = useState(prefill.description ?? '')
  const [primaryProducts, setPrimaryProducts] = useState(prefill.primaryProducts ?? '')
  const [website, setWebsite] = useState(prefill.website ?? '')

  // Advance forward through the sequence, or finish (resume = one step → home).
  function goNext() {
    if (resuming) {
      router.push('/home')
      return
    }
    const i = FORWARD.indexOf(step)
    setStep(FORWARD[Math.min(i + 1, FORWARD.length - 1)])
  }

  function goBack() {
    setError(null)
    const i = FORWARD.indexOf(step)
    setStep(FORWARD[Math.max(i - 1, 0)])
  }

  // Run a server action; on success advance, on error surface it inline.
  async function submit(action: () => Promise<ActionResult>) {
    setPending(true)
    setError(null)
    try {
      const result = await action()
      if ('error' in result) {
        setError(result.error)
        return
      }
      goNext()
    } finally {
      setPending(false)
    }
  }

  function toggleType(code: string) {
    setTypes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  function submitCompany() {
    if (!name.trim()) return setError('Enter your company name.')
    if (country.length !== 2) return setError('Pick your country.')
    if (types.size === 0) return setError('Pick at least one business category.')
    if (LICENCE_REQUIRED && files.length === 0) return setError('Add at least one licence file.')
    const fd = new FormData()
    fd.set('name', name.trim())
    fd.set('country', country)
    types.forEach((t) => fd.append('type_codes', t))
    files.forEach((f) => fd.append('files', f))
    submit(() => createCompany(fd))
  }

  function submitProfile() {
    const fd = new FormData()
    fd.set('display_name', displayName.trim())
    fd.set('title', title.trim())
    fd.set('phone', phone.trim())
    fd.set('language', language.trim())
    submit(() => saveProfile(fd))
  }

  function submitCompanyDetails() {
    const fd = new FormData()
    fd.set('address', address.trim())
    fd.set('description', description.trim())
    fd.set('primary_products', primaryProducts.trim())
    fd.set('website', website.trim())
    submit(() => saveCompanyDetails(fd))
  }

  return (
    // Fixed overlay so onboarding is chrome-free without touching AppShell.
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-gradient-to-b from-white to-brand-soft/40 p-6">
      <div className="glass-strong w-full max-w-md rounded-3xl p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Wordmark />
          {!resuming && <StepDots step={step} />}
        </div>

        {step === 'start' && (
          <StartStep firstName={firstName} onNew={() => setStep('company')} />
        )}

        {step === 'company' && (
          <CompanyStep
            name={name}
            setName={setName}
            country={country}
            setCountry={setCountry}
            types={types}
            companyTypes={companyTypes}
            onToggleType={toggleType}
            files={files}
            onAddFiles={(fl) => setFiles((cur) => [...cur, ...fl])}
            onRemoveFile={(i) => setFiles((cur) => cur.filter((_, idx) => idx !== i))}
          />
        )}

        {step === 'submitted' && <SubmittedStep />}

        {step === 'connect_email' && <ConnectEmailStep />}

        {step === 'profile' && (
          <ProfileStep
            displayName={displayName}
            setDisplayName={setDisplayName}
            title={title}
            setTitle={setTitle}
            phone={phone}
            setPhone={setPhone}
            language={language}
            setLanguage={setLanguage}
          />
        )}

        {step === 'company_details' && (
          <CompanyDetailsStep
            address={address}
            setAddress={setAddress}
            description={description}
            setDescription={setDescription}
            primaryProducts={primaryProducts}
            setPrimaryProducts={setPrimaryProducts}
            website={website}
            setWebsite={setWebsite}
          />
        )}

        {step === 'welcome' && <WelcomeStep firstName={firstName} />}

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <StepNav
          step={step}
          resuming={resuming}
          pending={pending}
          onBack={goBack}
          onContinueCompany={submitCompany}
          onContinueInfo={goNext}
          onConnectEmail={() => submit(markEmailConnected)}
          onSaveProfile={submitProfile}
          onSaveCompanyDetails={submitCompanyDetails}
          onSkip={goNext}
          onEnter={() => router.push('/home')}
        />
      </div>
    </div>
  )
}

function StepNav({
  step,
  resuming,
  pending,
  onBack,
  onContinueCompany,
  onContinueInfo,
  onConnectEmail,
  onSaveProfile,
  onSaveCompanyDetails,
  onSkip,
  onEnter,
}: {
  step: Step
  resuming: boolean
  pending: boolean
  onBack: () => void
  onContinueCompany: () => void
  onContinueInfo: () => void
  onConnectEmail: () => void
  onSaveProfile: () => void
  onSaveCompanyDetails: () => void
  onSkip: () => void
  onEnter: () => void
}) {
  // 'start' has its own CTA inside the step body; welcome has a single Enter CTA.
  if (step === 'start') return null

  const primary = 'rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-60'
  const skip = 'text-sm font-medium text-ink-muted transition hover:text-ink'

  if (step === 'welcome') {
    return (
      <button type="button" onClick={onEnter} className={`mt-6 w-full ${primary}`}>
        Enter Hello Sello →
      </button>
    )
  }

  // Steps with a save/skip pair (or connect/skip). Skip / Back placement:
  // resume mode shows just the step, so "Back" is replaced by "Skip" → home.
  const isCompany = step === 'company'
  const isSubmitted = step === 'submitted'
  const skippable = step === 'connect_email' || step === 'profile' || step === 'company_details'

  return (
    <div className="mt-6 flex items-center justify-between">
      {resuming || isSubmitted ? (
        skippable ? (
          <button type="button" onClick={onSkip} className={skip}>
            Skip for now
          </button>
        ) : (
          <span />
        )
      ) : (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}

      <div className="flex items-center gap-3">
        {!resuming && skippable && (
          <button type="button" onClick={onSkip} className={skip}>
            Skip
          </button>
        )}
        {isCompany && (
          <button type="button" disabled={pending} onClick={onContinueCompany} className={`flex items-center gap-1.5 ${primary}`}>
            {pending ? 'Creating…' : 'Continue'} {!pending && <ArrowRight size={16} />}
          </button>
        )}
        {isSubmitted && (
          <button type="button" onClick={onContinueInfo} className={`flex items-center gap-1.5 ${primary}`}>
            Continue <ArrowRight size={16} />
          </button>
        )}
        {step === 'connect_email' && (
          <button type="button" disabled={pending} onClick={onConnectEmail} className={primary}>
            {pending ? 'Connecting…' : 'Connect'}
          </button>
        )}
        {step === 'profile' && (
          <button type="button" disabled={pending} onClick={onSaveProfile} className={primary}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        )}
        {step === 'company_details' && (
          <button type="button" disabled={pending} onClick={onSaveCompanyDetails} className={primary}>
            {pending ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

function StepDots({ step }: { step: Step }) {
  const i = FORWARD.indexOf(step)
  return (
    <div className="flex items-center gap-1.5">
      {FORWARD.map((s, idx) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            idx === i ? 'w-6 bg-brand' : idx < i ? 'w-1.5 bg-brand' : 'w-1.5 bg-ink-muted/30'
          }`}
        />
      ))}
    </div>
  )
}

function StartStep({ firstName, onNew }: { firstName: string | null; onNew: () => void }) {
  return (
    <div className="text-center">
      <h1 className="text-lg font-semibold text-ink">
        Welcome{firstName ? `, ${firstName}` : ''} 👋
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Set up your company to start trading on Hello Sello.
      </p>
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={onNew}
          className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 text-left transition hover:border-brand hover:bg-white"
        >
          <Building2 size={22} className="shrink-0 text-brand" />
          <span>
            <span className="block text-sm font-semibold text-ink">Create a new company</span>
            <span className="block text-xs text-ink-muted">
              Register your business and upload its licence for review.
            </span>
          </span>
        </button>
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-ink-muted/30 p-4 text-left opacity-60">
          <Users size={22} className="shrink-0 text-ink-muted" />
          <span>
            <span className="block text-sm font-semibold text-ink">Join an existing company</span>
            <span className="block text-xs text-ink-muted">Coming soon</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function CompanyStep({
  name,
  setName,
  country,
  setCountry,
  types,
  companyTypes,
  onToggleType,
  files,
  onAddFiles,
  onRemoveFile,
}: {
  name: string
  setName: (v: string) => void
  country: string
  setCountry: (v: string) => void
  types: Set<string>
  companyTypes: CompanyType[]
  onToggleType: (code: string) => void
  files: File[]
  onAddFiles: (files: File[]) => void
  onRemoveFile: (index: number) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">About your company</h2>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-muted">Company name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="GreenLeaf Cultivation GmbH"
          className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-muted">Country</span>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        >
          <option value="">Select…</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">Business categories</span>
        <div className="flex flex-wrap gap-2">
          {companyTypes.map((t) => {
            const on = types.has(t.code)
            return (
              <button
                key={t.code}
                type="button"
                onClick={() => onToggleType(t.code)}
                title={t.description}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition ${
                  on
                    ? 'border-brand bg-brand text-white'
                    : 'border-white/70 bg-white/70 text-ink hover:border-brand'
                }`}
              >
                {t.code}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-muted">
          Licence or certificate{LICENCE_REQUIRED ? '' : ' (optional while testing)'}
        </span>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-brand/40 bg-white/50 p-5 text-center transition hover:bg-white/80">
          <Plus size={20} className="text-brand" />
          <span className="text-sm font-medium text-ink">Add a file</span>
          <span className="text-xs text-ink-muted">PDF or image, up to 20 MB</span>
          <input
            type="file"
            multiple
            accept="application/pdf,image/jpeg,image/png,image/heic"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAddFiles(Array.from(e.target.files))
              e.target.value = ''
            }}
          />
        </label>
        {files.length > 0 && (
          <ul className="flex flex-col gap-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm"
              >
                <FileText size={16} className="shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                <span className="shrink-0 text-xs text-ink-muted">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(i)}
                  className="shrink-0 text-ink-muted transition hover:text-danger"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function SubmittedStep() {
  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
        <CheckCircle2 size={30} className="text-success" />
      </span>
      <h2 className="text-base font-semibold text-ink">Application submitted</h2>
      <p className="mt-2 text-sm text-ink-muted">
        We&apos;ve received your company information. The Hello Sello team will verify your
        account within 12 hours and email you once it&apos;s complete.
      </p>
      <p className="mt-2 text-sm text-ink-muted">
        In the meantime, finish setting up your account.
      </p>
    </div>
  )
}

function ConnectEmailStep() {
  return (
    <div className="flex flex-col gap-4 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/40">
        <Mail size={22} className="text-brand" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-ink">Connect your email</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Import your business contacts to find partners faster.
        </p>
      </div>
      <p className="rounded-xl bg-info/10 px-3 py-2 text-left text-xs text-ink-muted">
        <span className="font-medium text-ink">GDPR-safe:</span> metadata only — no subject
        lines, no email bodies, no third-party enrichment.
      </p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
      />
    </label>
  )
}

function ProfileStep({
  displayName,
  setDisplayName,
  title,
  setTitle,
  phone,
  setPhone,
  language,
  setLanguage,
}: {
  displayName: string
  setDisplayName: (v: string) => void
  title: string
  setTitle: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  language: string
  setLanguage: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">Complete your profile</h2>
      <Field label="Display name" value={displayName} onChange={setDisplayName} />
      <Field label="Title / role" value={title} onChange={setTitle} placeholder="Head of Procurement" />
      <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
      <Field label="Language" value={language} onChange={setLanguage} placeholder="English" />
    </div>
  )
}

function CompanyDetailsStep({
  address,
  setAddress,
  description,
  setDescription,
  primaryProducts,
  setPrimaryProducts,
  website,
  setWebsite,
}: {
  address: string
  setAddress: (v: string) => void
  description: string
  setDescription: (v: string) => void
  primaryProducts: string
  setPrimaryProducts: (v: string) => void
  website: string
  setWebsite: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">Add company details</h2>
      <Field label="Street address" value={address} onChange={setAddress} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-ink-muted">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>
      <Field label="Primary products" value={primaryProducts} onChange={setPrimaryProducts} placeholder="Dried flower, extracts" />
      <Field label="Website" value={website} onChange={setWebsite} type="url" placeholder="https://" />
    </div>
  )
}

function WelcomeStep({ firstName }: { firstName: string | null }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft/40">
        <PartyPopper size={30} className="text-brand" />
      </span>
      <h2 className="text-base font-semibold text-ink">
        Welcome to Hello Sello{firstName ? `, ${firstName}` : ''}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        You&apos;re all set. While your company is being verified, you can explore the platform
        and finish any setup steps you skipped from the home checklist.
      </p>
    </div>
  )
}
