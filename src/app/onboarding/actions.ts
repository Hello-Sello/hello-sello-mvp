'use server'

import { after } from 'next/server'
import { createClient } from '@/shared/db/server'
import { getCurrentCompanyId, getCurrentPerson } from '@/shared/auth'
import { updateMyProfile, setMyAvatarPath } from '@/modules/profile'
import { updateCompanyProfile } from '@/modules/companies'
import { shouldDispatch } from '@/shared/email/dispatch'

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
  // Two-level taxonomy (DEV-99 #3): Business Categories (sector) alongside the
  // Business Activities above. A 'custom' category carries its free-text label in
  // custom_category; the DB CHECK enforces "label present iff custom".
  const categoryCodes = formData.getAll('category_codes').map(String)
  const customCategory = String(formData.get('custom_category') ?? '').trim()
  const files = formData
    .getAll('files')
    .filter((f): f is File => f instanceof File && f.size > 0)

  if (!name) return { error: 'Company name is required.' }
  if (country.length !== 2) return { error: 'Please pick a country.' }
  // Both taxonomy levels are required in the UI; re-assert server-side so a crafted
  // POST can't create a taxonomy-less company. Naming the 'custom' category here also
  // yields a friendly message instead of leaking the raw company_business_category
  // custom_label CHECK violation back to the client.
  if (typeCodes.length === 0) return { error: 'Please pick at least one business activity.' }
  if (categoryCodes.length === 0) return { error: 'Please pick at least one business category.' }
  if (categoryCodes.includes('custom') && customCategory === '') {
    return { error: 'Please name your custom business category.' }
  }
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

  // Revocation guard (Bouncer 2 — WR-01 / AUTH-01): a revoked company must not be
  // allowed to upload licence files or insert company_license_file rows even via a
  // direct POST. Return an error before ANY write rather than redirect (redirect
  // would not work from a Server Action that must return ActionResult to the client).
  if (currentStatus === 'revoked') {
    return { error: 'Your account access has been suspended.' }
  }

  if (!companyId) {
    const { data, error } = await supabase.rpc('onboard_company', {
      p_name: name,
      p_country: country,
      p_type_codes: typeCodes,
      p_category_codes: categoryCodes,
      p_custom_category: customCategory || undefined,
    })
    if (error || !data) {
      return { error: error?.message ?? 'Could not create the company.' }
    }
    companyId = data

    // SET-03 (welcome, Open-Q #1): fire the ONE-SHOT welcome email HERE, on the
    // null→set company transition. This branch is only entered when the caller had
    // no company; on any createCompany retry getCurrentCompanyId() returns the
    // just-created company and short-circuits it, so the welcome fires exactly once
    // per person WITHOUT a welcome_sent_at column. Fire-and-forget via after() +
    // fail-soft: a send failure can never fail company creation. person.id ===
    // auth.uid(), so the caller is the welcome recipient.
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (shouldDispatch({ error }) && user) {
      const welcomePersonId = user.id
      const welcomeCompanyId = companyId
      after(async () => {
        try {
          await supabase.functions.invoke('send-lifecycle-email', {
            body: { event: 'welcome', person_id: welcomePersonId, company_id: welcomeCompanyId },
          })
        } catch {
          /* email transport down MUST NOT surface as an action failure */
        }
      })
    }
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

/** Persist the OPTIONAL onboarding profile photo (DEV-99 #4). AvatarUpload uploads
 *  the file client-direct, then calls this with the stored path to point the person
 *  row at it. The photo does not gate the profile checklist, so no revalidate needed. */
export async function saveOnboardingAvatar(path: string): Promise<{ error?: string }> {
  return setMyAvatarPath(path)
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

// ---------------------------------------------------------------------------
// Path B — join an existing company (PATHB-01/02/03).
//
// Three thin wrappers over the 12-02 SECURITY DEFINER RPCs
// (search_joinable_companies / request_to_join / withdraw_join_request). They own
// input validation + the {ok}|{error} mapping; the RPCs are the real authz
// boundary (verified-target + ownership re-asserted inside). Same "None redirect —
// navigation lives in the client" contract as createCompany: the stepper drives
// the S1→S2 transition. No service-role admin client (D-17 / A4) — these are
// normal authenticated calls.
//
// database.types.ts is intentionally NOT regenerated mid-stream (codebase
// pattern), so each .rpc() uses a localized cast. For requestToJoin the cast is
// WIDENED to expose `code` so the duplicate-pending guard can branch on the raw
// Postgres SQLSTATE instead of a brittle message-substring match.
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Fail-closed generic copy — no internal leak (UI-SPEC Errors table).
const GENERIC_ERROR = 'Something went wrong. Please try again.'

export type JoinableCompany = { id: string; name: string; city: string | null; logo_path: string | null }
export type SearchResult = { rows: JoinableCompany[] } | { error: string }

/**
 * S1 search — wraps search_joinable_companies. A READ (no revalidatePath). The RPC
 * hard-filters verification_status='verified' and returns the curated projection
 * (id/name/city/logo_path) for a company-less caller. An empty term is a valid
 * "show nothing yet" state, never a throw. We short-circuit a blank term to an
 * empty list here: the UI's "start typing" empty state renders nothing until the
 * user types, so there is no reason to round-trip the DB — and it keeps the action
 * a pure, no-throw "show nothing yet" for the empty case (UI-SPEC S1 empty state).
 */
export async function searchCompanies(term: string): Promise<SearchResult> {
  if (term.trim() === '') return { rows: [] }
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }).rpc('search_joinable_companies', { p_term: term })

  if (error) return { error: GENERIC_ERROR }
  return { rows: (data as JoinableCompany[]) ?? [] }
}

