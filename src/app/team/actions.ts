'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/shared/db/server'
import { createAdminClient } from '@/shared/db/admin'
import { getCurrentCompanyId } from '@/shared/auth'

/**
 * Revoke ALL of a user's refresh tokens by user id (the D-11 token-revoke step).
 *
 * `auth.admin.signOut(jwt, scope)` in @supabase/supabase-js takes a *session JWT*,
 * not a user id — there is no by-id variant in the client. The by-id operation is
 * GoTrue's admin REST endpoint `POST /admin/users/{id}/logout?scope=global`, which
 * is exactly what "revoke all refresh tokens for a user" maps to. We call it directly
 * with the service-role secret key (server-only, same key the admin client uses).
 *
 * NOTE (local-stack caveat): the local GoTrue instance is HS256-signed and 403s the
 * `sb_secret_` key on the admin API — so locally this returns a non-2xx. That is a
 * fixture/key limitation, not a defect: the security-critical step (closing the
 * cross-company data window) already happened in the remove_member RPC. Callers treat
 * a non-2xx here as a partial success and surface a retry, never a hard failure.
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

// Server actions wrapping the Phase 11 team RPCs + the service-role admin client.
// Mirror src/app/admin/verifications/actions.ts: '{ ok: true } | { error }',
// never throw, UUID-validate ids, revalidate after writes, and localized RPC casts
// (database.types.ts is intentionally not regenerated mid-stream — code_context).
//
// Two-layer gating: every RPC re-asserts has_permission('team.manage') + tenant
// scope internally (the real boundary). These actions add input validation, the
// admin-API calls the RPCs can't make (invite email, token revoke), and clean UX
// errors — they are NOT the security boundary on their own.

export type ActionResult = { ok: true } | { error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Pragmatic email shape check — the real validation is GoTrue's; this only blocks
// obvious garbage before we spend an RPC + an admin call.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Role = 'member' | 'superadmin'

// Localized cast for the un-regenerated team RPCs (codebase pattern).
type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>
}

/**
 * inviteMember — RPC precheck, send the invite email, THEN audit (RBAC-02, D-06/08/09).
 *
 * `invite_member` (precheck-only) validates the role and blocks re-inviting an existing
 * active member — it does NOT write the audit row. The admin client then creates the
 * auth user + emails the invite link; the Phase 06.1 person signup trigger consumes the
 * `company_id` + `role` metadata on accept. Only after a successful send do we call
 * `record_invite_sent`, which writes the team.member_invited audit row. This ordering
 * (WR-01) keeps the append-only audit chain free of phantom "invited" rows for invites
 * that never sent (e.g. the D-09 already-has-an-account failure). company_id comes from
 * the caller's session (never the client — T-11-17). The invite link lands on the
 * existing /auth/confirm handler (token_hash + type=invite).
 *
 * D-09: if the email already has a Hello-Sello account, inviteUserByEmail errors —
 * we return a clean "already has an account" message instead of throwing (no audit).
 */
export async function inviteMember(email: string, role: Role): Promise<ActionResult> {
  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address' }
  if (role !== 'member' && role !== 'superadmin') return { error: 'Invalid role' }

  const companyId = await getCurrentCompanyId()
  if (!companyId) return { error: 'You must belong to a company to invite members' }

  const supabase = await createClient()

  // RPC precheck only — Superadmin-gated, same-company-member guard (NO audit; WR-01).
  const { error: rpcError } = await (supabase as unknown as RpcClient).rpc('invite_member', {
    p_email: email,
    p_role: role,
  })
  if (rpcError) {
    // Distinguishable RPC RAISE for an already-active member (precheck).
    if (rpcError.message.includes('already_member')) {
      return { error: 'That person is already a member of your company' }
    }
    return { error: rpcError.message }
  }

  // Create the auth user + send the invite email (service-role; server-only).
  const origin = (await headers()).get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL!
  const admin = createAdminClient()
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { company_id: companyId, role },
    redirectTo: `${origin}/auth/confirm?type=invite&next=/home`,
  })
  if (inviteError) {
    // D-09: an existing account makes inviteUserByEmail return "User already registered".
    // Surface a clean message rather than throwing (join-existing-company is Phase 12).
    // No audit row is written on this path — the invite never sent (WR-01).
    if (/already.*regist|already.*exist/i.test(inviteError.message)) {
      return { error: 'This email already has a Hello-Sello account' }
    }
    return { error: inviteError.message }
  }

  // The invite actually sent — NOW write the team.member_invited audit row (WR-01/WR-02).
  // record_invite_sent re-asserts the Superadmin gate + tenant scope (audit_insert
  // WITH CHECK company_id = current_company_id()). A failure here means the email went
  // out but the audit didn't land — surface it rather than silently dropping the trail.
  const { error: auditError } = await (supabase as unknown as RpcClient).rpc('record_invite_sent', {
    p_email: email,
    p_role: role,
  })
  if (auditError) return { error: auditError.message }

  revalidatePath('/team')
  return { ok: true }
}

