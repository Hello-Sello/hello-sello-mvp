// Single source of truth for "is a person's profile complete enough" — used by the
// onboarding checklist. Pure (no DB), so it's unit-testable and can't drift from the
// rule. The canonical name is `displayName`; we deliberately do NOT require a surname,
// so single-name (mononym) and social-login identities can complete onboarding.

export type ProfileCompletenessInput = {
  displayName?: string | null
  title?: string | null
  avatarPath?: string | null
}

export function isProfileComplete(p: ProfileCompletenessInput): boolean {
  return Boolean(p.displayName?.trim() && p.title?.trim() && p.avatarPath)
}
