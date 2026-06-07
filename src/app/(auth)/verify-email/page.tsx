import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/shared/auth'
import { VerifyEmailCard } from './VerifyEmailCard'

/**
 * Simulated email-verification step (decided flow, screen 2). Shown right after
 * signup. Confirmation is OFF in v0 so the user already has a session — the card
 * just advances to onboarding. A signed-out visitor has nothing to verify.
 */
export default async function VerifyEmailPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return <VerifyEmailCard email={user.email ?? 'your email'} />
}
