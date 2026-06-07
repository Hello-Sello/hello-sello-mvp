'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MailCheck } from 'lucide-react'
import { Wordmark } from '@/shared/ui/Wordmark'

/**
 * Simulated email-verification step (v0). Supabase email confirmation is OFF, so
 * the user already has a session — this screen is the decided-flow "check your
 * inbox" beat, and "I've verified my email" simply advances to onboarding.
 * Real confirmation (a clicked email link) is a later hardening task.
 */
export function VerifyEmailCard({ email }: { email: string }) {
  const router = useRouter()
  const [resent, setResent] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-gradient-to-b from-white to-brand-soft/40 p-6">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8 text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Wordmark />
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/40">
            <MailCheck size={24} className="text-brand" />
          </span>
        </div>

        <h1 className="text-lg font-semibold text-ink">Verify your email</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We sent a verification link to <span className="font-medium text-ink">{email}</span>.
          Open it to confirm your address.
        </p>

        <button
          type="button"
          onClick={() => router.push('/onboarding')}
          className="mt-6 w-full rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep"
        >
          I&apos;ve verified my email
        </button>

        <button
          type="button"
          onClick={() => setResent(true)}
          disabled={resent}
          className="mt-3 text-xs font-medium text-ink-muted underline transition hover:text-ink disabled:no-underline disabled:opacity-70"
        >
          {resent ? 'Verification email resent' : 'Resend email'}
        </button>
      </div>
    </div>
  )
}
