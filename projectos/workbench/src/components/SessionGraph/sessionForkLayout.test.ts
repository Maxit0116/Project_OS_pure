import { describe, expect, it } from 'vitest'
import type { SessionGraphStripItem } from '@contracts/index'
import {
  buildSessionForkEdgePath,
  placeForkChildPosition,
  placeForkChildPositionClearOfObstacles,
  resolveForkChildClearPosition,
  resolveSessionForkPlacement,
  resolveSessionForkPlacementForPreview,
  resolveSessionForkPlacementFromMessages,
  resolveSessionGraphOverlaps,
  SESSION_FORK_ASIDE_GAP,
  SESSION_FORK_BELOW_GAP,
  SESSION_NODE_CLEARANCE,
  sessionNodeBoundsOverlap,
  sessionStripRowCenterY,
} from './sessionForkLayout'
import {
  estimateSessionNodeHeight,
  SESSION_NODE_WIDTH,
} from './layoutSessionGraph'

function strip(
  partial: Partial<SessionGraphStripItem> & Pick<SessionGraphStripItem, 'id' | 'title'>,
): SessionGraphStripItem {
  return {
    kind: 'intent',
    ts: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

describe('resolveSessionForkPlacement', () => {
  const rows = [
    strip({ id: 'a', title: 'First', messageId: 'u1' }),
    strip({ id: 'b', title: 'Second', messageId: 'u2' }),
    strip({ id: 'c', title: 'Third', messageId: 'u3' }),
  ]

  it('places title / missing fork below the parent', () => {
    expect(resolveSessionForkPlacement(rows, undefined)).toEqual({ forkLayout: 'below' })
    expect(resolveSessionForkPlacement(rows, null)).toEqual({ forkLayout: 'below' })
    expect(resolveSessionForkPlacement([], 'u1')).toEqual({ forkLayout: 'below' })
  })

  it('places the latest strip row below the parent', () => {
    expect(resolveSessionForkPlacement(rows, 'u3')).toEqual({ forkLayout: 'below' })
  })

  it('places earlier strip rows aside, anchored to the row center', () => {
    expect(resolveSessionForkPlacement(rows, 'u1')).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(0),
    })
    expect(resolveSessionForkPlacement(rows, 'u2')).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(1),
    })
  })

  it('does not treat shared throughMessageId on earlier rows as latest', () => {
    const shared = [
      strip({ id: 'n1', title: 'Note', messageId: 'u3' }),
      strip({ id: 'd1', title: 'Decision', messageId: 'u3' }),
      strip({ id: 'i1', title: 'Latest', messageId: 'u3' }),
    ]
    expect(resolveSessionForkPlacement(shared, 'u3')).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(0),
    })
  })
})

describe('resolveSessionForkPlacementForPreview', () => {
  it('anchors aside to the hovered strip row, not a shared messageId', () => {
    const stripRows = [
      strip({ id: 'intent:u1', title: 'First', messageId: 'u1' }),
      strip({ id: 'intent:u2', title: 'Second', messageId: 'u2' }),
      strip({ id: 'intent:u3', title: 'Third', messageId: 'u3' }),
    ]
    const messages = [
      { id: 'u1', role: 'user' },
      { id: 'u2', role: 'user' },
      { id: 'u3', role: 'user' },
    ]
    expect(
      resolveSessionForkPlacementForPreview(stripRows, messages, 'u2', 'intent:u2'),
    ).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(1),
    })
    expect(
      resolveSessionForkPlacementForPreview(stripRows, messages, 'u3', 'intent:u3'),
    ).toEqual({ forkLayout: 'below' })
  })

  it('falls back to transcript order when strip item id is missing', () => {
    const stripRows = [
      strip({ id: 'n1', kind: 'note', title: 'Topic note' }),
      strip({ id: 'd1', kind: 'decision', title: 'Keep callback' }),
    ]
    const messages = [
      { id: 'u1', role: 'user' },
      { id: 'a1', role: 'assistant' },
      { id: 'u2', role: 'user' },
      { id: 'a2', role: 'assistant' },
    ]
    expect(resolveSessionForkPlacementForPreview(stripRows, messages, 'u1')).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(0),
    })
  })
})

describe('resolveSessionForkPlacementFromMessages', () => {
  const messages = [
    { id: 'u1', role: 'user' },
    { id: 'a1', role: 'assistant' },
    { id: 'u2', role: 'user' },
    { id: 'a2', role: 'assistant' },
    { id: 'u3', role: 'user' },
  ]

  it('places the latest user turn below', () => {
    expect(resolveSessionForkPlacementFromMessages(messages, 'u3')).toEqual({
      forkLayout: 'below',
    })
  })

  it('places earlier user turns aside', () => {
    expect(resolveSessionForkPlacementFromMessages(messages, 'u1')).toEqual({
      forkLayout: 'aside',
      forkAnchorOffsetY: sessionStripRowCenterY(0),
    })
  })
})

