import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import { getCurrentPerson } from '@/shared/auth'
import { OnboardingStepper } from './OnboardingStepper'

const RESUMABLE = ['connect_email', 'profile', 'company_details'] as const
type ResumeStep = (typeof RESUMABLE)[number]

// Read server-side only — REQUIRE_LICENSE has no NEXT_PUBLIC_ prefix so it is
// never inlined into the browser bundle. The client component (OnboardingStepper)
// receives the resolved boolean as a prop instead (D-02 / AUTH-01).
const licenceRequired = process.env.REQUIRE_LICENSE === 'true'

/**
 * Post-signup onboarding (1c).
 *
 * Two modes:
 *  - No company yet → the full forward flow (create company → modal sequence).
 *  - Has a company + a ?resume=<step> → re-open a single skipped step (reached
 *    from the Home checklist), which returns to /home when done. A company-having
 *    user with no resume param has finished the forced flow → send them to /home.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>
}) {
  const person = await getCurrentPerson()
  if (!person) redirect('/login')

  const { resume } = await searchParams
  const resumeStep = (RESUMABLE as readonly string[]).includes(resume ?? '')
    ? (resume as ResumeStep)
    : null

  if (person.company_id && !resumeStep) redirect('/home')

  const supabase = await createClient()
  // Business-category options come straight from the lookup so the codes stay
  // owned by the DB.
  const { data: companyTypes } = await supabase
    .from('company_type')
    .select('code, description')
    .order('sort_order')

  const prefs = (person.preferences ?? {}) as Record<string, string>
  const prefill: {
    displayName?: string
    title?: string
    phone?: string
    language?: string
    address?: string
    description?: string
    primaryProducts?: string
    website?: string
  } = {
    displayName:
      prefs.display_name ||
      [person.first_name, person.last_name].filter(Boolean).join(' '),
    title: prefs.title,
    phone: prefs.phone,
    language: prefs.language,
  }

  // company_details resume needs the current company row to prefill.
  if (resumeStep === 'company_details' && person.company_id) {
    const { data: company } = await supabase
      .from('company')
      .select('address, description, primary_products, website')
      .eq('id', person.company_id)
      .maybeSingle()
    prefill.address = company?.address ?? undefined
    prefill.description = company?.description ?? undefined
    prefill.primaryProducts = company?.primary_products ?? undefined
    prefill.website = company?.website ?? undefined
  }

  return (
    <OnboardingStepper
      firstName={person.first_name ?? null}
      companyTypes={companyTypes ?? []}
      resumeStep={resumeStep}
      prefill={prefill}
      licenceRequired={licenceRequired}
    />
  )
}
