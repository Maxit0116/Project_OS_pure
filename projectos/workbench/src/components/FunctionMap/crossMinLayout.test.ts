import { describe, expect, it } from 'vitest'

import {
  computeCrossMinLayout,
  crossMinLayoutComplexityMode,
  ellipseAttachment,
  hashUnit,
} from './crossMinLayout'
import { gridBoundingBox } from './autoGridLayout'

describe('crossMinLayout complexity guard', () => {
  it('keeps small graphs on the detailed layout path', () => {
    expect(crossMinLayoutComplexityMode(12, 18)).toBe('detailed')
  })

  it('uses the bounded path instead of the full crossing passes for a large graph', () => {
    const nodeIds = Array.from({ length: 120 }, (_, index) => `node-${index}`)
    const edges = nodeIds.slice(1).map((id, index) => ({
      source: nodeIds[index],
      target: id,
    }))

    expect(crossMinLayoutComplexityMode(nodeIds.length, edges.length)).toBe('bounded')
    const result = computeCrossMinLayout(nodeIds, edges, {
      originX: 0,
      originY: 0,
      width: 1200,
      height: 800,
    })

    expect(result.positions).toHaveLength(nodeIds.length)
    expect(new Set(result.positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(nodeIds.length)
  })

  it('keeps deterministic hash fractions strictly inside the unit interval', () => {
    for (let index = 0; index < 10_000; index += 1) {
      const value = hashUnit(`node-${index}`)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('returns finite ellipse attachments for a zero-radius axis', () => {
    expect(ellipseAttachment(10, 20, 0, 30, 10, 80)).toEqual({ x: 10, y: 50 })
    expect(ellipseAttachment(10, 20, 40, 0, 80, 20)).toEqual({ x: 50, y: 20 })
  })

  it('measures all-negative grid positions without seeding the maximum at zero', () => {
    expect(gridBoundingBox([{ x: -500, y: -400 }])).toEqual({
      minX: -500,
      minY: -400,
      width: 252,
      height: 152,
    })
  })
})
