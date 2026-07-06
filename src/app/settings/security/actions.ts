'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createStandaloneClient } from '@supabase/supabase-js'
import { createClient } from '@/shared/db/server'
import { getCurrentUser } from '@/shared/auth'

// SET-02 self-serve account & company lifecycle actions. Mirror src/app/team/actions.ts:
// '{ ok: true } | { error }', NEVER throw, validate input BEFORE any auth/RPC call,
// revalidate after a state change, and use a localized RPC cast (codebase pattern).
//
// The 13-02 SECURITY DEFINER RPCs are the REAL boundary: each re-asserts the caller
// (id = auth.uid()) + the sole-Superadmin guard internally, and is the ONLY new write
// path onto person/company. These actions add input validation, the admin-API calls
// the RPCs can't make (token revoke), password re-verify, and clean UX copy — they are
// NOT the security boundary on their own. Every person write is via an RPC here —
// there is NEVER a direct `person` UPDATE (the open DEV-88 self-link hole is adjacent).

export type ActionResult = { ok: true } | { error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Localized cast for the lifecycle RPCs (same shape team/actions.ts uses) — keeps the
// call sites uniform and the error object narrowed to `{ message }`.
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * Revoke ALL of the caller's refresh tokens (the D-11 / T-13-08-S2 stale-session step),
 * copied verbatim from team/actions.ts:24-36.
 *
 * `auth.admin.signOut(jwt, scope)` takes a *session JWT*, not a user id — the by-id
 * operation is GoTrue's admin REST endpoint `POST /admin/users/{id}/logout?scope=global`
 * ("revoke all refresh tokens for a user"). Called directly with the service-role key
 * (server-only). NOTE (local caveat): the local GoTrue is HS256-signed and 403s the
 * `sb_secret_` key on the admin API, so locally this returns non-2xx — a fixture/key
 * limitation, not a defect. The security-critical state change already happened in the
 * RPC; the revoke is best-effort and is flagged for cloud UAT (RESEARCH A3).
 */
async function revokeUserSessions(userId: string): Promise<{ ok: boolean }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const secret = process.env.SUPABASE_SECRET_KEY!
  try {
    const res = await fetch(`${base}/auth/v1/admin/users/${userId}/logout?scope=global`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, apikey: secret },
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

/**
 * verifyPassword — re-confirm the caller's identity by their password (D-10 gate).
 *
 * A2: the check runs on a THROWAWAY standalone client (raw @supabase/supabase-js,
 * `persistSession:false`, no cookie adapter). A successful sign-in there holds its
 * session only in memory and is discarded — it shares NO storage with the cookie-backed
 * request client, so the caller's live session is provably undisturbed (no rotation).
 * If a future auth upgrade ever changes that, the fallback is reauthenticate().
 */
export async function verifyPassword(password: string): Promise<ActionResult> {
  // Reject empty input BEFORE any sign-in call (13-01 contract: no throw, no auth call).
  if (!password.trim()) return { error: 'Enter your password to continue' }

  const user = await getCurrentUser()
  if (!user?.email) return { error: 'You must be signed in' }

  const probe = createStandaloneClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await probe.auth.signInWithPassword({ email: user.email, password })
  if (error) return { error: 'That password doesn’t match. Please try again.' }

  return { ok: true }
}

/**
 * changePassword — set/replace the caller's sign-in password (D-05). A thin wrapper
 * over the auth client's updateUser so a signed-in user is NOT bounced to /login (unlike
 * reset-password's setNewPassword, which redirects). No current password is required —
 * the live session authorizes the change — which also lets an OAuth-only user ADD
 * email + password as a backup way in (matches the surface's hint copy).
 */
export async function changePassword(newPassword: string): Promise<ActionResult> {
  if (newPassword.length < 8) return { error: 'Password must be at least 8 characters' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) return { error: error.message }

  return { ok: true }
}

/**
 * requestAccountDeletion — GDPR erasure request (SET-02, D-10). Verify the password
 * first, then schedule via the definer RPC (deactivate now + open a 30-day runway),
 * then revoke the caller's sessions. The sole-Superadmin lockout is enforced INSIDE
 * the RPC (it RAISEs before any write); we map that RAISE to friendly copy.
 */
export async function requestAccountDeletion(password: string): Promise<ActionResult> {
  // 13-01 contract: an empty password is rejected here, before any RPC/auth call.
  if (!password.trim()) return { error: 'Enter your password to confirm deletion' }

  // D-10: re-verify identity before the destructive request.
  const verified = await verifyPassword(password)
  if ('error' in verified) return verified

  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('request_account_deletion', {})
  if (error) {
    // The RPC RAISEs 'promote another Superadmin before deleting your account' when the
    // caller is the company's last active Superadmin (D-11 headless-company guard).
    if (error.message.includes('promote another Superadmin')) {
      return { error: 'Promote another Superadmin first' }
    }
    return { error: error.message }
  }

  // Scheduled — now kill the ≤1h access token so the disabled account can't keep acting.
  const user = await getCurrentUser()
  if (user) await revokeUserSessions(user.id)

  revalidatePath('/settings/security')
  return { ok: true }
}

/**
 * cancelAccountDeletion — abort a pending erasure inside the 30-day grace window
 * (D-09). The RPC clears both the runway and the deactivation (account comes fully back).
 */
export async function cancelAccountDeletion(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('cancel_account_deletion', {})
  if (error) return { error: error.message }

  revalidatePath('/settings/security')
  return { ok: true }
}

/**
 * deactivateAccount — reversible self-pause (D-09). Sets person.deactivated_at via the
 * RPC, then revokes sessions (signed out everywhere; sign back in → reactivation screen).
 */
export async function deactivateAccount(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('deactivate_account', {})
  if (error) return { error: error.message }

  const user = await getCurrentUser()
  if (user) await revokeUserSessions(user.id)

  revalidatePath('/settings/security')
  return { ok: true }
}

/**
 * reactivateAccount — un-pause: clears deactivated_at AND any pending deletion runway
 * (D-09 / Open-Q #3). Called from the sign-in reactivation interstitial.
 */
export async function reactivateAccount(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('reactivate_account', {})
  if (error) return { error: error.message }

  revalidatePath('/settings/security')
  return { ok: true }
}

/**
 * deactivateCompany — a Superadmin pauses the whole company (D-12). The RPC's
 * has_permission('team.manage') belt gate RAISEs 'forbidden: not a company Superadmin'
 * for a Member; we map that to friendly copy. Imported by the 13-10 org security page.
 */
export async function deactivateCompany(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('deactivate_company', {})
  if (error) {
    if (error.message.includes('forbidden')) {
      return { error: 'Only a company Superadmin can deactivate the company' }
    }
    return { error: error.message }
  }

  revalidatePath('/settings/security')
  revalidatePath('/settings/organization/security')
  return { ok: true }
}

/**
 * reactivateCompany — a Superadmin un-pauses the company (the D-12 reverse of
 * deactivateCompany; the company must be reversible). The reactivate_company RPC
 * re-asserts has_permission('team.manage') internally (the real boundary); we map its
 * forbidden RAISE to friendly copy. Imported by the 13-10 org security page for the
 * reactivate control shown while the company is deactivated.
 */
export async function reactivateCompany(): Promise<ActionResult> {
  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('reactivate_company', {})
  if (error) {
    if (error.message.includes('forbidden')) {
      return { error: 'Only a company Superadmin can reactivate the company' }
    }
    return { error: error.message }
  }

  revalidatePath('/settings/security')
  revalidatePath('/settings/organization/security')
  return { ok: true }
}

/**
 * unlinkIdentity — remove a linked OAuth sign-in (Google/Outlook), guarded so it can
 * NEVER remove the caller's only identity (T-13-08-D: that would lock them out). Reads
 * the live identity set from GoTrue; unlink needs the full UserIdentity object, so we
 * resolve it from the passed identity_id.
 */
export async function unlinkIdentity(identityId: string): Promise<ActionResult> {
  if (!UUID_RE.test(identityId)) return { error: 'Invalid sign-in method' }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUserIdentities()
  if (error || !data) return { error: 'Could not load your sign-in methods' }

  const identities = data.identities
  // Sole-identity guard — refuse to remove the last way in.
  if (identities.length <= 1) {
    return { error: 'Keep at least one sign-in method — link another before unlinking this one' }
  }

  const target = identities.find((i) => i.identity_id === identityId || i.id === identityId)
  if (!target) return { error: 'Sign-in method not found' }

  const { error: unlinkError } = await supabase.auth.unlinkIdentity(target)
  if (unlinkError) return { error: unlinkError.message }

  revalidatePath('/settings/security')
  return { ok: true }
}
