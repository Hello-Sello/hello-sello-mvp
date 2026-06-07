'use server'

import { createClient } from '@/shared/db/server'
import { getCurrentCompanyId, getCurrentPerson } from '@/shared/auth'

// Each action returns a result the client stepper acts on (advance or show
// error). None redirect — navigation lives in the client so the modal sequence
// can flow step-to-step. Success = { ok: true }.
export type ActionResult = { ok: true } | { error: string }

// TEMP (testing, 2026-06-08): licence optional so test runs don't fill the
// bucket. The 2026-05-25 lock makes it REQUIRED — flip back to `true` (here AND
// in OnboardingStepper.tsx) before shipping.
const LICENCE_REQUIRED = false

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

  return { ok: true }
}

/** Profile enrichment — stored in person.preferences (no dedicated columns). */
export async function saveProfile(formData: FormData): Promise<ActionResult> {
  const display_name = String(formData.get('display_name') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const language = String(formData.get('language') ?? '').trim()

  const err = await patchPreferences(
    { display_name, title, phone, language },
    { profile: true },
  )
  return err ?? { ok: true }
}

/** Company-details enrichment — updates the existing company row. */
export async function saveCompanyDetails(formData: FormData): Promise<ActionResult> {
  const address = String(formData.get('address') ?? '').trim() || null
  const description = String(formData.get('description') ?? '').trim() || null
  const primary_products = String(formData.get('primary_products') ?? '').trim() || null
  const website = String(formData.get('website') ?? '').trim() || null

  const supabase = await createClient()
  const companyId = await getCurrentCompanyId()
  if (!companyId) return { error: 'No company in session.' }

  const { error } = await supabase
    .from('company')
    .update({ address, description, primary_products, website })
    .eq('id', companyId)
  if (error) return { error: error.message }

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
