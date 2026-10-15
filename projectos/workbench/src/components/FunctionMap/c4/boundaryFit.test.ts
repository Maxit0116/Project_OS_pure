import { describe, expect, it } from 'vitest'
import {
  BOUNDARY_PAD,
  fitBoundaryToMembers,
  snapshotBoundaryMembers,
} from './boundaryFit'

const boundary = {
  id: 'boundary_system',
  position: { x: 0, y: 0 },
  width: 400,
  height: 300,
}

describe('fitBoundaryToMembers', () => {
  const left = { x: 80, y: 120, width: 100, height: 60 }
  const right = { x: 260, y: 140, width: 80, height: 70 }

  it('grows only the side the extreme member crosses', () => {
    const before = fitBoundaryToMembers(boundary, [left, right])
    const shifted = { ...right, x: right.x + 90 }
    const after = fitBoundaryToMembers(boundary, [left, shifted])

    expect(after.position.x).toBe(before.position.x)
    expect(after.position.x).toBe(left.x - BOUNDARY_PAD.left)
    expect(after.position.x + after.width).toBe(shifted.x + shifted.width + BOUNDARY_PAD.right)
    expect(after.width).toBeGreaterThan(before.width)
  })

  it('shrinks back to the same rectangle when the member returns', () => {
    const before = fitBoundaryToMembers(boundary, [left, right])
    const expanded = fitBoundaryToMembers(boundary, [left, { ...right, x: right.x + 120 }])
    const restored = fitBoundaryToMembers(boundary, [left, right])

    expect(expanded.width).toBeGreaterThan(before.width)
    expect(restored).toEqual(before)
  })

  it('does not keep the historical max height after a member moves back down', () => {
    const raised = { ...left, y: left.y - 80 }
    const expanded = fitBoundaryToMembers(boundary, [raised, right])
    const restored = fitBoundaryToMembers(boundary, [left, right])

    expect(expanded.height).toBeGreaterThan(restored.height)
    expect(restored.position.y).toBe(left.y - BOUNDARY_PAD.top)
    expect(restored.height).toBe(
      right.y + right.height - left.y + BOUNDARY_PAD.top + BOUNDARY_PAD.bottom,
    )
  })

  it('stays put when a non-extreme member moves inside the span', () => {
    const middle = { x: 180, y: 150, width: 40, height: 40 }
    const before = fitBoundaryToMembers(boundary, [left, middle, right])
    const after = fitBoundaryToMembers(boundary, [left, { ...middle, x: 200, y: 160 }, right])
    expect(after).toEqual(before)
  })

  it('returns the original box when there are no members', () => {
    expect(fitBoundaryToMembers(boundary, [])).toEqual({
      position: { x: 0, y: 0 },
      width: 400,
      height: 300,
    })
  })

  it('ignores rectangles that are not in the member list', () => {
    const outsider = { x: 70, y: 100, width: 400, height: 200 }
    const fitted = fitBoundaryToMembers(boundary, [left, right])
    const withOutsiderIgnored = fitBoundaryToMembers(boundary, [left, right])
    expect(withOutsiderIgnored).toEqual(fitted)
    expect(outsider.x).toBeLessThan(fitted.position.x + fitted.width)
  })
})

describe('snapshotBoundaryMembers', () => {
  it('keeps nodes that start inside and leaves outside nodes out', () => {
    const membership = snapshotBoundaryMembers(
      [{ id: 'boundary_system', position: { x: 40, y: 40 }, width: 500, height: 240 }],
      [
        {
          id: 'web',
          position: { x: 80, y: 80 },
          width: 120,
          height: 80,
          elementType: 'container',
          level: 'container',
        },
        {
          id: 'stripe',
          position: { x: 700, y: 80 },
          width: 120,
          height: 80,
          elementType: 'external_system',
          level: 'context',
        },
      ],
    )
    expect(membership.boundary_system).toEqual(['web'])
  })
})
