import { describe, expect, it } from 'vitest'

import {
  clientToWorldPoint,
  formatWorldTransform,
  rectIntersectsWorldView,
  visibleWorldRect,
} from './loopGraphViewport'

describe('loopGraphViewport', () => {
  it('formats the world CSS transform', () => {
    expect(formatWorldTransform({ x: 10, y: -4, scale: 1.25 })).toBe(
      'translate(10px, -4px) scale(1.25)',
    )
  })

  it('maps client coordinates into world space', () => {
    expect(
      clientToWorldPoint(120, 80, { left: 20, top: 10 }, { x: 30, y: 20, scale: 2 }),
    ).toEqual({ x: 35, y: 25 })
  })

  it('expands the visible world rect by screen margin', () => {
    const view = visibleWorldRect(
      { x: 0, y: 0, scale: 1 },
      { width: 100, height: 50 },
      10,
    )
    expect(view).toEqual({
      left: -10,
      top: -10,
      right: 110,
      bottom: 60,
    })
  })

  it('detects AABB intersection against the visible world rect', () => {
    const view = { left: 0, top: 0, right: 100, bottom: 100 }
    expect(rectIntersectsWorldView(50, 50, 10, 10, view)).toBe(true)
    expect(rectIntersectsWorldView(-20, -20, 10, 10, view)).toBe(false)
    expect(rectIntersectsWorldView(95, 95, 20, 20, view)).toBe(true)
  })
})
