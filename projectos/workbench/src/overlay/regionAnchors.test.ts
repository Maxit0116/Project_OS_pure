import { describe, expect, it } from 'vitest'

import { nearestAnchorToRelative, renumberArrows, colorForArrowIndex } from './arrowGeometry'
import {
  clientToRelative,
  listRegionAnchors,
  pointInRect,
  relativeToClient,
} from './regionAnchors'
import { focusIdsForClick, isOutsideAllRegions } from './overlayRegions'
import type { OverlayRegion } from './overlayRegions'

describe('regionAnchors', () => {
  const rect = { x: 100, y: 50, width: 200, height: 100 }

  it('lists eight anchors at corners and edge midpoints', () => {
    const anchors = listRegionAnchors(rect)
    expect(anchors).toHaveLength(8)
    const topLeft = anchors.find((a) => a.anchor === 'topLeft')
    expect(topLeft?.screen).toEqual({ x: 100, y: 50 })
    const right = anchors.find((a) => a.anchor === 'right')
    expect(right?.screen).toEqual({ x: 300, y: 100 })
  })

  it('converts client ↔ relative including out-of-rect', () => {
    expect(clientToRelative(rect, 100, 50)).toEqual({ x: 0, y: 0 })
    expect(clientToRelative(rect, 300, 150)).toEqual({ x: 1, y: 1 })
    const outside = clientToRelative(rect, 350, 30)
    expect(outside.x).toBeGreaterThan(1)
    expect(outside.y).toBeLessThan(0)
    expect(relativeToClient(rect, outside)).toEqual({ x: 350, y: 30 })
  })

  it('hit-tests pointInRect', () => {
    expect(pointInRect(rect, 150, 80)).toBe(true)
    expect(pointInRect(rect, 50, 80)).toBe(false)
  })
})

describe('arrowGeometry', () => {
  it('picks the closest of eight anchors to a tail', () => {
    expect(nearestAnchorToRelative({ x: 1.2, y: 0.5 })).toBe('right')
    expect(nearestAnchorToRelative({ x: 0.5, y: -0.2 })).toBe('top')
    expect(nearestAnchorToRelative({ x: 0, y: 0 })).toBe('topLeft')
  })

  it('renumbers and recolors after delete', () => {
    const next = renumberArrows([
      { index: 1, color: colorForArrowIndex(1), id: 'a' },
      { index: 3, color: colorForArrowIndex(3), id: 'c' },
    ])
    expect(next.map((a) => a.index)).toEqual([1, 2])
    expect(next[1]?.color).toBe(colorForArrowIndex(2))
  })
})

describe('overlayRegions focus', () => {
  function region(
    id: string,
    rect: { x: number; y: number; width: number; height: number },
  ): OverlayRegion {
    return {
      id,
      captureRect: rect,
      mode: 'change',
      regionPrompt: '',
      arrows: [],
      drawStrokes: [],
      flowComplete: false,
      showAnchors: false,
      tool: 'arrow',
      stencils: [],
    }
  }

  it('focuses all overlapping regions at a click', () => {
    const regions = [
      region('a', { x: 0, y: 0, width: 100, height: 100 }),
      region('b', { x: 50, y: 50, width: 100, height: 100 }),
      region('c', { x: 200, y: 200, width: 50, height: 50 }),
    ]
    expect(focusIdsForClick(regions, 60, 60).sort()).toEqual(['a', 'b'])
    expect(focusIdsForClick(regions, 10, 10)).toEqual(['a'])
    expect(isOutsideAllRegions(regions, 400, 400)).toBe(true)
  })
})
