import { redirect } from 'next/navigation'

// /settings has no surface of its own — Profile is the landing (D-01). The
// sidebar lives in layout.tsx; this route just forwards to the first Personal
// item so the bare `/settings` deep-link resolves somewhere concrete.
export default function SettingsPage() {
  redirect('/settings/profile')
}
