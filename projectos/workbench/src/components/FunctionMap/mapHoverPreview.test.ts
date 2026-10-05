import { describe, expect, it } from 'vitest'
import { resolvePreviewPosition } from './mapHoverPreview'

const bounds = { left: 100, top: 80, right: 900, bottom: 700 }

describe('resolvePreviewPosition', () => {
  it('keeps the default cursor offset when the preview fits inside bounds', () => {
    const position = resolvePreviewPosition(400, 300, bounds, 240, 160)
    expect(position).toEqual({ x: 418, y: 314 })
  })

  it('only shifts the preview when an edge would overflow', () => {
    const position = resolvePreviewPosition(880, 300, bounds, 240, 160)
    expect(position.x).toBe(900 - 240 - 12)
    expect(position.y).toBe(314)
  })

  it('shifts upward only when the bottom edge would overflow', () => {
    const position = resolvePreviewPosition(400, 680, bounds, 240, 160)
    expect(position.x).toBe(418)
    expect(position.y).toBe(700 - 160 - 12)
  })
})
