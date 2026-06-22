import { describe, it, expect } from 'vitest'
import { isProfileComplete } from './completeness'

describe('isProfileComplete', () => {
  it('treats a mononym (name + role + photo, no surname) as complete', () => {
    // The bug: a single-name OAuth user could never finish onboarding because
    // the old check required last_name. The canonical name is display_name.
    expect(
      isProfileComplete({ displayName: 'Muskan', title: 'Director', avatarPath: 'uid/avatar' }),
    ).toBe(true)
  })

  it('is incomplete without a display name', () => {
    expect(isProfileComplete({ displayName: '', title: 'Director', avatarPath: 'uid/avatar' })).toBe(false)
    expect(isProfileComplete({ displayName: null, title: 'Director', avatarPath: 'uid/avatar' })).toBe(false)
  })

  it('is incomplete without a role/title', () => {
    expect(isProfileComplete({ displayName: 'Muskan', title: '', avatarPath: 'uid/avatar' })).toBe(false)
  })

  it('is incomplete without a photo', () => {
    expect(isProfileComplete({ displayName: 'Muskan', title: 'Director', avatarPath: null })).toBe(false)
  })

  it('does not count whitespace-only values', () => {
    expect(isProfileComplete({ displayName: '   ', title: 'Director', avatarPath: 'uid/avatar' })).toBe(false)
  })
})
