'use client'

import { useEffect, useState } from 'react'
import { MailCheck } from 'lucide-react'
import { Wordmark } from '@/shared/ui/Wordmark'

const COOLDOWN_SECONDS = 45

/**
 * The honest "check your inbox" waiting state (CONTEXT: replaces the old fake
 * "I've verified my email" button). Email confirmation is ON, so there is no
 * session here and nothing to auto-advance — the user finishes by clicking the
 * link in their inbox, which lands on /auth/confirm. This screen only shows the
 * pending state and lets the user re-request the email on a cooldown.
 *
 * Resend note: no resend server action is wired yet, so the control visibly cools
 * down (disabled + countdown) without re-triggering Supabase's send. The cooldown
 * is the honest, testable behaviour; the actual re-send hook is a later task.
 */
export function VerifyEmailCard({ email }: { email: string }) {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => setRemaining((s) => s - 1), 1000)
    return () => clearInterval(id)
  }, [remaining])

  const cooling = remaining > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-gradient-to-b from-white to-brand-soft/40 p-6">
      <div className="glass-strong w-full max-w-sm rounded-3xl p-8 text-center">
        <div className="mb-6 flex flex-col items-center gap-3">
          <Wordmark />
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft/40">
            <MailCheck size={24} className="text-brand" />
          </span>
        </div>

        <h1 className="text-lg font-semibold text-ink">Check your inbox</h1>
        <p className="mt-2 text-sm text-ink-muted">
          We sent a confirmation link to{' '}
          <span className="font-medium text-ink">{email}</span>. Open it to finish
          creating your account.
        </p>

        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-soft border-t-brand" />
          Waiting for you to confirm…
        </div>

        <p className="mt-6 text-xs text-ink-muted">
          Didn&apos;t get it?{' '}
          {cooling ? (
            <span className="font-normal text-ink-muted/70">
              Sent — you can resend in {remaining}s
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setRemaining(COOLDOWN_SECONDS)}
              className="font-semibold text-ink underline transition hover:text-brand"
            >
              Resend email
            </button>
          )}
        </p>

        <p className="mt-4 text-[11px] text-ink-muted/80">
          This page continues automatically once you click the link.
        </p>
      </div>
    </div>
  )
}
