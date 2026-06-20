import { redirect } from 'next/navigation'
import { AlertTriangle, Clock } from 'lucide-react'
import { createClient } from '@/shared/db/server'
import { getCurrentPerson } from '@/shared/auth'
import { isProfileComplete } from '@/modules/profile'
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

  const companyId = person.company_id

  const supabase = await createClient()

  // Fetch company fields + three RLS-scoped counts in one pass (D-05/D-06/D-06b).
  // All three count reads use head:true (no rows returned — cheapest possible read).
  const [{ data: company }, { count: productCount }, { count: pricelistCount }, { count: connectCount }] =
    await Promise.all([
      supabase
        .from('company')
        .select('name, verification_status, logo_path, description, website')
        .eq('id', companyId)
        .maybeSingle(),
      // Block 4: ≥1 product row → "Upload products" done
      supabase
        .from('product')
        .select('id', { count: 'exact', head: true }),
      // Block 5: ≥1 pricelist_item row → "Define pricelists" done
      supabase
        .from('pricelist_item')
        .select('id', { count: 'exact', head: true }),
      // Block 6: ≥1 connect-type request SENT from this company → "Find connections" done.
      // Scoped to connect/connect_message types so a pricelist_request can't falsely flip it
      // green (D-06b). sender_company_id scopes beyond RLS as belt-and-braces.
      supabase
        .from('pending_inbox_item')
        .select('id', { count: 'exact', head: true })
        .eq('sender_company_id', companyId)
        .in('type', ['connect', 'connect_message']),
    ])

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

  /**
   * 6-block onboarding checklist (D-05). Done-state derivation per block:
   *
   * Block 1 — connect_email: no email integration in Muskan's lane yet; stays as a
   *   person.preferences flag/placeholder until that capability lands.
   *
   * Block 2 — profile: completeness rule lives in profile.isProfileComplete() —
   *   the canonical display_name is non-empty AND title (role) is set AND avatar_path
   *   (photo) is uploaded. display_name (not first/last) so single-name / social-login
   *   identities can complete it. (Name is captured at sign-up; title + photo in /account.)
   *
   * Block 3 — company_details: company is considered "set up" when logo_path (brand
   *   image) + description (what the company does) + website are all non-empty.
   *   (logo_path and description are set via Account or Present banner; website via Account.)
   *
   * Blocks 4–6 — derived from RLS-scoped counts (no manual flag needed).
   */
  const items: ChecklistItem[] = [
    {
      key: 'connect_email',
      label: 'Connect email',
      done: !!flags.email_connected,
    },
    {
      key: 'profile',
      label: 'Your profile',
      done: isProfileComplete({
        displayName: person.display_name,
        title: person.title,
        avatarPath: person.avatar_path,
      }),
    },
    {
      key: 'company_details',
      label: 'Company details',
      done: !!(company?.logo_path && company?.description && company?.website),
    },
    {
      key: 'products',
      label: 'Upload products',
      done: (productCount ?? 0) >= 1,
    },
    {
      key: 'pricelists',
      label: 'Pricelists',
      done: (pricelistCount ?? 0) >= 1,
    },
    {
      key: 'connections',
      label: 'Find connections',
      done: (connectCount ?? 0) >= 1,
    },
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
