import { describe, expect, it } from 'vitest'
import {
  adjacentTurnId,
  collectUserTurns,
  computeActiveTurnId,
  filterTurnsByQuery,
  isScrubGesture,
  isScrubVelocity,
  latestTurnId,
  markerTopPercent,
  measureScrollVelocity,
  MIN_USER_TURNS_FOR_NAV,
  NAV_DENSE_TURN_THRESHOLD,
  NAV_RAIL_OUTSIDE_GAP_PX,
  NAV_RAIL_WIDTH_PX,
  NAV_SCRUB_BURST_DELTA_PX,
  NAV_SCRUB_VELOCITY_PX_PER_MS,
  navRailViewportLeft,
  previewSourceForUserContent,
  resolveTurnStatus,
  shouldShowConversationNav,
  truncateNavPreview,
} from './conversationNavTurns'

describe('truncateNavPreview', () => {
  it('collapses whitespace and truncates long text', () => {
    expect(truncateNavPreview('  hello   world  ', 20)).toBe('hello world')
    const long = 'a'.repeat(120)
    const preview = truncateNavPreview(long, 100)
    expect(preview.endsWith('…')).toBe(true)
    expect(preview.length).toBe(100)
  })
})

describe('previewSourceForUserContent', () => {
  it('uses spatial-pin prompt when present', () => {
    const content = [
      'Fix the login button',
      '',
      '[Spatial pin on workspace · snapshot=.projectos/spatial-pins/x.png · rect=1,2 3x4]',
    ].join('\n')
    expect(previewSourceForUserContent(content)).toBe('Fix the login button')
  })

  it('returns ordinary content as-is', () => {
    expect(previewSourceForUserContent('Implement refresh')).toBe('Implement refresh')
  })
})

describe('collectUserTurns', () => {
  it('keeps only non-empty user messages in order', () => {
    const turns = collectUserTurns([
      { id: 'a', role: 'assistant', content: 'hi', timestamp: '2026-01-01T00:00:00.000Z' },
      { id: 'u1', role: 'user', content: '  one  ', timestamp: '2026-01-01T00:01:00.000Z' },
      { id: 'u2', role: 'user', content: '   ', timestamp: '2026-01-01T00:02:00.000Z' },
      { id: 'u3', role: 'user', content: 'two', timestamp: '2026-01-01T00:03:00.000Z' },
      { id: 's', role: 'system', content: 'sys', timestamp: '2026-01-01T00:04:00.000Z' },
    ])
    expect(turns.map((t) => t.id)).toEqual(['u1', 'u3'])
    expect(turns[0]?.preview).toBe('one')
  })

  it('attaches status and activity hints', () => {
    const turns = collectUserTurns(
      [
        {
          id: 'u1',
          role: 'user',
          content: 'run',
          timestamp: '2026-01-01T00:01:00.000Z',
          checkpointId: 'ckpt_1',
          chatMode: 'plan',
        },
        {
          id: 'u2',
          role: 'user',
          content: 'fix',
          timestamp: '2026-01-01T00:02:00.000Z',
          chatMode: 'debug',
        },
      ],
      [
        { id: 'act_err', anchorMessageId: 'u2', status: 'error' },
        { id: 'act_run', anchorMessageId: 'u1', status: 'running' },
      ],
    )
    expect(turns[0]?.status).toBe('running')
    expect(turns[0]?.activityId).toBe('act_run')
    expect(turns[0]?.chatMode).toBe('plan')
    expect(turns[1]?.status).toBe('error')
    expect(turns[1]?.chatMode).toBe('debug')
  })
})

describe('resolveTurnStatus', () => {
  it('prioritizes error over running over checkpoint', () => {
    expect(
      resolveTurnStatus(
        { id: 'm', checkpointId: 'c' },
        [
          { id: 'a1', anchorMessageId: 'm', status: 'running' },
          { id: 'a2', anchorMessageId: 'm', status: 'error' },
        ],
      ),
    ).toBe('error')
    expect(
      resolveTurnStatus({ id: 'm', checkpointId: 'c' }, [
        { id: 'a1', anchorMessageId: 'm', status: 'running' },
      ]),
    ).toBe('running')
    expect(resolveTurnStatus({ id: 'm', checkpointId: 'c' }, [])).toBe('checkpoint')
  })
})

