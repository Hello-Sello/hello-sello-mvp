import { redirect } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createClient } from '@/shared/db/server'
import { getCurrentUser } from '@/shared/auth'

/**
 * The Superadmin server-door for the whole /settings/organization subtree (SET-01, D-03).
 *
 * Mirrors team/page.tsx's boolean-RPC gate — the SAME `has_permission('team.manage')`
 * predicate the team + company RPCs enforce (T-11-19), so "can open Organization" and
 * "can act on the org" are one decision. This is defense-in-depth: the outer settings
 * sidebar already lists the Organization links to everyone (13-09), and the matrix RPC
 * is the REAL boundary; this layer guarantees a Member NEVER sees org data even by a
 * direct URL — the gate runs before any child page loads.
 *
 * Fail-closed: any RPC error or a non-`true` result → the NotAuthorized card (no org data
 * reaches the client). This is a server door, NOT the proxy's job (B7 lock).
 */
export default async function OrganizationLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  // Un-regenerated RPC → localized cast at the call site (codebase pattern).
  const { data: canManage } = await (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: unknown }>
  }).rpc('has_permission', { p_action: 'team.manage' })

  if (canManage !== true) return <NotAuthorized />

  return <>{children}</>
}

// Non-Superadmin landing — server-rendered inside the settings shell; no org data ever
// reaches the client. Copy adapted from team/page.tsx's NotAuthorized card.
function NotAuthorized() {
  return (
    <div className="glass-strong flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <ShieldAlert size={22} />
      </span>
      <h1 className="text-lg font-bold text-ink">Organization settings are Superadmin-only</h1>
      <p className="max-w-prose text-sm text-ink-muted">
        Only a company Superadmin can manage the company profile, team, and company security.
        Ask a Superadmin in your company if you need access.
      </p>
    </div>
  )
}
