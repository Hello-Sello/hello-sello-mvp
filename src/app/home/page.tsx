import { redirect } from 'next/navigation'
import { AlertTriangle, Clock } from 'lucide-react'
import { createClient } from '@/shared/db/server'
import { getCurrentPerson } from '@/shared/auth'
import { OnboardingChecklist, type ChecklistItem } from './OnboardingChecklist'

/**
 * Logged-in landing (1d stub today; hosts the 1c onboarding tail). A user with
 * no company is still mid-onboarding, so bounce them back to the stepper.
 *
 * Verification-state branches (AUTH-02 / AUTH-03):
 *  - pending  → show VerificationBanner + the checklist
 *  - rejected → redirect to /onboarding (reason banner + resubmit live there, 04-03)
 *  - revoked  → render SuspendedBanner hard-block; no Discover/Connect affordances (D-10)
 *  - verified → render the normal welcome page
 */
export default async function HomePage() {
  const person = await getCurrentPerson()
  if (!person) redirect('/login')
  if (!person.company_id) redirect('/onboarding')

  const supabase = await createClient()
  const { data: company } = await supabase
    .from('company')
    .select('name, verification_status')
    .eq('id', person.company_id)
    .maybeSingle()

  const status = company?.verification_status

  // Rejected: the resubmit / reason banner lives on /onboarding (Task 2 / D-07).
  // onboarding/page.tsx exempts rejected from its company_id guard so there is no loop.
  if (status === 'rejected') redirect('/onboarding')

  // Revoked: hard-block with a suspended banner — no gated nav (D-10 / AUTH-03).
  if (status === 'revoked') {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
        <SuspendedBanner />
      </div>
    )
  }

  const pending = status === 'pending'
  const flags =
    ((person.preferences ?? {}) as { onboarding?: Record<string, boolean> }).onboarding ?? {}

  const items: ChecklistItem[] = [
    { key: 'connect_email', label: 'Connect your email', done: !!flags.email_connected },
    { key: 'profile', label: 'Complete your profile', done: !!flags.profile },
    { key: 'company_details', label: 'Add company details', done: !!flags.company_details },
  ]

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-4">
      {pending && <VerificationBanner />}

      <div>
        <h1 className="text-xl font-semibold text-ink">
          Welcome{person.first_name ? `, ${person.first_name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">{company?.name}</p>
      </div>

      <OnboardingChecklist items={items} />
    </div>
  )
}

function VerificationBanner() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-info/30 bg-info/10 p-4">
      <Clock size={18} className="mt-0.5 shrink-0 text-info" />
      <div className="text-sm">
        <p className="font-semibold text-ink">Verification pending</p>
        <p className="mt-0.5 text-ink-muted">
          The Hello Sello team is reviewing your licence. You can finish setting up
          internally — connecting, discovering and dealing unlock once you&apos;re verified.
        </p>
      </div>
    </div>
  )
}

/**
 * Hard-block banner for revoked companies (AUTH-03 / D-10).
 * Discover and Connect affordances are not rendered when this is shown.
 */
function SuspendedBanner() {
  return (
    <div data-testid="suspended-banner" className="flex items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-4">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
      <div className="text-sm">
        <p className="font-semibold text-ink">Your access has been suspended</p>
        <p className="mt-0.5 text-ink-muted">
          Your company&apos;s access to Hello Sello has been suspended. Please contact{' '}
          <a href="mailto:support@hello-sello.com" className="underline">
            Hello Sello support
          </a>{' '}
          if you believe this is a mistake.
        </p>
      </div>
    </div>
  )
}