describe('filterTurnsByQuery / markerTopPercent', () => {
  it('filters previews case-insensitively', () => {
    const turns = [
      { id: '1', preview: 'Fix Auth', timestamp: 't' },
      { id: '2', preview: 'Ship UI', timestamp: 't' },
    ]
    expect(filterTurnsByQuery(turns, 'auth').map((t) => t.id)).toEqual(['1'])
    expect(filterTurnsByQuery(turns, '  ').map((t) => t.id)).toEqual(['1', '2'])
  })

  it('maps indices to proportional tops', () => {
    expect(markerTopPercent(0, 1)).toBe(0)
    expect(markerTopPercent(0, 3)).toBe(0)
    expect(markerTopPercent(1, 3)).toBe(50)
    expect(markerTopPercent(2, 3)).toBe(100)
    expect(NAV_DENSE_TURN_THRESHOLD).toBeGreaterThan(MIN_USER_TURNS_FOR_NAV)
  })
})

describe('adjacentTurnId / latestTurnId', () => {
  const ids = ['a', 'b', 'c']

  it('moves prev/next with edge clamping', () => {
    expect(adjacentTurnId(ids, 'b', 'prev')).toBe('a')
    expect(adjacentTurnId(ids, 'a', 'prev')).toBe('a')
    expect(adjacentTurnId(ids, 'b', 'next')).toBe('c')
    expect(adjacentTurnId(ids, 'c', 'next')).toBe('c')
    expect(adjacentTurnId(ids, null, 'next')).toBe('a')
  })

  it('returns latest turn', () => {
    expect(latestTurnId(ids)).toBe('c')
    expect(latestTurnId([])).toBeNull()
  })
})

describe('shouldShowConversationNav', () => {
  it('requires min turns and overflow', () => {
    expect(shouldShowConversationNav(MIN_USER_TURNS_FOR_NAV - 1, null)).toBe(false)
    expect(shouldShowConversationNav(MIN_USER_TURNS_FOR_NAV, null)).toBe(false)

    const overflowing = {
      scrollHeight: 500,
      clientHeight: 200,
    } as HTMLElement
    expect(shouldShowConversationNav(MIN_USER_TURNS_FOR_NAV, overflowing)).toBe(true)

    const fitted = {
      scrollHeight: 200,
      clientHeight: 200,
    } as HTMLElement
    expect(shouldShowConversationNav(MIN_USER_TURNS_FOR_NAV, fitted)).toBe(false)
  })
})

describe('measureScrollVelocity / isScrubVelocity / isScrubGesture', () => {
  it('returns null for unusable sample gaps', () => {
    expect(measureScrollVelocity({ top: 0, t: 100 }, { top: 50, t: 100 })).toBeNull()
    expect(measureScrollVelocity({ top: 0, t: 0 }, { top: 50, t: 200 })).toBeNull()
  })

  it('detects scrub velocity above threshold', () => {
    const velocity = measureScrollVelocity({ top: 0, t: 0 }, { top: 80, t: 40 })
    expect(velocity).toBe(2)
    expect(isScrubVelocity(velocity)).toBe(true)
    expect(isScrubVelocity(NAV_SCRUB_VELOCITY_PX_PER_MS - 0.1)).toBe(false)
  })

  it('accepts burst distance even when frame velocity is low', () => {
    expect(
      isScrubGesture({ velocity: 0.1, burstDeltaPx: NAV_SCRUB_BURST_DELTA_PX }),
    ).toBe(true)
    expect(isScrubGesture({ velocity: 0.1, burstDeltaPx: 4 })).toBe(false)
  })
})

describe('navRailViewportLeft', () => {
  it('places the rail fully outside the sidebar left edge', () => {
    expect(navRailViewportLeft(1000)).toBe(
      1000 - NAV_RAIL_OUTSIDE_GAP_PX - NAV_RAIL_WIDTH_PX,
    )
  })
})

describe('computeActiveTurnId', () => {
  it('picks the last turn at or above the anchor line', () => {
    const children = new Map<string, { top: number }>([
      ['t1', { top: 80 }],
      ['t2', { top: 110 }],
      ['t3', { top: 250 }],
    ])

    const parent = {
      getBoundingClientRect: () => ({ top: 100 }),
      querySelector: (selector: string) => {
        const match = /data-message-id="([^"]+)"/.exec(selector)
        const id = match?.[1]
        if (!id || !children.has(id)) return null
        const top = children.get(id)!.top
        return {
          getBoundingClientRect: () => ({ top }),
        }
      },
    } as unknown as HTMLElement

    // anchorY = 100 + 12 = 112 → t1 (80) and t2 (110) qualify; last is t2
    expect(computeActiveTurnId(parent, ['t1', 't2', 't3'])).toBe('t2')
  })
})
