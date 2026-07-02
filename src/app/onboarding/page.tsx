import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import { getCurrentPerson } from '@/shared/auth'
import { OnboardingStepper } from './OnboardingStepper'
import type { RejectPreset } from '@/app/admin/verifications/reject-presets'

const RESUMABLE = ['connect_email', 'profile', 'company_details'] as const
type ResumeStep = (typeof RESUMABLE)[number]

// Read server-side only — REQUIRE_LICENSE has no NEXT_PUBLIC_ prefix so it is
// never inlined into the browser bundle. The client component (OnboardingStepper)
// receives the resolved boolean as a prop instead (D-02 / AUTH-01).
const licenceRequired = process.env.REQUIRE_LICENSE === 'true'

/**
 * Post-signup onboarding (1c).
 *
 * Three modes:
 *  - No company yet → the full forward flow (create company → modal sequence).
 *  - Has a company + a ?resume=<step> → re-open a single skipped step (reached
 *    from the Home checklist), which returns to /home when done.
 *  - Has a company with verification_status = 'rejected' and no ?resume= →
 *    rejected-resume mode: stay on /onboarding with pre-filled data + reason banner.
 *    This exempts rejected from the company_id guard, closing the redirect loop
 *    with home/page.tsx which redirects rejected → /onboarding (D-07 / AUTH-02).
 *  - Has a company (not rejected) + no ?resume= → finished forward flow → /home.
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

  const supabase = await createClient()

  // Read company status BEFORE the company_id guard so we can exempt rejected
  // (a rejected company HAS a company_id but must NOT be bounced to /home — it
  // would loop back here immediately via home/page.tsx's rejected → /onboarding
  // redirect). Only query if person has a company.
  let companyStatus: string | null = null
  let rejectedCompanyName: string | null = null
  if (person.company_id) {
    const { data: co } = await supabase
      .from('company')
      .select('verification_status, name')
      .eq('id', person.company_id)
      .maybeSingle()
    companyStatus = co?.verification_status ?? null
    rejectedCompanyName = co?.name ?? null
  }

  // Guard: company exists + no resume step + not rejected → finished onboarding, go home.
  // Rejected is explicitly exempted to prevent the /home ↔ /onboarding redirect loop.
  if (person.company_id && !resumeStep && companyStatus !== 'rejected') redirect('/home')

  // Path B (D-10): a COMPANY-LESS requester with a PENDING join_request lands on the
  // S2 "Request sent" screen instead of the create-company fork. This read is
  // unconditional for the company-less person and runs BEFORE the stepper renders,
  // so a pending requester is never bounced past their own pending screen. This page
  // does NOT call requireVerified() (its only gate is getCurrentPerson → /login), so
  // there is no verification short-circuit to reorder around (review finding #1).
  //
  // jr_select lets the requester read their OWN row even while company-less. The
  // target company NAME comes from the row's OWN metadata (captured at submit by
  // request_to_join), NEVER a `company` read — company_select denies the
  // company-less caller (Pitfall 5 / T-12-03-I).
  let pendingJoin: { companyName: string; requestId: string } | null = null
  if (!person.company_id) {
    const { data: jr } = await supabase
      .from('join_request')
      .select('id, metadata, status')
      .eq('requester_person_id', person.id)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()
    if (jr) {
      const companyName = (jr.metadata as { company_name?: string } | null)?.company_name ?? ''
      pendingJoin = { companyName, requestId: jr.id }
    }
  }

  // Business-category options come straight from the lookup so the codes stay
  // owned by the DB.
  const { data: companyTypes } = await supabase
    .from('company_type')
    .select('code, description')
    .order('sort_order')

  const prefill: {
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
  } = {
    displayName:
      person.display_name ||
      [person.first_name, person.last_name].filter(Boolean).join(' '),
    title: person.title ?? undefined,
    phone: person.phone ?? undefined,
    language: person.language ?? undefined,
    linkedin: (person.links as { linkedin?: string } | null)?.linkedin ?? undefined,
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

  // Rejected-resume mode: pre-fill company data + fetch rejection reason from audit_log.
  // The audit_select RLS (20260607170000_rls_policies.sql:254) already allows a seller
  // to read their own company's audit_log rows — no new SECURITY DEFINER RPC needed.
  let rejectionReason: string | null = null
  let rejectionPreset: RejectPreset | null = null
  let isDuplicate = false

  if (companyStatus === 'rejected' && person.company_id) {
    // Pre-fill the company setup fields from the existing company row (D-07).
    const { data: rejectedCompany } = await supabase
      .from('company')
      .select('address, description, primary_products, website')
      .eq('id', person.company_id)
      .maybeSingle()
    prefill.address = rejectedCompany?.address ?? undefined
    prefill.description = rejectedCompany?.description ?? undefined
    prefill.primaryProducts = rejectedCompany?.primary_products ?? undefined
    prefill.website = rejectedCompany?.website ?? undefined
    prefill.companyName = rejectedCompanyName ?? undefined

    // Fetch the most-recent rejection reason from audit_log (D-07).
    const { data: rejection } = await supabase
      .from('audit_log')
      .select('reason, metadata, created_at')
      .eq('company_id', person.company_id)
      .eq('content_type', 'company')
      .eq('action', 'company.verify_rejected')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    rejectionReason = rejection?.reason ?? null
    const presetCode = (rejection?.metadata as { preset?: string } | null)?.preset ?? null
    // Derive duplicate discriminator — do NOT import non-existent FIXABLE/STRUCTURAL symbols;
    // only REJECT_PRESETS, RejectPreset, and REJECT_PRESET_LABELS are real exports (D-08).
    isDuplicate = presetCode === 'duplicate_company'
    rejectionPreset = presetCode as RejectPreset | null
  }

  // Prefill the (optional) profile photo when resuming onboarding so an already
  // uploaded avatar shows instead of a blank slate (?v nonce busts a stale cache).
  const initialAvatarUrl = person.avatar_path
    ? `${supabase.storage.from('avatars').getPublicUrl(person.avatar_path).data.publicUrl}?v=${new Date(person.updated_at).getTime()}`
    : null

  return (
    <OnboardingStepper
      firstName={person.first_name ?? null}
      personId={person.id}
      initialAvatarUrl={initialAvatarUrl}
      companyTypes={companyTypes ?? []}
      resumeStep={resumeStep}
      prefill={prefill}
      licenceRequired={licenceRequired}
      rejectionReason={rejectionReason}
      rejectionPreset={rejectionPreset}
      isDuplicate={isDuplicate}
      isRejectedResume={companyStatus === 'rejected'}
      pendingJoin={pendingJoin}
    />
  )
}
