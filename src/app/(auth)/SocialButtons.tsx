'use client'

import { signInWithProvider } from './actions'

/**
 * The Google + Outlook sign-in pair shown above the email/password form on both
 * login and signup (CONTEXT: both live, no "coming soon" state). Each button is a
 * one-field form whose `action` is the provider-agnostic `signInWithProvider`
 * server action — Google = 'google', Outlook = 'azure'. Using a form action (not
 * an onClick) keeps the redirect on the server and works without JS.
 */
export function SocialButtons() {
  return (
    <div className="flex flex-col gap-2.5">
      <form action={() => signInWithProvider('google')}>
        <ProviderButton label="Continue with Google" icon={<GoogleIcon />} />
      </form>
      <form action={() => signInWithProvider('azure')}>
        <ProviderButton label="Continue with Outlook" icon={<OutlookIcon />} />
      </form>
    </div>
  )
}

/** A single outlined social button — white fill, faint ink border, brand-lift on hover. */
function ProviderButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-ink/12 bg-white/85 px-4 py-2.5 text-sm font-semibold text-ink shadow-sm transition hover:border-ink/[0.22] hover:bg-white hover:shadow-md"
    >
      {icon}
      {label}
    </button>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09a6.6 6.6 0 0 1 0-4.18V7.07H2.18a11 11 0 0 0 0 9.86l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

function OutlookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#0078D4" d="M13 3h8a1 1 0 0 1 1 1v6h-9V3z" />
      <path fill="#0078D4" d="M22 14v6a1 1 0 0 1-1 1h-8v-7h9z" opacity=".9" />
      <path fill="#28A8EA" d="M2 6.5 11 5v14l-9-1.5v-11z" />
      <circle fill="#fff" cx="6.5" cy="12" r="2.6" />
      <path
        fill="#0078D4"
        d="M6.5 10.4c.9 0 1.4.7 1.4 1.6s-.5 1.6-1.4 1.6-1.4-.7-1.4-1.6.5-1.6 1.4-1.6z"
      />
    </svg>
  )
}
