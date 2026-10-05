import { describe, expect, it } from 'vitest'
import {
  clampDiffBodyHeight,
  DEFAULT_DIFF_BODY_HEIGHT,
  maxDiffBodyHeight,
  MIN_DIFF_BODY_HEIGHT,
} from './diffViewLayout'

describe('diffViewLayout', () => {
  it('exposes a default body height above the previous 280px cap', () => {
    expect(DEFAULT_DIFF_BODY_HEIGHT).toBeGreaterThan(280)
  })

  it('clamps body height between min and 80vh', () => {
    const viewportHeight = 1000
    expect(maxDiffBodyHeight(viewportHeight)).toBe(800)
    expect(clampDiffBodyHeight(100, viewportHeight)).toBe(MIN_DIFF_BODY_HEIGHT)
    expect(clampDiffBodyHeight(500, viewportHeight)).toBe(500)
    expect(clampDiffBodyHeight(900, viewportHeight)).toBe(800)
  })
})