/**
 * changeMemberRole — promote/demote through the change_member_role RPC (RBAC-03).
 * The RPC owns the add/remove-from-Superadmin-group logic + the D-15 last-Superadmin
 * lockout; we just validate inputs and map the lockout RAISE to a friendly error.
 */
export async function changeMemberRole(personId: string, role: Role): Promise<ActionResult> {
  if (!UUID_RE.test(personId)) return { error: 'Invalid member ID' }
  if (role !== 'member' && role !== 'superadmin') return { error: 'Invalid role' }

  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('change_member_role', {
    p_person_id: personId,
    p_role: role,
  })
  if (error) {
    if (error.message.includes('last Superadmin')) {
      return { error: 'Promote another Superadmin before changing this one' }
    }
    return { error: error.message }
  }

  revalidatePath('/team')
  return { ok: true }
}

/**
 * removeMember — null-then-revoke per resolved D-11 (RBAC-03).
 *
 * 1. `remove_member` RPC FIRST: nulls person.company_id (the live current_company_id()
 *    then denies every cross-company RLS policy on the target's next request) +
 *    soft-deletes their memberships + audits. The data window is closed here.
 * 2. THEN admin.signOut(global): revokes refresh tokens so the still-valid ≤1h access
 *    JWT can't refresh — permanent lockout once it expires.
 *
 * If signOut fails after the RPC succeeded, the cross-company data is ALREADY closed
 * (step 1) — return a partial-success error telling the Superadmin the member is
 * removed but the token revoke should be retried, rather than implying removal failed.
 */
export async function removeMember(personId: string): Promise<ActionResult> {
  if (!UUID_RE.test(personId)) return { error: 'Invalid member ID' }

  const supabase = await createClient()
  const { error: rpcError } = await (supabase as unknown as RpcClient).rpc('remove_member', {
    p_person_id: personId,
  })
  if (rpcError) {
    if (rpcError.message.includes('last Superadmin')) {
      return { error: 'Promote another Superadmin before removing this one' }
    }
    return { error: rpcError.message }
  }

  // Data is closed; now revoke ALL the removed user's refresh tokens (service-role;
  // server-only) so the still-valid ≤1h access JWT can never refresh → permanent lockout.
  const revoked = await revokeUserSessions(personId)
  if (!revoked.ok) {
    // Partial success: removal stuck (RLS already denies cross-company), only the
    // token revoke needs a retry. Do not imply the member is still active.
    revalidatePath('/team')
    return {
      error:
        'Member removed and company access revoked, but ending their active session failed — retry to fully sign them out.',
    }
  }

  revalidatePath('/team')
  return { ok: true }
}

export type TeamMember = {
  personId: string | null // null for a pending invitee (no person row yet)
  displayName: string | null
  email: string
  role: Role
  status: 'active' | 'pending'
}

/**
 * listTeam — the team list the UI renders (RBAC-02). Active members come from the
 * Superadmin-gated `list_company_members` RPC; pending invitees (invited but not yet
 * accepted) are derived app-side from auth.users via the admin client, filtered to
 * this company's metadata and an unconfirmed/invited state (RESEARCH Open-Q #1:
 * derive pending from auth state, no new schema).
 *
 * Returns the merged list, or `{ error }` (never throws). A non-Superadmin gets 0
 * active rows from the RPC (fail-safe) — and we skip the admin listing for them.
 */
export async function listTeam(): Promise<{ members: TeamMember[] } | { error: string }> {
  const companyId = await getCurrentCompanyId()
  if (!companyId) return { error: 'You must belong to a company to view the team' }

  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as RpcClient).rpc('list_company_members', {})
  if (error) return { error: error.message }

  const active: TeamMember[] = ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
    personId: r.person_id as string,
    displayName: (r.display_name as string | null) ?? null,
    email: r.email as string,
    role: r.role as Role,
    status: 'active' as const,
  }))

  // Non-Superadmin (or empty company) → no admin listing, just the (empty) active set.
  if (active.length === 0) return { members: active }

  // Merge pending invitees: auth users whose metadata company_id matches and who
  // have been invited but not yet confirmed (no active person row in this company).
  const activeIds = new Set(active.map((m) => m.personId))
  const pending: TeamMember[] = []
  try {
    const admin = createAdminClient()
    const { data: list } = await admin.auth.admin.listUsers()
    for (const u of list?.users ?? []) {
      const meta = (u.user_metadata ?? {}) as { company_id?: string; role?: string }
      const invited = Boolean(u.invited_at) && !u.email_confirmed_at
      if (meta.company_id === companyId && invited && !activeIds.has(u.id) && u.email) {
        pending.push({
          personId: null,
          displayName: null,
          email: u.email,
          role: meta.role === 'superadmin' ? 'superadmin' : 'member',
          status: 'pending',
        })
      }
    }
  } catch {
    // Admin listing is best-effort enrichment — if it fails, still return the active
    // members rather than blanking the whole page.
  }

  return { members: [...active, ...pending] }
}

