import { describe, expect, it } from 'vitest'
import type { SessionGraphStripItem } from '@contracts/index'
import {
  placeForkChildPosition,
  resolveSessionForkPlacement,
  resolveSessionForkPlacementForPreview,
  resolveSessionForkPlacementFromMessages,
  SESSION_FORK_ASIDE_GAP,
  SESSION_FORK_BELOW_GAP,
  sessionStripRowCenterY,
} from './sessionForkLayout'
import { SESSION_NODE_WIDTH } from './layoutSessionGraph'

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
