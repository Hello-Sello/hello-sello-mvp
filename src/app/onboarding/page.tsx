import { getCurrentPerson } from '@/shared/auth'
import { signOut } from '../(auth)/actions'

/**
 * Post-signup landing. A fresh user is authenticated but has no company yet
 * (Path-B), so they land here instead of the app. 1c (company onboarding —
 * setup / license / verification) replaces this placeholder.
 */
export default async function OnboardingPage() {
  const person = await getCurrentPerson()
  const greeting = person?.first_name ? `, ${person.first_name}` : ''

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="glass-strong w-full max-w-md rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold text-ink">You&apos;re in{greeting} 👋</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Next step: set up your company. Company onboarding — license upload and
          verification — lands in the next build.
        </p>
        <form action={signOut} className="mt-6">
          <button
            type="submit"
            className="rounded-xl border border-white/70 bg-white/70 px-4 py-2 text-sm font-semibold text-ink transition hover:bg-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
