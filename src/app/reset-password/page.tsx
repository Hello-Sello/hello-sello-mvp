'use client'

import { useActionState } from 'react'
import { setNewPassword } from './actions'
import type { AuthState } from '@/app/(auth)/actions'
import { AuthCard, Field } from '@/app/(auth)/AuthCard'

const initial: AuthState = {}

// Reached only WITH a recovery session (set at /auth/confirm?type=recovery) — the
// proxy gate, not an allowlist entry, lets the authenticated visitor through and
// bounces a sessionless one to /login (Pitfall 3). Same form shape as /login.
export default function ResetPasswordPage() {
  const [state, action, pending] = useActionState(setNewPassword, initial)

  return (
    <AuthCard title="Set a new password" subtitle="Choose a new password for your account">
      <form action={action} className="flex flex-col gap-3">
        <Field
          label="New password"
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
          {pending ? 'Saving…' : 'Set new password'}
        </button>
      </form>
    </AuthCard>
  )
}
