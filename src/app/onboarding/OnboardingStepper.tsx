'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  PartyPopper,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react'
import { Wordmark } from '@/shared/ui/Wordmark'
import { Avatar } from '@/shared/ui/Avatar'
import {
  createCompany,
  markEmailConnected,
  requestToJoin,
  saveCompanyDetails,
  saveProfile,
  searchCompanies,
  withdrawJoin,
  type ActionResult,
  type JoinableCompany,
} from './actions'
import type { RejectPreset } from '@/app/admin/verifications/reject-presets'

type CompanyType = { code: string; description: string }
type ResumeStep = 'connect_email' | 'profile' | 'company_details'
type Prefill = {
  displayName?: string
  title?: string
  phone?: string
  language?: string
  linkedin?: string
  address?: string
  description?: string
  primaryProducts?: string
  website?: string
  companyName?: string
}

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
  // Path B side branch — NOT in FORWARD (it forks off `start`, it is not a step in
  // the linear create-company progress, so it owns no StepDot and no goNext/goBack).
  | 'join_search'
  | 'join_pending'

// The Path B branch lives outside the FORWARD progress; these steps carry their
// own CTAs (like `start`) so StepNav and StepDots opt out of them.
const JOIN_STEPS: Step[] = ['join_search', 'join_pending']

