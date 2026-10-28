import { describe, expect, it } from 'vitest'
import { resolveSessionNodePreviewPosition } from './sessionNodePreview'

function rect(partial: {
  left: number
  top: number
  width: number
  height: number
}): DOMRect {
  const right = partial.left + partial.width
  const bottom = partial.top + partial.height
  return {
    x: partial.left,
    y: partial.top,
    left: partial.left,
    top: partial.top,
    width: partial.width,
    height: partial.height,
    right,
    bottom,
    toJSON() {
      return this
    },
  }
}

describe('resolveSessionNodePreviewPosition', () => {
  const viewport = { left: 0, top: 0, right: 1000, bottom: 800 }

  it('prefers the right side when there is room', () => {
    const pos = resolveSessionNodePreviewPosition(
      rect({ left: 100, top: 120, width: 228, height: 64 }),
      280,
      200,
      viewport,
    )
    expect(pos.x).toBe(100 + 228 + 10)
    expect(pos.y).toBe(120)
  })

  it('flips to the left near the right edge', () => {
    const pos = resolveSessionNodePreviewPosition(
      rect({ left: 780, top: 120, width: 228, height: 64 }),
      280,
      200,
      viewport,
    )
    expect(pos.x).toBeLessThan(780)
    expect(pos.x + 280).toBeLessThanOrEqual(780 - 10 + 1)
  })

  it('clamps into the viewport near the bottom edge', () => {
    const pos = resolveSessionNodePreviewPosition(
      rect({ left: 100, top: 720, width: 228, height: 64 }),
      280,
      200,
      viewport,
    )
    expect(pos.y + 200).toBeLessThanOrEqual(800 - 12)
  })
})
