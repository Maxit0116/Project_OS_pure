import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { CustomModeIcon } from './customModeIcons'

describe('CustomModeIcon', () => {
  it('maps checklist to a lucide svg', () => {
    const html = renderToStaticMarkup(<CustomModeIcon icon="checklist" />)
    expect(html).toContain('svg')
  })

  it('falls back to literal glyph when unknown', () => {
    const html = renderToStaticMarkup(<CustomModeIcon icon="★" />)
    expect(html).toContain('★')
  })
})
