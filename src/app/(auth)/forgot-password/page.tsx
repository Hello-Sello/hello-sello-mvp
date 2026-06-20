'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset, type AuthState } from '../actions'
import { AuthCard, Field } from '../AuthCard'

const initial: AuthState = {}

export default function ForgotPasswordPage() {
  const [, action, pending] = useActionState(requestPasswordReset, initial)
  // The action always returns {} (anti-enumeration), so the page tracks its own
  // "submitted" flag to swap in the neutral confirmation screen — we never reveal
  // whether the address is registered.
  const [submitted, setSubmitted] = useState(false)

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
      {submitted ? (
        <p className="text-sm text-ink-muted">
          If an account exists for that email, we&apos;ve sent a link to reset your
          password. Check your inbox (and spam) for the next step.
        </p>
      ) : (
        <form
          action={(formData) => {
            setSubmitted(true)
            action(formData)
          }}
          className="flex flex-col gap-3"
        >
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
