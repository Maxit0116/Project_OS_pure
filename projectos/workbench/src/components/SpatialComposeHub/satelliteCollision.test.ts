import { describe, expect, it } from 'vitest'

import {
  clampRectToBounds,
  rectsOverlap,
  separateFromOthers,
} from './satelliteCollision'

describe('satelliteCollision', () => {
  it('detects overlap with gap', () => {
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 40 },
        { x: 90, y: 0, width: 100, height: 40 },
        10,
      ),
    ).toBe(true)
    expect(
      rectsOverlap(
        { x: 0, y: 0, width: 100, height: 40 },
        { x: 120, y: 0, width: 100, height: 40 },
        10,
      ),
    ).toBe(false)
  })

  it('separates overlapping rects without leaving them stacked', () => {
    const moved = separateFromOthers(
      { x: 50, y: 50, width: 100, height: 40 },
      [{ x: 60, y: 55, width: 100, height: 40 }],
      8,
    )
    expect(
      rectsOverlap(moved, { x: 60, y: 55, width: 100, height: 40 }, 8),
    ).toBe(false)
  })

  it('clamps into viewport', () => {
    const clamped = clampRectToBounds(
      { x: -40, y: 900, width: 100, height: 40 },
      { width: 800, height: 600 },
      8,
    )
    expect(clamped.x).toBe(8)
    expect(clamped.y).toBeLessThanOrEqual(600 - 40 - 8)
  })
})
