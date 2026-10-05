import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import PanelResizeHandle from './PanelResizeHandle'

describe('PanelResizeHandle accessibility', () => {
  it('exposes a focusable separator with its current range', () => {
    const html = renderToStaticMarkup(
      <PanelResizeHandle
        edge="east"
        onDelta={vi.fn()}
        value={253}
        min={200}
        max={480}
        ariaLabel="Resize tree"
      />,
    )

    expect(html).toContain('role="separator"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-valuenow="253"')
    expect(html).toContain('aria-valuemin="200"')
    expect(html).toContain('aria-valuemax="480"')
  })
})
