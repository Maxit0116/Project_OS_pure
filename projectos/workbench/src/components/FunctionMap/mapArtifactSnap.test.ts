import { describe, expect, it } from 'vitest'

import type { BoundsRect } from '@contracts/index'
import {
  commitArtifactSnap,
  isDetachedFromGroup,
  resolveArtifactSnap,
  resolveArtifactSnapWithSticky,
  resolveHorizontalAlignForVerticalSnap,
  resolveVerticalAlignForHorizontalSnap,
  snapThresholdsForZoom,
} from './mapArtifactSnap'

const thresholds = snapThresholdsForZoom(1)

describe('mapArtifactSnap perpendicular alignment', () => {
  const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 80 }

  it('prefers left alignment when left edges are closer even if center is rightward', () => {
    // Wider dragged card: left edges nearly aligned, but center sits right of target center.
    const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 80 }
    const dragged: BoundsRect = { id: 'a', x: 95, y: 40, width: 200, height: 60 }
    const leftDelta = Math.abs(dragged.x - target.x)
    const rightDelta = Math.abs(dragged.x + dragged.width - (target.x + target.width))
    expect(leftDelta).toBeLessThan(rightDelta)
    expect(dragged.x + dragged.width / 2).toBeGreaterThan(target.x + target.width / 2)

    const { x, align } = resolveHorizontalAlignForVerticalSnap(dragged, target)
    expect(align).toBe('align-left')
    expect(x).toBe(target.x)
  })

  it('aligns left when dragged is biased to the left on vertical snap', () => {
    const dragged: BoundsRect = { id: 'a', x: 80, y: 170, width: 100, height: 60 }
    const { x, align } = resolveHorizontalAlignForVerticalSnap(dragged, target)
    expect(align).toBe('align-left')
    expect(x).toBe(target.x)
  })

  it('aligns right when dragged is biased to the right on vertical snap', () => {
    const dragged: BoundsRect = { id: 'a', x: 150, y: 170, width: 100, height: 60 }
    const { x, align } = resolveHorizontalAlignForVerticalSnap(dragged, target)
    expect(align).toBe('align-right')
    expect(x).toBe(target.x + target.width - dragged.width)
  })

  it('aligns top when dragged is biased upward on horizontal snap', () => {
    const dragged: BoundsRect = { id: 'a', x: 240, y: 90, width: 100, height: 60 }
    const { y, align } = resolveVerticalAlignForHorizontalSnap(dragged, target)
    expect(align).toBe('align-top')
    expect(y).toBe(target.y)
  })

  it('prefers bottom alignment when bottom edges are closer than top edges', () => {
    const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 200 }
    const dragged: BoundsRect = { id: 'a', x: 230, y: 220, width: 90, height: 60 }
    const { y, align } = resolveVerticalAlignForHorizontalSnap(dragged, target)
    expect(align).toBe('align-bottom')
    expect(y + dragged.height).toBe(target.y + target.height)
  })

  it('commits exact bottom alignment for horizontal adjacency snaps', () => {
    const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 200 }
    const dragged: BoundsRect = { id: 'a', x: 228, y: 220, width: 90, height: 60 }
    const snap = resolveArtifactSnap(dragged, [target], thresholds)
    expect(snap?.snapKind).toBe('left-to-right')
    expect(snap?.perpendicularAlign).toBe('align-bottom')

    const committed = commitArtifactSnap(snap!, dragged, target)
    expect(committed.snappedPosition.x).toBe(target.x + target.width)
    expect(committed.snappedPosition.y + dragged.height).toBe(target.y + target.height)
  })

  it('aligns bottom when dragged is biased downward on horizontal snap', () => {
    const dragged: BoundsRect = { id: 'a', x: 240, y: 130, width: 100, height: 60 }
    const { y, align } = resolveVerticalAlignForHorizontalSnap(dragged, target)
    expect(align).toBe('align-bottom')
    expect(y).toBe(target.y + target.height - dragged.height)
  })

  it('snaps bottom-to-top with left alignment when dragged is left-biased', () => {
    const dragged: BoundsRect = { id: 'a', x: 90, y: 40, width: 100, height: 60 }
    const snap = resolveArtifactSnap(dragged, [target], thresholds)
    expect(snap?.snapKind).toBe('bottom-to-top')
    expect(snap?.snappedPosition).toEqual({ x: target.x, y: target.y - dragged.height })
    expect(snap?.guideLines).toHaveLength(3)
    expect(snap?.guideLines.filter((line) => line.emphasis)).toHaveLength(2)
  })

  it('snaps right-to-left with top alignment when dragged is top-biased', () => {
    const dragged: BoundsRect = { id: 'a', x: 0, y: 95, width: 90, height: 60 }
    const snap = resolveArtifactSnap(dragged, [target], thresholds)
    expect(snap?.snapKind).toBe('right-to-left')
    expect(snap?.snappedPosition).toEqual({ x: target.x - dragged.width, y: target.y })
    expect(snap?.guideLines).toHaveLength(3)
    expect(snap?.guideLines.filter((line) => line.emphasis)).toHaveLength(2)
  })

  it('keeps sticky snap briefly after leaving the tight threshold', () => {
    const dragged: BoundsRect = { id: 'a', x: 0, y: 95, width: 90, height: 60 }
    const initial = resolveArtifactSnap(dragged, [target], thresholds)
    expect(initial).not.toBeNull()

    const slipped: BoundsRect = { id: 'a', x: -12, y: 95, width: 90, height: 60 }
    const withoutSticky = resolveArtifactSnap(slipped, [target], thresholds)
    expect(withoutSticky).toBeNull()

    const withSticky = resolveArtifactSnapWithSticky(slipped, [target], thresholds, initial)
    expect(withSticky?.snapKind).toBe(initial?.snapKind)
    expect(withSticky?.targetId).toBe(initial?.targetId)
  })

  it('snaps horizontally offset cards when centers are close enough', () => {
    const offsetTarget: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 80 }
    const dragged: BoundsRect = { id: 'a', x: 230, y: 130, width: 90, height: 60 }
    const snap = resolveArtifactSnap(dragged, [offsetTarget], thresholds)
    expect(snap?.snapKind).toBe('left-to-right')
  })

  it('does not horizontally snap cards that are close only on the X axis', () => {
    const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 80 }
    const dragged: BoundsRect = { id: 'a', x: 210, y: 300, width: 90, height: 60 }

    expect(resolveArtifactSnap(dragged, [target], thresholds)).toBeNull()
  })

  it('leaves a contact gap between same-workgroup sticky neighbors', () => {
    const target: BoundsRect = { id: 'b', x: 100, y: 100, width: 120, height: 80 }
    const dragged: BoundsRect = { id: 'a', x: 228, y: 100, width: 90, height: 60 }
    const gap = 4
    const snap = resolveArtifactSnap(dragged, [target], thresholds, {
      contactGapBetween: () => gap,
    })
    expect(snap?.snapKind).toBe('left-to-right')
    expect(snap?.snappedPosition.x).toBe(target.x + target.width + gap)

    const committed = commitArtifactSnap(snap!, dragged, target)
    expect(committed.snappedPosition.x).toBe(target.x + target.width + gap)
  })
})

describe('mapArtifactSnap zoom-normalized detach distance', () => {
  const detachedAtScreenGap = (zoom: number, screenGap: number) => {
    const flowGap = screenGap / zoom
    const dragged: BoundsRect = { id: 'a', x: 0, y: 0, width: 100, height: 80 }
    const neighbor: BoundsRect = {
      id: 'b',
      x: dragged.width + flowGap,
      y: 0,
      width: 100,
      height: 80,
    }
    return isDetachedFromGroup(dragged, [neighbor], snapThresholdsForZoom(zoom))
  }

  it('keeps the detach threshold constant in screen pixels at every zoom', () => {
    for (const zoom of [0.5, 1, 2]) {
      expect(detachedAtScreenGap(zoom, 43)).toBe(false)
      expect(detachedAtScreenGap(zoom, 45)).toBe(true)
    }
  })
})