describe('placeForkChildPosition', () => {
  const parent = { x: 100, y: 80, height: 120 }

  it('stacks below with a vertical gap', () => {
    expect(placeForkChildPosition(parent, { forkLayout: 'below' })).toEqual({
      x: 100,
      y: 80 + 120 + SESSION_FORK_BELOW_GAP,
    })
  })

  it('places aside to the right of the parent card', () => {
    const point = placeForkChildPosition(parent, {
      forkLayout: 'aside',
      forkAnchorOffsetY: 40,
    })
    expect(point.x).toBe(parent.x + SESSION_NODE_WIDTH + SESSION_FORK_ASIDE_GAP)
    expect(point.y).toBeGreaterThanOrEqual(0)
  })
})

describe('resolveForkChildClearPosition', () => {
  const childHeight = estimateSessionNodeHeight(1)
  const childSize = { width: SESSION_NODE_WIDTH, height: childHeight }

  it('keeps the ideal slot when nothing overlaps', () => {
    const proposed = { x: 400, y: 100 }
    expect(
      resolveForkChildClearPosition(proposed, childSize, [], { forkLayout: 'aside' }),
    ).toEqual(proposed)
  })

  it('keeps an aside fork in-column and slides clear of a blocking sibling', () => {
    const proposed = { x: 400, y: 100 }
    const blocker = {
      id: 'sib',
      x: 400,
      y: 90,
      width: SESSION_NODE_WIDTH,
      height: childHeight,
    }
    const cleared = resolveForkChildClearPosition(proposed, childSize, [blocker], {
      forkLayout: 'aside',
    })
    // Prefer vertical slide in the fork column over jumping further right.
    expect(cleared.x).toBe(proposed.x)
    expect(cleared.y).not.toBe(proposed.y)
    expect(
      sessionNodeBoundsOverlap(
        { ...cleared, ...childSize },
        blocker,
        SESSION_NODE_CLEARANCE,
      ),
    ).toBe(false)
  })

  it('stacks a below fork under an occupied default slot', () => {
    const proposed = { x: 100, y: 200 }
    const blocker = {
      id: 'sib',
      x: 100,
      y: 200,
      width: SESSION_NODE_WIDTH,
      height: childHeight,
    }
    const cleared = resolveForkChildClearPosition(proposed, childSize, [blocker], {
      forkLayout: 'below',
    })
    expect(cleared.y).toBe(blocker.y + blocker.height + SESSION_NODE_CLEARANCE)
    expect(
      sessionNodeBoundsOverlap(
        { ...cleared, ...childSize },
        blocker,
        SESSION_NODE_CLEARANCE,
      ),
    ).toBe(false)
  })

  it('walks right only after the preferred aside column is fully blocked', () => {
    const stepY = childHeight + SESSION_NODE_CLEARANCE
    // Cover origin ±6 search rings in the preferred column.
    const columnBlockers = Array.from({ length: 15 }, (_, row) => ({
      id: `sib-${row}`,
      x: 500,
      y: row * stepY,
      width: SESSION_NODE_WIDTH,
      height: childHeight,
    }))
    const proposed = { x: 500, y: 7 * stepY }
    const cleared = resolveForkChildClearPosition(
      proposed,
      childSize,
      columnBlockers,
      { forkLayout: 'aside' },
    )
    expect(cleared.x).toBeGreaterThan(proposed.x)
    for (const blocker of columnBlockers) {
      expect(
        sessionNodeBoundsOverlap(
          { ...cleared, ...childSize },
          blocker,
          SESSION_NODE_CLEARANCE,
        ),
      ).toBe(false)
    }
  })
})

describe('placeForkChildPositionClearOfObstacles', () => {
  const parent = { x: 100, y: 80, height: 160 }
  const childHeight = estimateSessionNodeHeight(1)

  it('avoids the parent card and a sibling already in the default aside slot', () => {
    const ideal = placeForkChildPosition(parent, {
      forkLayout: 'aside',
      forkAnchorOffsetY: 40,
    })
    const obstacles = [
      {
        id: 'parent',
        x: parent.x,
        y: parent.y,
        width: SESSION_NODE_WIDTH,
        height: parent.height,
      },
      {
        id: 'existing-child',
        x: ideal.x,
        y: ideal.y,
        width: SESSION_NODE_WIDTH,
        height: childHeight,
      },
    ]
    const point = placeForkChildPositionClearOfObstacles(
      parent,
      { forkLayout: 'aside', forkAnchorOffsetY: 40 },
      obstacles,
      1,
    )
    for (const obstacle of obstacles) {
      expect(
        sessionNodeBoundsOverlap(
          { ...point, width: SESSION_NODE_WIDTH, height: childHeight },
          obstacle,
          SESSION_NODE_CLEARANCE,
        ),
      ).toBe(false)
    }
  })
})

