import { describe, it, expect } from 'vitest'
import { buildVCard } from './vcard'

describe('buildVCard', () => {
  it('escapes semicolons in text values so they do not break vCard structure', () => {
    // A title like "Head; Sales" must not introduce a spurious field separator.
    const v = buildVCard({ displayName: 'Ann', title: 'Head; Sales' })
    expect(v).toContain('TITLE:Head\\; Sales')
  })

  it('escapes commas in the organization name', () => {
    const v = buildVCard({ displayName: 'Ann', company: { name: 'Acme, Inc.' } })
    expect(v).toContain('ORG:Acme\\, Inc.')
  })

  it('escapes backslashes and newlines', () => {
    const v = buildVCard({ displayName: 'Ann', title: 'a\\b\nc' })
    expect(v).toContain('TITLE:a\\\\b\\nc')
  })

  it('keeps the structural separators of the N field unescaped', () => {
    const v = buildVCard({ displayName: 'Jane Doe' })
    expect(v).toContain('\r\nN:Doe;Jane;;;\r\n')
  })

  it('omits fields that are empty', () => {
    const v = buildVCard({ displayName: 'Ann' })
    expect(v).not.toContain('TITLE:')
    expect(v).not.toContain('ORG:')
    expect(v).not.toContain('TEL')
    expect(v).not.toContain('URL:')
  })

  it('includes all provided contact fields', () => {
    const v = buildVCard({
      displayName: 'Ann Lee',
      title: 'CEO',
      email: 'a@b.co',
      phone: '+49 1',
      linkedin: 'in/ann',
      company: { name: 'Acme', website: 'acme.co' },
    })
    expect(v).toContain('FN:Ann Lee')
    expect(v).toContain('TITLE:CEO')
    expect(v).toContain('ORG:Acme')
    expect(v).toContain('EMAIL;TYPE=WORK:a@b.co')
    expect(v).toContain('TEL;TYPE=WORK,VOICE:+49 1')
    expect(v).toContain('URL:acme.co')
    expect(v).toContain('X-SOCIALPROFILE;TYPE=linkedin:in/ann')
    expect(v.startsWith('BEGIN:VCARD')).toBe(true)
    expect(v.endsWith('END:VCARD')).toBe(true)
  })
})
