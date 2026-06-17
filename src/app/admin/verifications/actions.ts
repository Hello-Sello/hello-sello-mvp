'use server'

import { createClient } from '@/shared/db/server'
import { revalidatePath } from 'next/cache'

export type ActionResult = { ok: true } | { error: string }

/**
 * D-05 preset codes — the canonical domain for reject reasons (T-03-13 / ASVS V5).
 * Validated in rejectCompany before the RPC call; must match the UI radio options.
 */
export const REJECT_PRESETS = [
  'invalid_licence',
  'licence_expired',
  'details_dont_match',
  'duplicate_company',
  'other',
] as const

export type RejectPreset = (typeof REJECT_PRESETS)[number]

/** Maps preset code → human-readable label shown in the UI and audit echo. */
export const REJECT_PRESET_LABELS: Record<RejectPreset, string> = {
  invalid_licence:      'Invalid licence',
  licence_expired:      'Licence expired',
  details_dont_match:   'Details don\'t match',
  duplicate_company:    'Duplicate company',
  other:                'Other',
}

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

/**
 * rejectCompany — wraps the reject_company SECURITY DEFINER RPC (VERIF-03 / D-05/06).
 *
 * presetCode must be in REJECT_PRESETS (T-03-13 domain validation before RPC call).
 * note is optional free-text stored in audit_log.reason (D-06).
 *
 * Returns { ok: true } on success or { error: message } on failure. Never throws.
 * Un-regenerated RPC: localized cast at the .rpc() call site (codebase pattern).
 */
export async function rejectCompany(
  companyId: string,
  presetCode: string,
  note: string,
): Promise<ActionResult> {
  // T-03-13 / ASVS V5: validate preset domain before sending to DB.
  if (!(REJECT_PRESETS as readonly string[]).includes(presetCode)) {
    return { error: `Invalid rejection reason: "${presetCode}"` }
  }

  const supabase = await createClient()

  const { error } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>
  }).rpc('reject_company', {
    p_company_id:  companyId,
    p_reason:      note,       // audit_log.reason — may be empty string (optional note)
    p_preset_code: presetCode, // audit_log.metadata.preset (D-06)
  })

  if (error) return { error: error.message }

  // D-10: revalidate so the queue re-renders without the just-rejected company.
  revalidatePath('/admin/verifications')
  return { ok: true }
}