describe('resolveSessionGraphOverlaps', () => {
  const short = estimateSessionNodeHeight(1)
  const tall = estimateSessionNodeHeight(6)

  it('leaves a clear layout unchanged', () => {
    const result = resolveSessionGraphOverlaps([
      { id: 'a', x: 0, y: 0, width: SESSION_NODE_WIDTH, height: short },
      {
        id: 'b',
        x: 0,
        y: short + SESSION_NODE_CLEARANCE + 40,
        width: SESSION_NODE_WIDTH,
        height: short,
      },
    ])
    expect(result.changed).toBe(false)
    expect(result.positions.a).toEqual({ x: 0, y: 0 })
    expect(result.positions.b?.y).toBe(short + SESSION_NODE_CLEARANCE + 40)
  })

  it('pushes a lower card down when an upper card grows into it', () => {
    const result = resolveSessionGraphOverlaps([
      { id: 'grown', x: 100, y: 40, width: SESSION_NODE_WIDTH, height: tall },
      {
        id: 'below',
        x: 100,
        y: 40 + short + SESSION_NODE_CLEARANCE,
        width: SESSION_NODE_WIDTH,
        height: short,
      },
    ])
    expect(result.changed).toBe(true)
    expect(result.positions.grown).toEqual({ x: 100, y: 40 })
    expect(result.positions.below?.y).toBe(40 + tall + SESSION_NODE_CLEARANCE)
    expect(
      sessionNodeBoundsOverlap(
        {
          id: 'grown',
          x: 100,
          y: 40,
          width: SESSION_NODE_WIDTH,
          height: tall,
        },
        {
          id: 'below',
          x: result.positions.below!.x,
          y: result.positions.below!.y,
          width: SESSION_NODE_WIDTH,
          height: short,
        },
        SESSION_NODE_CLEARANCE,
      ),
    ).toBe(false)
  })

  it('cascades pushes through a stack of overlapping cards', () => {
    const result = resolveSessionGraphOverlaps([
      { id: 'a', x: 0, y: 0, width: SESSION_NODE_WIDTH, height: tall },
      { id: 'b', x: 0, y: 60, width: SESSION_NODE_WIDTH, height: short },
      { id: 'c', x: 0, y: 120, width: SESSION_NODE_WIDTH, height: short },
    ])
    expect(result.changed).toBe(true)
    expect(result.positions.a?.y).toBe(0)
    expect(result.positions.b!.y).toBeGreaterThanOrEqual(tall + SESSION_NODE_CLEARANCE)
    expect(result.positions.c!.y).toBeGreaterThanOrEqual(
      result.positions.b!.y + short + SESSION_NODE_CLEARANCE,
    )
  })
})

describe('buildSessionForkEdgePath', () => {
  const parentH = 120
  const childH = 90

  it('binds a below child to parent bottom-center and child top-center', () => {
    const source = { x: 100, y: 40 }
    const target = { x: 100, y: 40 + parentH + SESSION_FORK_BELOW_GAP }
    const edge = buildSessionForkEdgePath(source, target, parentH, childH, {
      forkLayout: 'below',
    })
    expect(edge.aside).toBe(false)
    expect(edge.path).toContain(`M ${100 + SESSION_NODE_WIDTH / 2} ${40 + parentH}`)
    expect(edge.path).toContain(`${100 + SESSION_NODE_WIDTH / 2} ${target.y}`)
  })

  it('binds an aside child to parent right edge and child left mid', () => {
    const source = { x: 100, y: 40 }
    const target = {
      x: 100 + SESSION_NODE_WIDTH + SESSION_FORK_ASIDE_GAP,
      y: 60,
    }
    const edge = buildSessionForkEdgePath(source, target, parentH, childH, {
      forkLayout: 'aside',
      forkAnchorOffsetY: 40,
    })
    expect(edge.aside).toBe(true)
    expect(edge.path).toContain(`M ${100 + SESSION_NODE_WIDTH} ${40 + 40}`)
    expect(edge.path).toContain(`${target.x} ${60 + childH / 2}`)
  })

  it('falls back to vertical ports when an aside-tagged child sits below', () => {
    const source = { x: 100, y: 40 }
    const target = { x: 100, y: 40 + parentH + SESSION_FORK_BELOW_GAP }
    const edge = buildSessionForkEdgePath(source, target, parentH, childH, {
      forkLayout: 'aside',
      forkAnchorOffsetY: 40,
    })
    expect(edge.aside).toBe(false)
    expect(edge.path).toContain(`M ${100 + SESSION_NODE_WIDTH / 2} ${40 + parentH}`)
  })
})