// ---- Path B: join-request approval queue (PATHB-02 / PATHB-04) ---------------
//
// These three actions wrap the 12-02 Path-B RPCs the same way the Phase 11 team
// actions above wrap theirs (SP-3): never throw, UUID-validate ids, map the RPC's
// RAISE messages to verbatim UI copy, revalidate after a write. They add NO
// service-role admin path (A4) — approve writes only public.* tables through the
// SECURITY DEFINER RPC, with no auth.admin call, so @/shared/db/admin is not used.
//
// The RPCs are the real boundary: list/approve/reject each re-assert
// has_permission('team.manage') + tenant scope (target_company_id =
// current_company_id()) internally, so a non-Superadmin gets 0 rows and a
// Company-B Superadmin can never touch Company-A's requests. These actions only
// validate input and translate errors.

export type PendingJoinRequest = {
  id: string
  requesterPersonId: string
  requesterName: string
  note: string | null
  requestedAt: string
}

// One mapping for both approve + reject: the RPC RAISEs we surface verbatim,
// everything else fails closed to the generic copy (no internal leak — T-12-04-I).
function joinDecisionError(message: string): string {
  // Defense-in-depth: the page already gates, but the RPC re-asserts the gate too.
  // (Check first — 'forbidden' must win even though it never co-occurs with the
  // raced strings below.)
  if (message.includes('forbidden')) {
    return 'Only a Superadmin can approve or reject requests.'
  }
  // Raced out: another Superadmin already decided it (the RPC's pending guard
  // 'join request not pending or not in your company'), OR the requester self-
  // onboarded into a company between request and approval ('requester already
  // belongs to a company'). Either way the row leaves the queue on refresh.
  if (message.includes('not pending') || message.includes('already belongs')) {
    return 'This request was already handled.'
  }
  return 'Something went wrong. Please try again.'
}

/**
 * listPendingJoinRequests — the Superadmin's queue read (mirrors listTeam's
 * `{ rows } | { error }` shape). A non-Superadmin (or a company-less caller) gets
 * 0 rows from the RPC (fail-safe), so this returns `{ rows: [] }`. It is a READ —
 * no revalidatePath. The page relies on the SHAPE distinction: an empty-but-OK
 * read is `{ rows: [] }` (render the inline empty section); a FAILED read is
 * `{ error }` (the page short-circuits to the error card, never an empty section).
 */
export async function listPendingJoinRequests(): Promise<
  { rows: PendingJoinRequest[] } | { error: string }
> {
  const supabase = await createClient()
  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    'list_pending_join_requests',
    {},
  )
  if (error) return { error: 'Something went wrong. Please try again.' }

  const rows: PendingJoinRequest[] = ((data as Array<Record<string, unknown>>) ?? []).map((r) => ({
    id: r.id as string,
    requesterPersonId: r.requester_person_id as string,
    requesterName: (r.requester_name as string | null) ?? '',
    note: (r.note as string | null) ?? null,
    requestedAt: r.requested_at as string,
  }))
  return { rows }
}

/**
 * approveJoin — approve a pending request with a role (default Member, D-08).
 * The RPC owns the atomic link + the conditional Superadmin-group grant + the
 * pending/tenant guard; we validate inputs and map its RAISEs. A raced-out
 * request (another Superadmin already decided) maps to "This request was already
 * handled." — the queue reconciles on the caller's next router.refresh().
 */
export async function approveJoin(requestId: string, role: Role): Promise<ActionResult> {
  if (!UUID_RE.test(requestId)) return { error: 'Something went wrong. Please try again.' }
  if (role !== 'member' && role !== 'superadmin') {
    return { error: 'Something went wrong. Please try again.' }
  }

  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('approve_join_request', {
    p_request_id: requestId,
    p_role: role,
  })
  if (error) return { error: joinDecisionError(error.message) }

  revalidatePath('/team')
  return { ok: true }
}

/**
 * rejectJoin — reject a pending request with an optional reason (D-08). The RPC
 * stores the reason in the audit trail + flips status to rejected, guarded by
 * pending + tenant scope. Same RAISE→copy mapping as approveJoin.
 */
export async function rejectJoin(requestId: string, reason?: string): Promise<ActionResult> {
  if (!UUID_RE.test(requestId)) return { error: 'Something went wrong. Please try again.' }

  const supabase = await createClient()
  const { error } = await (supabase as unknown as RpcClient).rpc('reject_join_request', {
    p_request_id: requestId,
    p_reason: reason ?? null,
  })
  if (error) return { error: joinDecisionError(error.message) }

  revalidatePath('/team')
  return { ok: true }
}
