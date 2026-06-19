'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { signIn, type AuthState } from '../actions'
import { AuthCard, Field, OrDivider } from '../AuthCard'
import { SocialButtons } from '../SocialButtons'

const initial: AuthState = {}

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, initial)

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to Hello Sello"
      footer={
        <>
          No account?{' '}
          <Link href="/signup" className="font-semibold text-brand">
            Sign up
          </Link>
        </>
      }
    >
      <SocialButtons />
      <OrDivider label="or" />
      <form action={action} className="flex flex-col gap-3">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
        {state.error && <p className="text-sm text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-deep disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  )
}
