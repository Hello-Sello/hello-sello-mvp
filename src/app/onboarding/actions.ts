'use server'

import { createClient } from '@/shared/db/server'
import { getCurrentCompanyId, getCurrentPerson } from '@/shared/auth'
import { updateMyProfile } from '@/modules/profile'
import { updateCompanyProfile } from '@/modules/companies'

// Each action returns a result the client stepper acts on (advance or show
// error). None redirect — navigation lives in the client so the modal sequence
// can flow step-to-step. Success = { ok: true }.
export type ActionResult = { ok: true } | { error: string }

// Licence is REQUIRED in production (2026-05-25 lock) but optional in local /
// preview so test signups don't fill the bucket. Authoritative server-only read:
// `REQUIRE_LICENSE` (no NEXT_PUBLIC_ prefix — must not be readable in the browser
// bundle; a non-NEXT_PUBLIC var is undefined client-side, silently making the
// licence optional). The client receives the flag as a prop from the parent Server
// Component (onboarding/page.tsx), not by reading process.env directly (D-02).
const LICENCE_REQUIRED = process.env.REQUIRE_LICENSE === 'true'

// Onboarding completion flags live in person.preferences.onboarding so the Home
// checklist has a single source for which skippable steps are done.
type OnboardingFlags = {
  email_connected?: boolean
  profile?: boolean
  company_details?: boolean
}

// Merge a patch into person.preferences (jsonb), deep-merging the `onboarding`
// sub-object so flags accumulate instead of clobbering each other.
async function patchPreferences(
  patch: Record<string, unknown>,
  onboarding?: OnboardingFlags,
): Promise<{ error: string } | null> {
  const supabase = await createClient()
  const person = await getCurrentPerson()
  if (!person) return { error: 'Not signed in.' }

  const current = (person.preferences ?? {}) as Record<string, unknown>
  const currentOnboarding = (current.onboarding ?? {}) as OnboardingFlags
  const merged = {
    ...current,
    ...patch,
    onboarding: { ...currentOnboarding, ...(onboarding ?? {}) },
  }

  const { error } = await supabase
    .from('person')
    .update({ preferences: merged })
    .eq('id', person.id)
  return error ? { error: error.message } : null
}

/**
 * Path-A company birth. Creates the company atomically (RPC), then uploads each
 * licence to the private bucket and records a row. Idempotent on retry: if a
 * prior run already created the company, the caller reuses it instead of hitting
 * the already_has_company guard, and just finishes the licence uploads.
 *
 * Rejected-resume resubmit path (AUTH-02 / D-08):
 *   When the caller's company is currently 'rejected' and a successful re-upload
 *   completes, the status is flipped back to 'pending' so it re-enters the review
 *   queue. The UPDATE is guarded on current status = 'rejected' only → 'pending'
 *   so it cannot un-revoke or self-verify a company (T-04-08).
 *   duplicate_company rejections do NOT reach this path — the UI suppresses the
 *   resubmit CTA (OnboardingStepper) and only calls this action from the fixable path.
 */
export async function createCompany(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get('name') ?? '').trim()
  const country = String(formData.get('country') ?? '').trim()
  const typeCodes = formData.getAll('type_codes').map(String)
  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0)

  if (!name) return { error: 'Company name is required.' }
  if (country.length !== 2) return { error: 'Please pick a country.' }
  if (LICENCE_REQUIRED && files.length === 0) return { error: 'A licence file is required.' }

  const supabase = await createClient()

  let companyId = await getCurrentCompanyId()

  // Check current status before branching — needed for the resubmit transition below.
  let currentStatus: string | null = null
  if (companyId) {
    const { data: co } = await supabase
      .from('company')
      .select('verification_status')
      .eq('id', companyId)
      .maybeSingle()
    currentStatus = co?.verification_status ?? null
  }

  if (!companyId) {
    const { data, error } = await supabase.rpc('onboard_company', {
      p_name: name,
      p_country: country,
      p_type_codes: typeCodes,
    })
    if (error || !data) {
      return { error: error?.message ?? 'Could not create the company.' }
    }
    companyId = data
  }

  for (const file of files) {
    const path = `${companyId}/${crypto.randomUUID()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('company-licenses')
      .upload(path, file, { contentType: file.type })
    if (uploadError) return { error: `Licence upload failed: ${uploadError.message}` }

    const { error: rowError } = await supabase.from('company_license_file').insert({
      company_id: companyId,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      file_size_bytes: file.size,
      scan_status: 'pending',
    })
    if (rowError) return { error: `Could not record the licence: ${rowError.message}` }
  }

  // Resubmit transition: only when the company was rejected.
  // Guard is strict: WHERE verification_status = 'rejected' → prevents clobbering
  // verified or revoked status even if this action is somehow called in those states.
  if (currentStatus === 'rejected') {
    const { error: flipError } = await supabase
      .from('company')
      .update({ verification_status: 'pending' })
      .eq('id', companyId)
      .eq('verification_status', 'rejected')
    if (flipError) return { error: `Could not resubmit for review: ${flipError.message}` }
  }

  return { ok: true }
}

/** Profile step — written to person columns via the profile module (one writer);
 *  only the completion flag stays in preferences (drives the Home checklist). */
export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const r = await updateMyProfile({
    displayName: String(formData.get('display_name') ?? ''),
    title: String(formData.get('title') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    language: String(formData.get('language') ?? ''),
    linkedin: String(formData.get('linkedin') ?? ''),
  })
  if (r.error) return { error: r.error }

  const flagErr = await patchPreferences({}, { profile: true })
  return flagErr ?? { ok: true }
}

/** Company-details step — written via the company module (one writer); flag in preferences. */
export async function saveCompanyDetails(formData: FormData): Promise<ActionResult> {
  const r = await updateCompanyProfile({
    address: String(formData.get('address') ?? ''),
    description: String(formData.get('description') ?? ''),
    primaryProducts: String(formData.get('primary_products') ?? ''),
    website: String(formData.get('website') ?? ''),
  })
  if (r.error) return { error: r.error }

  const flagErr = await patchPreferences({}, { company_details: true })
  return flagErr ?? { ok: true }
}

/**
 * "Connect email" — v0 records only that the user opted in. Real Gmail/Outlook
 * metadata import (contact_record rows, GDPR-safe) is a later build.
 */
export async function markEmailConnected(): Promise<ActionResult> {
  const err = await patchPreferences({}, { email_connected: true })
  return err ?? { ok: true }
}
