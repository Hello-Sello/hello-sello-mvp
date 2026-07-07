import { redirect } from 'next/navigation'
import { createClient } from '@/shared/db/server'
import { getCurrentUser, getCurrentPerson } from '@/shared/auth'
import { SecurityClient, type LinkedIdentity } from './SecurityClient'

/**
 * /settings/security — the Login & security surface (SET-01 Personal / SET-02).
 *
 * Thin server route (mirrors settings/profile/page.tsx): load the caller's email, their
 * linked OAuth identities, and their pending email + deletion-runway state, then hand it
 * all to the client component that owns the interactions. Gated by default — the proxy
 * bounces a signed-out visitor before this runs; the redirect is a defensive floor.
 */
export default async function SecurityPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const person = await getCurrentPerson()

  // Linked sign-in methods come straight from GoTrue (the SSOT for identities). The
  // sole-identity guard lives in the unlink action; the UI just reflects what's linked.
  const supabase = await createClient()
  const { data: idData } = await supabase.auth.getUserIdentities()
  const identities: LinkedIdentity[] = (idData?.identities ?? []).map((i) => ({
    identityId: i.identity_id,
    provider: i.provider,
    email: (i.identity_data?.email as string | undefined) ?? user.email ?? '',
  }))

  // A staged email change lives in auth.users.new_email until the new address confirms.
  const pendingEmail = (user as { new_email?: string | null }).new_email ?? null

  return (
    <SecurityClient
      email={user.email ?? ''}
      pendingEmail={pendingEmail}
      identities={identities}
      deletionScheduledFor={person?.deletion_scheduled_for ?? null}
    />
  )
}
