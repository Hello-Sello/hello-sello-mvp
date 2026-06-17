/**
 * Reject-preset domain constants — shared between the server action (actions.ts)
 * and the client form (ReviewActions.tsx).
 *
 * Extracted from actions.ts because Next.js 'use server' files may only export
 * async functions. Plain object/array exports from a 'use server' file cause:
 *   "A 'use server' file can only export async functions, found object."
 *
 * T-03-13 / ASVS V5: rejectCompany validates presetCode against REJECT_PRESETS
 * before calling the DB RPC.
 */

/** D-05 starting set of preset rejection reasons. */
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
  invalid_licence:     'Invalid licence',
  licence_expired:     'Licence expired',
  details_dont_match:  "Details don't match",
  duplicate_company:   'Duplicate company',
  other:               'Other',
}
