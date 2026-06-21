import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/shared/db/server'
import { getCurrentUser } from '@/shared/auth'
import { getCompanyProfile } from '@/modules/companies'
import { listTeam } from './actions'
import { TeamClient } from './TeamClient'

/**
 * /team — standalone team-management page (D-14).
 *
 * Server door, mirroring admin/layout.tsx's boolean-RPC gate: a non-Superadmin must
 * not even SEE this surface, not just be unable to act (defense in depth — the RPCs
 * re-check has_permission too, T-11-19). We gate on `has_permission('team.manage')`,
 * the same matrix-queried predicate the team RPCs enforce — so "can open /team" and
 * "can mutate the team" are one decision. Fail-closed: any RPC error → not authorized.
 *
 * Built self-contained so Phase 13's org-settings tab can absorb it with minimal rework
 * (D-14) — no Phase 13 user-vs-org Settings split is pulled forward here.
 */
export default async function TeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  // Un-regenerated RPC → localized cast at the call site (codebase pattern).
  const { data: canManage } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>
  }).rpc('has_permission', { p_action: 'team.manage' })

  if (canManage !== true) return <NotAuthorized />

  const company = await getCompanyProfile()
  const result = await listTeam()

  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-sm font-medium text-danger">{result.error}</p>
        </div>
      </div>
    )
  }

  return (
    <TeamClient
      members={result.members}
      companyName={company?.name ?? null}
      currentUserId={user.id}
    />
  )
}

// Non-Superadmin landing — server-rendered, no team data ever reaches the client.
function NotAuthorized() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="glass-strong flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <ShieldAlert size={22} />
        </span>
        <h1 className="text-lg font-bold text-ink">Team management is Superadmin-only</h1>
        <p className="max-w-prose text-sm text-ink-muted">
          Only a company Superadmin can invite, remove, or change the roles of members. Ask a
          Superadmin in your company if you need access.
        </p>
      </div>
    </div>
  )
}
