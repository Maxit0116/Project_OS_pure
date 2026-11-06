import { describe, expect, it } from 'vitest'
import {
  applyCanvasPositionOverrides,
  emptySessionGraphCanvasLayout,
  getGraphCanvasPositions,
  pruneGraphCanvasPositions,
  setSessionCanvasPosition,
} from './sessionGraphCanvasLayout'
import type { SessionGraphLayout } from './layoutSessionGraph'

describe('sessionGraphCanvasLayout', () => {
  it('stores and reads per-graph session positions', () => {
    const next = setSessionCanvasPosition(
      emptySessionGraphCanvasLayout(),
      'graph_a',
      'session_1',
      { x: 120, y: 80 },
    )
    expect(getGraphCanvasPositions(next, 'graph_a')).toEqual({
      session_1: { x: 120, y: 80 },
    })
    expect(getGraphCanvasPositions(next, 'graph_b')).toEqual({})
  })

  it('applies overrides and expands the world bounds', () => {
    const layout: SessionGraphLayout = {
      width: 300,
      height: 200,
      positions: {
        a: { x: 0, y: 0 },
        b: { x: 0, y: 100 },
      },
      heights: { a: 90, b: 90 },
    }
    const applied = applyCanvasPositionOverrides(layout, {
      b: { x: 400, y: 350 },
    })
    expect(applied.positions.a).toEqual({ x: 0, y: 0 })
    expect(applied.positions.b).toEqual({ x: 400, y: 350 })
    expect(applied.width).toBeGreaterThan(layout.width)
    expect(applied.height).toBeGreaterThan(layout.height)
  })

  it('prunes positions for sessions that left the graph', () => {
    const seeded = setSessionCanvasPosition(
      setSessionCanvasPosition(emptySessionGraphCanvasLayout(), 'g1', 'keep', {
        x: 1,
        y: 2,
      }),
      'g1',
      'gone',
      { x: 3, y: 4 },
    )
    const pruned = pruneGraphCanvasPositions(seeded, 'g1', ['keep'])
    expect(getGraphCanvasPositions(pruned, 'g1')).toEqual({
      keep: { x: 1, y: 2 },
    })
  })
})
