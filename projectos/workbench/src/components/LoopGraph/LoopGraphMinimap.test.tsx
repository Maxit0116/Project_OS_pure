import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeGraphBounds } from './LoopGraphMinimap'

vi.mock('../../i18n', () => ({
  useI18n: () => ({
    locale: 'en',
    ts: (key: string) => key,
  }),
}))

describe('LoopGraphMinimap (GC-6.5)', () => {
  it('computeGraphBounds pads node boxes', () => {
    const bounds = computeGraphBounds([
      {
        id: 'a',
        title: 'A',
        prompt: '',
        position: { x: 100, y: 50 },
        role: 'implement',
      },
      {
        id: 'b',
        title: 'B',
        prompt: '',
        position: { x: 300, y: 200 },
        role: 'implement',
      },
    ])
    expect(bounds.minX).toBeLessThan(100)
    expect(bounds.minY).toBeLessThan(50)
    expect(bounds.maxX).toBeGreaterThan(300)
    expect(bounds.width).toBeGreaterThan(0)
    expect(bounds.height).toBeGreaterThan(0)
  })

  it('renders clickable minimap with viewport marker', async () => {
    const { default: LoopGraphMinimap } = await import('./LoopGraphMinimap')
    const html = renderToStaticMarkup(
      <LoopGraphMinimap
        nodes={[
          {
            id: 'n1',
            title: 'One',
            prompt: '',
            position: { x: 0, y: 0 },
            role: 'implement',
          },
          {
            id: 'n2',
            title: 'Two',
            prompt: '',
            position: { x: 240, y: 120 },
            role: 'implement',
          },
        ]}
        viewport={{ x: 32, y: 32, scale: 1 }}
        canvasWidth={800}
        canvasHeight={600}
        onPanToWorld={() => {}}
      />,
    )
    expect(html).toContain('data-testid="loop-graph-minimap"')
    expect(html).toContain('data-loop-minimap=""')
    expect(html).toContain('data-loop-minimap-node="n1"')
    expect(html).toContain('data-loop-minimap-viewport=""')
  })
})
