import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/shared/auth'
import { getCompanyProfile } from '@/modules/companies'
import { listTeam, listPendingJoinRequests } from '@/app/team/actions'
import { TeamClient } from '@/app/team/TeamClient'

/**
 * /settings/organization/team — the re-homed team + pending-join-requests surface
 * (SET-01, D-04). The P11 /team page was deliberately built to be re-homed here
 * (P11 D-14): this reuses TeamClient + the existing team/actions.ts reads VERBATIM
 * (moved, not rebuilt). The old /team route 301-redirects to this path (next.config).
 *
 * The Superadmin gate lives once in organization/layout.tsx — this page runs inside it,
 * so it doesn't re-check has_permission (the layout already fails closed for Members,
 * and the team RPCs re-assert the permission server-side anyway, T-11-19).
 */
export default async function OrganizationTeamPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const company = await getCompanyProfile()
  // Fold the Path B pending-requests read alongside listTeam (D-07). Both must succeed
  // before TeamClient renders — a failed pending fetch fails closed to the SAME error
  // card, never to an empty "No pending requests" section (T-12-04-I: a silent failure
  // must not look like an empty queue).
  const [result, pending] = await Promise.all([listTeam(), listPendingJoinRequests()])

  if ('error' in result || 'error' in pending) {
    const message = 'error' in result ? result.error : (pending as { error: string }).error
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="glass-strong rounded-3xl p-8 text-center">
          <p className="text-sm font-medium text-danger">{message}</p>
        </div>
      </div>
    )
  }

  return (
    <TeamClient
      members={result.members}
      pendingRequests={pending.rows}
      companyName={company?.name ?? null}
      currentUserId={user.id}
    />
  )
}
