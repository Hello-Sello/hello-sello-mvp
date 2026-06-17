import { createClient } from '@/shared/db/server'
import { VerificationQueue, type PendingRow, type DecidedRow } from './VerificationQueue'

/**
 * VERIF-01: Pending-company queue for HS reviewers.
 * VERIF-04: Decided tab with audit echo (D-07).
 *
 * The route-door guard (admin/layout.tsx) has already confirmed the caller is
 * an HS-team member before this RSC runs.
 * list_pending_verifications() → oldest-first per D-08; non-HS caller → 0 rows.
 * list_decided_verifications() → most-recently-decided first; non-HS caller → 0 rows.
 */
export default async function VerificationsPage() {
  const supabase = await createClient()

  // Un-regenerated RPCs: localized cast (codebase pattern, STATE.md 2026-06-11).
  const supabaseTyped = supabase as unknown as {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
  }

  const [{ data: pendingData, error: pendingError }, { data: decidedData, error: decidedError }] =
    await Promise.all([
      supabaseTyped.rpc('list_pending_verifications'),
      supabaseTyped.rpc('list_decided_verifications'),
    ])

  if (pendingError) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-red-600">
          Could not load the verification queue: {pendingError.message}
        </p>
      </div>
    )
  }

  const rows: PendingRow[] = (pendingData as PendingRow[] | null) ?? []
  // Decided rows are best-effort — a failure renders the tab empty, not a full page error.
  const decidedRows: DecidedRow[] = decidedError ? [] : ((decidedData as DecidedRow[] | null) ?? [])

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-ink">Company Verification</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Review and approve or reject companies awaiting verification.
        </p>
      </div>

      <VerificationQueue rows={rows} decidedRows={decidedRows} />
    </div>
  )
}
