import { VerifyEmailCard } from './VerifyEmailCard'

/**
 * The "check your inbox" screen, shown right after email/password signup. Email
 * confirmation is now ON (CONTEXT), so signUp returns NO session and this route
 * is reached signed-out — it must NOT call getCurrentUser or redirect to /login
 * (research Pitfall 4; the old session-gated version is gone). The email to show
 * arrives via the ?email= URL param that signUp set; 'your email' is the fallback
 * when a visitor lands here without it.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  return <VerifyEmailCard email={email ?? 'your email'} />
}
