'use server'

import { createClient } from '@/shared/db/server'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { error: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The three HEL-82 relationship-lifecycle RPCs, wrapped the same shape as
 * approveCompany/rejectCompany (admin/verifications/actions.ts): validate the
 * id, call the RPC, return a structured result, never throw, revalidate the
 * queue on success.
 *
 * Un-regenerated RPCs: localized cast at the .rpc() call site (codebase
 * pattern — see approveCompany). Regenerating database.types.ts wholesale
 * also re-derives unrelated, previously hand-patched entries elsewhere in the
 * repo (e.g. update_deal_draft in modules/deals/actions.ts) and breaks code
 * outside this ticket's scope — see this ticket's own migration header.
 */
type RelationshipAdminRpc = (
  fn: 'suspend_relationship' | 'reactivate_relationship' | 'end_relationship',
  args: Record<string, unknown>,
) => Promise<{ error: { message: string } | null }>

async function callRpc(
  fn: 'suspend_relationship' | 'reactivate_relationship' | 'end_relationship',
  args: Record<string, unknown>,
): Promise<ActionResult> {
  const supabase = await createClient()
  const result = await (supabase as unknown as { rpc: RelationshipAdminRpc }).rpc(fn, args)
  if (result.error) return { error: result.error.message }
  revalidatePath('/admin/relationships')
  return { ok: true }
}

// Clamp server-side, same rationale as discover/actions.ts's inbox note: the
// textarea has no maxLength and `p_reason` is unbounded TEXT, so a crafted
// call must not be able to store an essay in the audit trail.
function clampReason(reason: string): string | null {
  return reason.trim().slice(0, 280) || null
}

export async function suspendRelationship(relationshipId: string, reason: string): Promise<ActionResult> {
  if (!UUID_RE.test(relationshipId)) return { error: 'Invalid relationship ID' }
  return callRpc('suspend_relationship', { p_relationship_id: relationshipId, p_reason: clampReason(reason) })
}

export async function reactivateRelationship(relationshipId: string, reason: string): Promise<ActionResult> {
  if (!UUID_RE.test(relationshipId)) return { error: 'Invalid relationship ID' }
  return callRpc('reactivate_relationship', { p_relationship_id: relationshipId, p_reason: clampReason(reason) })
}

export async function endRelationship(relationshipId: string, reason: string): Promise<ActionResult> {
  if (!UUID_RE.test(relationshipId)) return { error: 'Invalid relationship ID' }
  return callRpc('end_relationship', { p_relationship_id: relationshipId, p_reason: clampReason(reason) })
}