/**
 * S1 submit — wraps request_to_join. UUID-validate the target, then map errors in
 * order (most specific first):
 *   1. SQLSTATE 23505 (the partial-unique index uq_join_request_active_pending) →
 *      the verbatim D-12 "already pending" copy. We detect the duplicate by the raw
 *      Postgres `code`, NOT a message-substring: the index raises a bare
 *      unique_violation (no custom RAISE string), so matching the constraint name
 *      inside the message would be brittle. This deviates from the existing
 *      friendly-mapping idiom (team/actions.ts:149 maps `change_member_role`'s
 *      custom 'last Superadmin' RAISE via message.includes) precisely because this
 *      is an index collision, not a RAISE — `error.code` is the reliable signal.
 *   2. the verified-target RAISE ('already belongs to a company') → already-in-company copy.
 *   3. anything else → the generic fail-closed copy.
 * No revalidatePath — the client transitions to S2 on { ok }.
 */
export async function requestToJoin(companyId: string, note?: string): Promise<ActionResult> {
  if (!UUID_RE.test(companyId)) return { error: GENERIC_ERROR }
  const supabase = await createClient()

  // WIDENED localized cast: expose `code` so the SQLSTATE check below is typed.
  const result = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
  }).rpc('request_to_join', { p_company_id: companyId, p_note: note ?? null })

  if (result.error) {
    // (1) Raw unique_violation from the one-active-pending index — detect by SQLSTATE.
    if (result.error.code === '23505') {
      return { error: 'You already have a pending request. Withdraw it before requesting another company.' }
    }
    // (2) Caller already has a company: request_to_join's company-less guard
    //     (20260622100000) raises this, as does a raced Path-A self-onboard.
    if (result.error.message.includes('already belongs to a company')) {
      return { error: "You're already part of a company." }
    }
    // (3) Verified-target guard + anything else → fail closed, no internal leak.
    return { error: GENERIC_ERROR }
  }

  // SET-03: join.requested — the edge fn fans out to the TARGET company's
  // Superadmins (recipient resolution is server-side in 13-05; the action passes
  // only the company id). Post-ok + fail-soft via after().
  if (shouldDispatch(result)) {
    after(async () => {
      try {
        await supabase.functions.invoke('send-lifecycle-email', {
          body: { event: 'join.requested', company_id: companyId },
        })
      } catch {
        /* email transport down MUST NOT surface as an action failure */
      }
    })
  }
  return { ok: true }
}

/**
 * S2 withdraw — wraps withdraw_join_request. UUID-validate, then fail closed on any
 * RPC error (the only real failures here are "request not found" for a non-owner or
 * already-terminal row, which the requester need not distinguish).
 */
export async function withdrawJoin(requestId: string): Promise<ActionResult> {
  if (!UUID_RE.test(requestId)) return { error: GENERIC_ERROR }
  const supabase = await createClient()

  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  }).rpc('withdraw_join_request', { p_request_id: requestId })

  if (error) return { error: GENERIC_ERROR }
  return { ok: true }
}
