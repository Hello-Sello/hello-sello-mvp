'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signUp, type AuthState } from '../actions'
import { AuthCard, Field } from '../AuthCard'

const initial: AuthState = {}

export default function SignupPage() {
  const [state, action, pending] = useActionState(signUp, initial)

  return (
    <AuthCard
      title="Create your account"
      subtitle="Join Hello Sello"
      footer={
        <>
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-brand">
            Sign in
          </Link>
        </>
      }
    >
      <form action={action} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Field label="First name" name="first_name" autoComplete="given-name" />
          <Field label="Last name" name="last_name" autoComplete="family-name" />
        </div>
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
        />
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-60"
        >
          {pending ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthCard>
  )
}
