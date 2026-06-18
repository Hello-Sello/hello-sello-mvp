import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'

/**
 * VERIF-05 route door — the first server-component guard for the /admin route tree.
 *
 * Calls is_hs_team() (a typed RPC, database.types.ts:3774) and redirects non-HS
 * users to / before they can see any admin surface.
 *
 * The proxy (src/proxy.ts) already bounces signed-out users to /login, so by the
 * time this layout runs the session is always authenticated — we only need the
 * role check here, not an auth check.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: isHsTeam } = await supabase.rpc('is_hs_team')
  if (!isHsTeam) redirect('/')
  return <>{children}</>
}
