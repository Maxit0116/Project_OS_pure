import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import EdgeRails from './EdgeRails'

describe('EdgeRails', () => {
  it('keeps collapsed-panel reopen buttons outside the map stacking context', () => {
    const html = renderToStaticMarkup(
      <EdgeRails leftMounted={false} rightMounted={false} terminalDocked={false} />,
    )
    expect(html).toContain('data-edge-rail-layer')
    expect(html.match(/data-edge-rail/g)).toHaveLength(3)
  })

  it('hides a rail while that panel is still mounted', () => {
    const html = renderToStaticMarkup(
      <EdgeRails leftMounted={true} rightMounted={false} terminalDocked={true} />,
    )
    expect(html).toContain('data-edge-rail-layer')
    expect(html.match(/data-edge-rail=""/g)).toHaveLength(1)
  })
})
