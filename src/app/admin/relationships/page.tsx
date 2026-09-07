import { createClient } from '@/shared/db/server'
import { RelationshipAdminTable, type RelationshipAdminRow } from './RelationshipAdminTable'

/**
 * HEL-82: relationship suspend/reactivate/end queue for HS reviewers.
 *
 * The route-door guard (admin/layout.tsx) has already confirmed the caller is
 * an HS-team member before this RSC runs. list_relationships_admin() ->
 * non-HS caller -> 0 rows (same fail-safe shape as list_pending_verifications,
 * ../verifications/page.tsx).
 */
export default async function RelationshipsAdminPage() {
  const supabase = await createClient()

  const supabaseTyped = supabase as unknown as {
    rpc: (fn: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
  }

  const { data, error } = await supabaseTyped.rpc('list_relationships_admin')

  if (error) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <p className="text-sm text-red-600">Could not load relationships: {error.message}</p>
      </div>
    )
  }

  const rows: RelationshipAdminRow[] = (data as RelationshipAdminRow[] | null) ?? []

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-xl font-extrabold text-ink">Relationships</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Suspend or end a relationship (e.g. a counterparty&apos;s licence lapses). Historical
          records stay readable either way — only new deals are blocked.
        </p>
      </div>

      <RelationshipAdminTable rows={rows} />
    </div>
  )
}
