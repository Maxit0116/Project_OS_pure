import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import WireframePackOverlay from './WireframePackOverlay'

describe('WireframePackOverlay', () => {
  it('is a no-op after fold into Diagram Graph', () => {
    expect(renderToStaticMarkup(<WireframePackOverlay />)).toBe('')
  })
})
