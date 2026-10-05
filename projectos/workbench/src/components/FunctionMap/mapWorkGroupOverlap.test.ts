import { describe, expect, it } from 'vitest'

import type { BoundsRect } from '@contracts/index'
import {
  aabbOverlaps,
  separateFromObstacles,
  shortestSeparationDelta,
} from './mapWorkGroupOverlap'

function rect(id: string, x: number, y: number, width: number, height: number): BoundsRect {
  return { id, x, y, width, height }
}

describe('mapWorkGroupOverlap', () => {
  it('detects overlap and treats flush edges as non-overlapping', () => {
    const a = rect('a', 0, 0, 100, 100)
    const overlapping = rect('b', 50, 50, 100, 100)
    const flush = rect('c', 100, 0, 50, 50)
    expect(aabbOverlaps(a, overlapping)).toBe(true)
    expect(aabbOverlaps(a, flush)).toBe(false)
  })

  it('picks the shortest single-axis push out of an obstacle', () => {
    const moving = rect('m', 90, 0, 100, 100)
    const obstacle = rect('o', 0, 0, 100, 100)
    // Overlap width = 10 on the left side of moving → push right by 10
    expect(shortestSeparationDelta(moving, obstacle)).toEqual({ x: 10, y: 0 })
  })

  it('prefers the nearer vertical exit when that distance is smaller', () => {
    const moving = rect('m', 0, 95, 100, 100)
    const obstacle = rect('o', 0, 0, 100, 100)
    // Overlap height = 5 → push down by 5
    expect(shortestSeparationDelta(moving, obstacle)).toEqual({ x: 0, y: 5 })
  })

  it('separates from multiple obstacles with iterative pushes', () => {
    const moving = rect('m', 50, 50, 80, 80)
    const left = rect('l', 0, 40, 100, 100)
    const top = rect('t', 40, 0, 100, 90)
    const delta = separateFromObstacles(moving, [left, top])
    const resolved = rect('m', moving.x + delta.x, moving.y + delta.y, 80, 80)
    expect(aabbOverlaps(resolved, left)).toBe(false)
    expect(aabbOverlaps(resolved, top)).toBe(false)
  })

  it('returns zero delta when already clear', () => {
    const moving = rect('m', 200, 200, 50, 50)
    const obstacle = rect('o', 0, 0, 100, 100)
    expect(separateFromObstacles(moving, [obstacle])).toEqual({ x: 0, y: 0 })
  })

  it('uses a guaranteed-clear envelope fallback when the iteration budget is exhausted', () => {
    const moving = rect('m', 10, 10, 20, 20)
    const obstacles = [
      rect('left', 0, 0, 30, 80),
      rect('right', 20, 0, 30, 80),
      rect('bottom', 0, 20, 80, 30),
    ]
    const delta = separateFromObstacles(moving, obstacles, 0)
    const resolved = translate(moving, delta)

    expect(obstacles.every((obstacle) => !aabbOverlaps(resolved, obstacle))).toBe(true)
  })
})

function translate(bounds: BoundsRect, delta: { x: number; y: number }): BoundsRect {
  return { ...bounds, x: bounds.x + delta.x, y: bounds.y + delta.y }
}
