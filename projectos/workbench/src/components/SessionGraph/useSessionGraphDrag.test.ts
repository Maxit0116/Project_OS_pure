import { describe, expect, it } from 'vitest'
import { previewRailReorder } from './useSessionGraphDrag'

describe('previewRailReorder', () => {
  it('removes the dragged graph and reports a placeholder index', () => {
    const entries = [
      { kind: 'graph', graphId: 'a' },
      { kind: 'graph', graphId: 'b' },
      { kind: 'graph', graphId: 'c' },
    ]
    const preview = previewRailReorder(entries, 'a', 2)
    expect(preview.display.map((e) => e.graphId)).toEqual(['b', 'c'])
    expect(preview.placeholderIndex).toBe(2)
  })
})
