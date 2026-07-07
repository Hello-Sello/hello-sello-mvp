import { describe, it, expect } from 'vitest'
import { isProfileComplete } from './completeness'

describe('isProfileComplete', () => {
  it('treats a mononym (name + role, no surname) as complete', () => {
    // The bug: a single-name OAuth user could never finish onboarding because
    // the old check required last_name. The canonical name is display_name.
    expect(isProfileComplete({ displayName: 'Muskan', title: 'Director' })).toBe(true)
  })

  it('is complete without a photo (photo is optional — DEV-99 #4)', () => {
    expect(isProfileComplete({ displayName: 'Muskan', title: 'Director' })).toBe(true)
  })

  it('is incomplete without a display name', () => {
    expect(isProfileComplete({ displayName: '', title: 'Director' })).toBe(false)
    expect(isProfileComplete({ displayName: null, title: 'Director' })).toBe(false)
  })

  it('is incomplete without a role/title', () => {
    expect(isProfileComplete({ displayName: 'Muskan', title: '' })).toBe(false)
  })

  it('does not count whitespace-only values', () => {
    expect(isProfileComplete({ displayName: '   ', title: 'Director' })).toBe(false)
  })
})
