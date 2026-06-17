'use server'

import { createClient } from '@/shared/db/server'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { error: string }

/**
 * approveCompany — wraps the approve_company SECURITY DEFINER RPC.
 *
 * Returns { ok: true } on success (revalidates the queue so the approved company
 * leaves the pending list, D-10) or { error: message } on failure so the client
 * can show a retryable error toast (D-11). Never throws — failures are always
 * surfaced to the caller as a structured result.
 *
 * Un-regenerated RPC: localized cast at the .rpc() call site (codebase pattern).
 */
export async function approveCompany(companyId: string): Promise<ActionResult> {
  const supabase = await createClient()

  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  }).rpc('approve_company', { p_company_id: companyId })

  if (error) return { error: error.message }

  // D-10: revalidate so the queue re-renders without the just-approved company.
  revalidatePath('/admin/verifications')
  return { ok: true }
}
