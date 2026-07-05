import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
// RED until PasswordField.tsx is created.
import { PasswordField } from './PasswordField'

// The repo unit-tests React by asserting the server-rendered HTML string (no
// jsdom/RTL), so these cover the INITIAL contract. The click-to-reveal toggle
// itself is covered by the prototype + E2E, not here.
describe('PasswordField', () => {
  it('renders a masked (type=password) input carrying name + autoComplete + label', () => {
    const html = renderToStaticMarkup(
      <PasswordField label="Password" name="password" autoComplete="current-password" />,
    )
    expect(html).toContain('type="password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('current-password')
    expect(html).toContain('Password')
  })

  it('renders an accessible show-password toggle, hidden by default', () => {
    const html = renderToStaticMarkup(<PasswordField label="Password" name="password" />)
    // semantic button that will NOT submit the form
    expect(html).toContain('type="button"')
    // stable aria-label (we do NOT swap the label text on toggle) + pressed state
    expect(html).toContain('aria-label="Show password"')
    expect(html).toContain('aria-pressed="false"')
  })
})