export function OnboardingStepper({
  firstName,
  companyTypes,
  resumeStep = null,
  prefill = {},
  licenceRequired = false,
  rejectionReason = null,
  rejectionPreset = null,
  isDuplicate = false,
  isRejectedResume = false,
  pendingJoin = null,
}: {
  firstName: string | null
  companyTypes: CompanyType[]
  resumeStep?: ResumeStep | null
  prefill?: Prefill
  // Read server-side from REQUIRE_LICENSE (no NEXT_PUBLIC_ prefix) and passed as
  // a prop so this client component never reads process.env directly (D-02).
  licenceRequired?: boolean
  // Rejection-resume props (AUTH-02 / D-07 / D-08). Passed from the Server Component
  // after reading audit_log — no client-side env or DB access needed.
  rejectionReason?: string | null
  rejectionPreset?: RejectPreset | null
  isDuplicate?: boolean
  isRejectedResume?: boolean
  // Path B (D-10): when the company-less requester already has a pending
  // join_request, page.tsx passes its target company name + id (read from the
  // requester's OWN row's metadata, never a company read) so we land on the S2
  // "Request sent" screen instead of the create-company fork.
  pendingJoin?: { companyName: string; requestId: string } | null
}) {
  const router = useRouter()
  // Rejected-resume lands on the company step directly (the company already exists).
  const resuming = resumeStep !== null || isRejectedResume
  const [step, setStep] = useState<Step>(
    pendingJoin
      ? 'join_pending'
      : isRejectedResume
        ? 'company'
        : (resumeStep ?? 'start'),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Company-setup fields — pre-filled for rejected-resume mode.
  const [name, setName] = useState(prefill.companyName ?? '')
  const [country, setCountry] = useState('')
  const [types, setTypes] = useState<Set<string>>(new Set())
  const [files, setFiles] = useState<File[]>([])

  // Profile fields.
  const [displayName, setDisplayName] = useState(prefill.displayName ?? firstName ?? '')
  const [title, setTitle] = useState(prefill.title ?? '')
  const [phone, setPhone] = useState(prefill.phone ?? '')
  const [language, setLanguage] = useState(prefill.language ?? '')
  const [linkedin, setLinkedin] = useState(prefill.linkedin ?? '')

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
    if (licenceRequired && files.length === 0) return setError('Add at least one licence file.')
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
    fd.set('linkedin', linkedin.trim())
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
          {!resuming && !JOIN_STEPS.includes(step) && <StepDots step={step} />}
        </div>

        {step === 'start' && (
          <StartStep
            firstName={firstName}
            onNew={() => setStep('company')}
            onJoin={() => setStep('join_search')}
          />
        )}

        {step === 'join_search' && (
          <JoinSearchStep
            onBackToFork={() => setStep('start')}
            onCreateInstead={() => setStep('company')}
            onRequested={() => setStep('join_pending')}
          />
        )}

        {step === 'join_pending' && (
          <JoinPendingStep
            companyName={pendingJoin?.companyName ?? ''}
            requestId={pendingJoin?.requestId ?? ''}
            onCreateInstead={() => setStep('company')}
            onWithdrawn={() => router.push('/onboarding')}
          />
        )}

        {step === 'company' && (
          <>
            {isRejectedResume && (
              <RejectionBanner
                reason={rejectionReason}
                isDuplicate={isDuplicate}
              />
            )}
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
              licenceRequired={licenceRequired}
            />
          </>
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
            linkedin={linkedin}
            setLinkedin={setLinkedin}
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
          isRejectedResume={isRejectedResume}
          isDuplicate={isDuplicate}
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
  isRejectedResume,
  isDuplicate,
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
  // When isRejectedResume is true, the company step is the fix-and-resubmit form.
  // If isDuplicate is also true, the resubmit CTA is suppressed (D-08).
  isRejectedResume: boolean
  isDuplicate: boolean
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
  // The Path B branch steps own their CTAs + errors internally too.
  if (step === 'start' || step === 'join_search' || step === 'join_pending') return null

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
        {isCompany && !isDuplicate && (
          // Resubmit CTA: shown for fixable rejections and for new-company creation.
          // Suppressed for duplicate_company (D-08) — the banner already guides the user.
          <button type="button" disabled={pending} onClick={onContinueCompany} className={`flex items-center gap-1.5 ${primary}`}>
            {pending
              ? isRejectedResume ? 'Resubmitting…' : 'Creating…'
              : isRejectedResume ? 'Fix and resubmit' : 'Continue'
            }
            {!pending && <ArrowRight size={16} />}
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

function StartStep({
  firstName,
  onNew,
  onJoin,
}: {
  firstName: string | null
  onNew: () => void
  onJoin: () => void
}) {
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
        <button
          type="button"
          onClick={onJoin}
          className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 p-4 text-left transition hover:border-brand hover:bg-white"
        >
          <Users size={22} className="shrink-0 text-brand" />
          <span>
            <span className="block text-sm font-semibold text-ink">Join an existing company</span>
            <span className="block text-xs text-ink-muted">
              Request to join a company that&apos;s already on Hello Sello.
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}

// ---- Path B: S1 search step + S2 pending screen ----------------------------
// Both are local to onboarding; they reuse the same glass card chrome the rest of
// the stepper uses and the TeamClient dialog idiom (Overlay + useTransition +
// {ok}|{error}). The search input is debounced so a fast typist fires one RPC per
// pause, not per keystroke.

const PRIMARY_BTN =
  'rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-50'
const GHOST_BTN =
  'rounded-xl bg-black/[0.04] px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-black/[0.07] disabled:opacity-50'

// The "create a new company instead" escape-hatch link rendered inside the S1
// empty / no-results states (UI-SPEC verbatim copy).
function CreateInsteadLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-brand underline">
      create a new company instead
    </button>
  )
}

function JoinSearchStep({
  onBackToFork,
  onCreateInstead,
  onRequested,
}: {
  onBackToFork: () => void
  onCreateInstead: () => void
  onRequested: () => void
}) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<JoinableCompany[]>([])
  const [searched, setSearched] = useState(false) // a query has been run for the current term
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<JoinableCompany | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const trimmed = term.trim()

  // Debounced search: only fire ~280ms after the user stops typing. A blank term
  // resets to the "start typing" empty state without a round-trip.
  useEffect(() => {
    if (trimmed === '') {
      setResults([])
      setSearched(false)
      setSearching(false)
      return
    }
    setSearching(true)
    const handle = setTimeout(async () => {
      const r = await searchCompanies(trimmed)
      if ('error' in r) {
        setResults([])
      } else {
        setResults(r.rows)
      }
      setSearched(true)
      setSearching(false)
    }, 280)
    return () => clearTimeout(handle)
  }, [trimmed])

  return (
    <div className="flex flex-col gap-4">
      <div className="text-center">
        <h2 className="text-base font-semibold text-ink">Find your company</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Search for your company by name and send a request to join. A Superadmin there approves it.
        </p>
      </div>

      <label className="relative flex items-center">
        <Search size={16} className="pointer-events-none absolute left-3 text-ink-muted" />
        <input
          value={term}
          onChange={(e) => {
            setTerm(e.target.value)
            setSelected(null)
          }}
          autoFocus
          placeholder="Search company name…"
          className="w-full rounded-xl border border-white/70 bg-white/70 py-2 pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>

      {/* Empty (no query yet) */}
      {trimmed === '' && (
        <div className="rounded-2xl border border-white/70 bg-white/50 p-4 text-center text-sm text-ink-muted">
          <p className="font-semibold text-ink">Start typing to find your company</p>
          <p className="mt-1">
            Only verified companies appear here. Can&apos;t find yours? You can{' '}
            <CreateInsteadLink onClick={onCreateInstead} />.
          </p>
        </div>
      )}

      {/* No results for a searched term */}
      {trimmed !== '' && searched && !searching && results.length === 0 && (
        <div className="rounded-2xl border border-white/70 bg-white/50 p-4 text-center text-sm text-ink-muted">
          <p>
            No verified company matches &ldquo;{trimmed}&rdquo;. Check the spelling, or{' '}
            <CreateInsteadLink onClick={onCreateInstead} />.
          </p>
        </div>
      )}

      {/* Result rows */}
      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((c) => {
            const on = selected?.id === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelected(c)}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                    on
                      ? 'border-brand bg-brand-soft/20'
                      : 'border-white/70 bg-white/70 hover:border-brand'
                  }`}
                >
                  <Avatar url={null} name={c.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{c.name}</span>
                    {c.city && <span className="block truncate text-xs text-ink-muted">{c.city}</span>}
                  </span>
                  {on && <CheckCircle2 size={18} className="shrink-0 text-brand" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-2 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToFork}
          className="flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-ink"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => setConfirmOpen(true)}
          className={PRIMARY_BTN}
        >
          Request to join
        </button>
      </div>

      {confirmOpen && selected && (
        <ConfirmJoinDialog
          company={selected}
          onClose={() => setConfirmOpen(false)}
          onRequested={onRequested}
        />
      )}
    </div>
  )
}

function ConfirmJoinDialog({
  company,
  onClose,
  onRequested,
}: {
  company: JoinableCompany
  onClose: () => void
  onRequested: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await requestToJoin(company.id)
      if ('error' in r) {
        setError(r.error) // verbatim server copy, incl. the D-12 duplicate string
        return
      }
      onRequested() // client transition to S2 — no toast (UI-SPEC)
    })
  }

  return (
    <StepperOverlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Request to join {company.name}?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        A Superadmin at {company.name} will review your request. You&apos;ll get access as soon as
        they approve it.
      </p>

      {error && <StepperDialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <button type="button" onClick={onClose} disabled={pending} className={GHOST_BTN}>
          Cancel
        </button>
        <button type="button" onClick={submit} disabled={pending} className={`px-5 py-2.5 ${PRIMARY_BTN}`}>
          {pending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </StepperOverlay>
  )
}

function JoinPendingStep({
  companyName,
  requestId,
  onCreateInstead,
  onWithdrawn,
}: {
  companyName: string
  requestId: string
  onCreateInstead: () => void
  onWithdrawn: () => void
}) {
  const [withdrawOpen, setWithdrawOpen] = useState(false)
  // Defensive fallback — a real RPC submit always stores metadata.company_name, so
  // this only shows for a malformed/legacy row.
  const where = companyName.trim() || 'the company'

  return (
    <div className="flex flex-col gap-4 text-center">
      <span className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-300/15 px-2.5 py-1 text-[11px] font-bold text-amber-700">
        <Clock size={11} /> Pending
      </span>
      <div>
        <h2 className="text-base font-semibold text-ink">Request sent</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Your request to join <span className="font-semibold text-ink">{where}</span> is awaiting
          their approval. We&apos;ll let you know in the app as soon as a Superadmin reviews it.
        </p>
      </div>

      {/* Two equal-weight fallbacks — neither is a brand CTA (UI-SPEC). */}
      <div className="mt-2 flex flex-col gap-2.5">
        <button type="button" onClick={onCreateInstead} className={`w-full ${GHOST_BTN}`}>
          Create my own company instead
        </button>
        <button
          type="button"
          onClick={() => setWithdrawOpen(true)}
          className="w-full rounded-xl border border-danger/20 bg-danger/[0.06] px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10"
        >
          Withdraw request
        </button>
      </div>

      {withdrawOpen && (
        <WithdrawDialog
          companyName={where}
          requestId={requestId}
          onClose={() => setWithdrawOpen(false)}
          onWithdrawn={onWithdrawn}
        />
      )}
    </div>
  )
}

function WithdrawDialog({
  companyName,
  requestId,
  onClose,
  onWithdrawn,
}: {
  companyName: string
  requestId: string
  onClose: () => void
  onWithdrawn: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    setError(null)
    startTransition(async () => {
      const r = await withdrawJoin(requestId)
      if ('error' in r) {
        setError(r.error)
        return
      }
      onWithdrawn() // re-render /onboarding → no pending row → start fork
    })
  }

  return (
    <StepperOverlay onClose={onClose}>
      <h2 className="text-lg font-bold tracking-tight text-ink">Withdraw your request?</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
        This cancels your request to join <span className="font-semibold text-ink">{companyName}</span>.
        You can search and request a different company, or create your own.
      </p>

      {error && <StepperDialogError message={error} />}

      <div className="mt-6 flex justify-end gap-2.5">
        <button type="button" onClick={onClose} disabled={pending} className={GHOST_BTN}>
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="rounded-xl bg-danger px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
        >
          {pending ? 'Withdrawing…' : 'Withdraw'}
        </button>
      </div>
    </StepperOverlay>
  )
}

// Local copies of the TeamClient Overlay + DialogError shells (SP-5 idiom). They
// live in a different route module, so re-declaring the thin shell here keeps the
// onboarding card self-contained rather than reaching across routes.
function StepperOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-deep/20 p-6 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="presentation"
    >
      <div role="dialog" aria-modal="true" className="glass-strong relative w-full max-w-md rounded-3xl p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-lg p-1 text-ink-muted transition hover:bg-black/[0.05] hover:text-ink"
        >
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )
}

function StepperDialogError({ message }: { message: string }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger/[0.07] px-3.5 py-3 text-sm font-semibold leading-snug text-danger">
      <AlertCircle size={16} className="mt-px shrink-0" />
      <span>{message}</span>
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
  licenceRequired,
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
  licenceRequired: boolean
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
          Licence or certificate{licenceRequired ? '' : ' (optional while testing)'}
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
  linkedin,
  setLinkedin,
}: {
  displayName: string
  setDisplayName: (v: string) => void
  title: string
  setTitle: (v: string) => void
  phone: string
  setPhone: (v: string) => void
  language: string
  setLanguage: (v: string) => void
  linkedin: string
  setLinkedin: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-ink">Complete your profile</h2>
      <Field label="Display name" value={displayName} onChange={setDisplayName} />
      <Field label="Title / role" value={title} onChange={setTitle} placeholder="Head of Procurement" />
      <Field label="Phone" value={phone} onChange={setPhone} type="tel" />
      <Field label="Language" value={language} onChange={setLanguage} placeholder="English" />
      <Field label="LinkedIn" value={linkedin} onChange={setLinkedin} placeholder="linkedin.com/in/…" />
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

/**
 * Rejection banner shown at the top of the company-setup step when the user is
 * in rejected-resume mode (AUTH-02 / D-07 / D-08).
 *
 * - duplicate_company preset → Path B "join existing" message; no resubmit (D-08).
 * - all other presets (fixable) → rejection reason + "Fix and resubmit" affordance.
 *   The resubmit button is the normal "Continue" in StepNav — this banner just
 *   contextualises the action.
 */
function RejectionBanner({
  reason,
  isDuplicate,
}: {
  reason: string | null
  isDuplicate: boolean
}) {
  if (isDuplicate) {
    return (
      <div
        data-testid="rejection-banner"
        className="mb-4 flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-4"
      >
        <div className="flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-sm font-semibold text-ink">Company already exists on Hello Sello</p>
        </div>
        <p className="text-sm text-ink-muted">
          A company with this name already exists on Hello Sello. Instead of creating a new one,
          ask your company admin to invite you — or{' '}
          <a href="mailto:support@hello-sello.com" className="underline">
            contact Hello Sello support
          </a>{' '}
          to get linked to the right account.
        </p>
      </div>
    )
  }

  return (
    <div
      data-testid="rejection-banner"
      className="mb-4 flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger/10 p-4"
    >
      <div className="flex items-start gap-2">
        <AlertCircle size={16} className="mt-0.5 shrink-0 text-danger" />
        <p className="text-sm font-semibold text-ink">Your application was rejected</p>
      </div>
      {reason && <p className="text-sm text-ink-muted">{reason}</p>}
      <p className="text-sm text-ink-muted">
        Please correct the details below and resubmit for review.
      </p>
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
