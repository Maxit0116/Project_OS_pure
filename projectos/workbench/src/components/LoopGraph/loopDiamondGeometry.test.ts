import { describe, expect, it } from 'vitest'
import {
  diamondSizeForContent,
  estimateDiamondBox,
  LOOP_DIAMOND_ASPECT,
  LOOP_DIAMOND_FIT_MARGIN,
  LOOP_DIAMOND_MIN_H,
  LOOP_DIAMOND_MIN_W,
  pointInFlatDiamond,
} from './loopDiamondGeometry'

describe('loopDiamondGeometry', () => {
  it('wraps content under the diamond fit inequality', () => {
    const box = diamondSizeForContent(120, 40)
    const cw = 120 + 12
    const ch = 40 + 8
    expect(cw / box.width + ch / box.height).toBeLessThanOrEqual(
      1 - LOOP_DIAMOND_FIT_MARGIN + 1e-6,
    )
    expect(box.width / box.height).toBeCloseTo(LOOP_DIAMOND_ASPECT, 1)
  })

  it('respects minimum AABB', () => {
    const box = diamondSizeForContent(20, 10)
    expect(box.width).toBeGreaterThanOrEqual(LOOP_DIAMOND_MIN_W)
    expect(box.height).toBeGreaterThanOrEqual(LOOP_DIAMOND_MIN_H)
  })

  it('grows for taller wrapped prompts', () => {
    const short = diamondSizeForContent(100, 28)
    const tall = diamondSizeForContent(100, 64)
    expect(tall.height).toBeGreaterThan(short.height)
    expect(tall.width).toBeGreaterThanOrEqual(short.width)
  })

  it('estimates a usable first-paint box from text', () => {
    const box = estimateDiamondBox({
      title: 'Condition',
      prompt: 'Branch on test_report.status == pass',
    })
    expect(box.width).toBeGreaterThanOrEqual(LOOP_DIAMOND_MIN_W)
    expect(box.height).toBeGreaterThanOrEqual(LOOP_DIAMOND_MIN_H)
  })

  it('hit-tests the painted diamond, not the AABB corners', () => {
    const w = 200
    const h = 100
    // Center and near mid-side vertices (ports) are inside.
    expect(pointInFlatDiamond(w / 2, h / 2, w, h)).toBe(true)
    expect(pointInFlatDiamond(w / 2, h * 0.05, w, h)).toBe(true)
    expect(pointInFlatDiamond(w * 0.95, h / 2, w, h)).toBe(true)
    // AABB corners are outside the rhombus — must not drag the node.
    expect(pointInFlatDiamond(2, 2, w, h)).toBe(false)
    expect(pointInFlatDiamond(w - 2, 2, w, h)).toBe(false)
    expect(pointInFlatDiamond(2, h - 2, w, h)).toBe(false)
    expect(pointInFlatDiamond(w - 2, h - 2, w, h)).toBe(false)
  })
})
