import { describe, expect, it } from 'vitest'

import {
  hitTestResizeHandle,
  movedCaptureRect,
  movedPlacementLocalRect,
  movedPlacementWithRegionFollow,
  regionRectForStencilDrop,
  resizedPlacementFree,
  resizedRectFromHandle,
} from './regionDrag'

describe('movedCaptureRect', () => {
  it('translates within the viewport', () => {
    expect(
      movedCaptureRect(
        { x: 10, y: 20, width: 100, height: 80 },
        15,
        -5,
        { width: 400, height: 300 },
      ),
    ).toEqual({ x: 25, y: 15, width: 100, height: 80 })
  })

  it('clamps to viewport edges', () => {
    expect(
      movedCaptureRect(
        { x: 10, y: 10, width: 100, height: 80 },
        -50,
        -50,
        { width: 400, height: 300 },
      ),
    ).toEqual({ x: 0, y: 0, width: 100, height: 80 })

    expect(
      movedCaptureRect(
        { x: 10, y: 10, width: 100, height: 80 },
        999,
        999,
        { width: 400, height: 300 },
      ),
    ).toEqual({ x: 300, y: 220, width: 100, height: 80 })
  })
})

describe('regionRectForStencilDrop', () => {
  it('builds a snug region around the drop point', () => {
    const rect = regionRectForStencilDrop(
      { x: 200, y: 150 },
      { width: 160, height: 48 },
      { width: 800, height: 600 },
      24,
    )
    expect(rect.width).toBe(208)
    expect(rect.height).toBe(96)
    expect(rect.x).toBe(200 - 104)
    expect(rect.y).toBe(150 - 48)
  })
})

describe('movedPlacementLocalRect', () => {
  it('clamps inside the region', () => {
    expect(
      movedPlacementLocalRect(
        { x: 10, y: 10, width: 40, height: 20 },
        1000,
        1000,
        { x: 0, y: 0, width: 100, height: 80 },
      ),
    ).toEqual({ x: 60, y: 60, width: 40, height: 20 })
  })
})

describe('movedPlacementWithRegionFollow', () => {
  it('shifts the region when the stub would overflow', () => {
    const originLocal = { x: 8, y: 8, width: 80, height: 40 }
    const originCapture = { x: 100, y: 100, width: 96, height: 56 }
    const { nextCapture, nextLocal } = movedPlacementWithRegionFollow(
      originLocal,
      -20,
      0,
      originCapture,
      { width: 800, height: 600 },
    )
    // Stage-space left edge follows the pointer by -20.
    expect(nextCapture.x + nextLocal.x).toBe(originCapture.x + originLocal.x - 20)
    expect(nextCapture.x).toBe(88)
    expect(nextLocal.x).toBe(0)
  })

  it('moves locally when there is room inside the region', () => {
    const { nextCapture, nextLocal } = movedPlacementWithRegionFollow(
      { x: 10, y: 10, width: 40, height: 20 },
      20,
      10,
      { x: 0, y: 0, width: 200, height: 160 },
      { width: 800, height: 600 },
    )
    expect(nextCapture).toEqual({ x: 0, y: 0, width: 200, height: 160 })
    expect(nextLocal).toEqual({ x: 30, y: 20, width: 40, height: 20 })
  })
})

describe('resizedRectFromHandle', () => {
  it('grows from the bottom-right corner', () => {
    expect(
      resizedRectFromHandle(
        { x: 10, y: 20, width: 100, height: 80 },
        'bottomRight',
        200,
        160,
      ),
    ).toEqual({ x: 10, y: 20, width: 190, height: 140 })
  })

  it('respects min size when shrinking', () => {
    const next = resizedRectFromHandle(
      { x: 10, y: 20, width: 100, height: 80 },
      'bottomRight',
      12,
      22,
      48,
    )
    expect(next.width).toBe(48)
    expect(next.height).toBe(48)
  })

  it('hit-tests corner handles', () => {
    const rect = { x: 10, y: 20, width: 100, height: 80 }
    expect(hitTestResizeHandle(rect, 10, 20, 8)).toBe('topLeft')
    expect(hitTestResizeHandle(rect, 110, 100, 8)).toBe('bottomRight')
    expect(hitTestResizeHandle(rect, 60, 60, 8)).toBeNull()
  })
})

describe('resizedPlacementFree', () => {
  it('expands the region when the stub grows past its capture', () => {
    const { nextCapture, nextLocal } = resizedPlacementFree(
      { x: 8, y: 8, width: 100, height: 40 },
      { x: 100, y: 100, width: 120, height: 56 },
      'bottomRight',
      400,
      300,
      { width: 800, height: 600 },
      16,
    )
    expect(nextCapture.x + nextCapture.width).toBeGreaterThan(220)
    expect(nextLocal.width).toBeGreaterThan(100)
    expect(nextLocal.height).toBeGreaterThan(40)
    // Placement stays inside the (expanded) capture.
    expect(nextLocal.x + nextLocal.width).toBeLessThanOrEqual(
      nextCapture.width + 0.01,
    )
    expect(nextLocal.y + nextLocal.height).toBeLessThanOrEqual(
      nextCapture.height + 0.01,
    )
  })

  it('allows shrinking below the old 48px floor', () => {
    const { nextLocal } = resizedPlacementFree(
      { x: 10, y: 10, width: 100, height: 80 },
      { x: 0, y: 0, width: 400, height: 300 },
      'bottomRight',
      30,
      30,
      { width: 800, height: 600 },
      16,
    )
    expect(nextLocal.width).toBe(20)
    expect(nextLocal.height).toBe(20)
  })
})
