'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { updateMyProfile, setMyAvatarPath, type ProfileFields } from '@/modules/profile'
import { updateCompanyProfile, getCompanyProfile, type CompanyFields } from '@/modules/companies'
import { createClient } from '@/shared/db/server'

/**
 * Server-side RBAC gate (D-04, RBAC-01): is the caller's company role granted
 * `p_action` in the seeded permission matrix? Queries the matrix via the
 * `has_permission` SECURITY DEFINER RPC (plan 11-02). Un-regenerated RPC →
 * localized cast at the call site (codebase pattern, same as verifications/actions.ts).
 * Fail-closed: any RPC error is treated as "not permitted".
 */
async function hasPermission(action: string): Promise<boolean> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>
  }).rpc('has_permission', { p_action: action })
  if (error) return false
  return data === true
}

// Thin server actions over the modules — the account UI calls these; the modules
// own the rules and storage shape.

export async function saveMyProfile(fields: ProfileFields) {
  const r = await updateMyProfile(fields)
  if (!r.error) {
    revalidatePath('/account')
    revalidatePath('/home') // refresh the onboarding "Your profile" check
  }
  return r
}

export async function saveCompanyProfile(fields: Partial<CompanyFields>) {
  // D-04: editing the company profile/branding is Superadmin-only. Enforce
  // server-side via the queried permission matrix — the form being hidden
  // client-side is not a security boundary. The instant a non-Superadmin lands
  // here (direct call, replayed request), the matrix denies and nothing writes.
  if (!(await hasPermission('company.edit_profile'))) {
    return { error: 'Only a company Superadmin can edit the company profile' }
  }

  const r = await updateCompanyProfile(fields)
  if (!r.error) {
    // Propagate branding edits to every surface that shows company logo / name / city.
    // Dynamic routes must pass 'page' type — literals must NOT (Pitfall 4: silent no-op).
    revalidatePath('/account')
    revalidatePath('/present')
    revalidatePath('/home')
    revalidatePath('/discover')
    revalidatePath('/discover/[id]', 'page')
    revalidatePath('/c/[handle]', 'page')
  }
  return r
}

/**
 * Change the caller's sign-in email (ACCT-03).
 *
 * The auth-client email update does NOT flip `auth.users.email` immediately — it stages
 * the new address in `auth.users.new_email`. Locally `double_confirm_changes=false`
 * (config.toml:233, with rationale at 222-232): only the NEW address must confirm via
 * the same-origin `/auth/confirm?type=email_change` link (verifyOtp) and the email flips
 * on that single click — matching the RED e2e contract. The OWASP "notify the old owner"
 * intent is preserved via GoTrue's change-notification to the old address; the strict
 * two-click both-addresses gate (`true`) is the CLOUD "Secure email change" posture, left
 * as the end-of-phase human decision (see 10-05 SUMMARY; T-10-05a). This is a thin
 * pass-through to the auth client — NO `person`-row write: `auth.users.email` is the
 * single source of truth (D-13; `person.email_encrypted` was dropped 2026-05-27).
 */
export async function changeEmail(newEmail: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${origin}/auth/confirm?type=email_change&next=/account` },
  )
  if (error) {
    // Surface GoTrue's rejection (e.g. the address is already registered) so the user
    // sees why nothing was sent, rather than a silent "pending" that never arrives.
    return { error: error.message }
  }
  // `/account` is a literal route → plain revalidatePath, NO 'page' second arg
  // (Pitfall 2: passing 'page' on a literal is a silent no-op).
  revalidatePath('/account')
  return { ok: true }
}

export async function saveAvatar(path: string) {
  const r = await setMyAvatarPath(path)
  if (!r.error) {
    revalidatePath('/account')
    revalidatePath('/home') // photo completes the onboarding "Your profile" check
  }
  return r
}

/**
 * Server reader for the TopBar — returns the logged-in company's name + logo URL.
 * Mirror of account-card.ts::getAccountCard; used by TopBar via the client-read
 * useEffect pattern (AppShell is "use client", so TopBar cannot be async-server).
 */
export async function getCompanyChrome(): Promise<{ name: string; logoUrl: string | null } | null> {
  const company = await getCompanyProfile()
  if (!company) return null

  let logoUrl: string | null = null
  if (company.logoPath) {
    const supabase = await createClient()
    logoUrl = supabase.storage.from('shop-media').getPublicUrl(company.logoPath).data.publicUrl
  }

  return { name: company.name, logoUrl }
}
