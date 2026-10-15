import { describe, expect, it } from 'vitest'
import { resolvePreviewPosition, previewDwellMoved, PREVIEW_DWELL_MS, PREVIEW_DWELL_SLOP_PX } from './mapHoverPreview'

const bounds = { left: 100, top: 80, right: 900, bottom: 700 }

describe('previewDwellMoved', () => {
  it('treats a small pointer jitter as still resting', () => {
    expect(previewDwellMoved({ x: 10, y: 10 }, { x: 16, y: 14 })).toBe(false)
  })

  it('restarts the dwell after the pointer travels past the slop', () => {
    expect(previewDwellMoved({ x: 10, y: 10 }, { x: 30, y: 10 })).toBe(true)
  })

  it('waits a full second before the preview may open', () => {
    expect(PREVIEW_DWELL_MS).toBeGreaterThanOrEqual(1000)
    expect(PREVIEW_DWELL_SLOP_PX).toBeGreaterThan(0)
  })
})

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
