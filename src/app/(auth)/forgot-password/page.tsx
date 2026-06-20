'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { requestPasswordReset, type ResetRequestState } from '../actions'
import { AuthCard, Field } from '../AuthCard'

const initial: ResetRequestState = {}

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial)

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a link"
      footer={
        <Link href="/login" className="font-semibold text-brand">
          Back to sign in
        </Link>
      }
    >
      {state.sent ? (
        // Neutral confirmation — the action returns { sent: true } on every outcome,
        // so this screen never reveals whether the address is registered.
        <p className="text-sm text-ink-muted">
          If an account exists for that email, we&apos;ve sent a link to reset your
          password. Check your inbox (and spam) for the next step.
        </p>
      ) : (
        <form action={action} className="flex flex-col gap-3">
          <Field label="Email" name="email" type="email" autoComplete="email" />
          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-60"
          >
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}
