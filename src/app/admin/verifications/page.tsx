import { createClient } from '@/shared/db/server'
import { VerificationQueue, type PendingRow } from './VerificationQueue'

/**
 * VERIF-01: Pending-company queue for HS reviewers.
 *
 * The route-door guard (admin/layout.tsx) has already confirmed the caller is
 * an HS-team member before this RSC runs. list_pending_verifications() returns
 * oldest-first per D-08; a non-HS caller gets 0 rows (fail-safe body gate).
 */
export default async function VerificationsPage() {
  const supabase = await createClient()

  // Un-regenerated RPC: localized cast (codebase pattern, STATE.md 2026-06-11).
  const { data, error } = await (supabase as unknown as {
    rpc: (fn: string) => Promise<{ data: PendingRow[] | null; error: { message: string } | null }>
  }).rpc('list_pending_verifications')

  if (error) {
    // Surface the error clearly for debugging; the route guard means only HS
    // team members reach this point so this message is internal-only.
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-red-600">
          Could not load the verification queue: {error.message}
        </p>
      </div>
    )
  }

  const rows: PendingRow[] = data ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-ink">Company Verification</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review and approve or reject companies awaiting verification.
        </p>
      </div>

      <VerificationQueue rows={rows} />
    </div>
  )
}
