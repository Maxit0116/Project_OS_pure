import { describe, expect, it } from 'vitest'
import {
  formatSessionGraphRelativeTime,
  isSessionGraphQuiet,
  sessionMatchesGraphQuery,
  SESSION_GRAPH_QUIET_MS,
} from './sessionGraphCardMeta'

describe('sessionGraphCardMeta', () => {
  it('marks idle sessions quiet after three days', () => {
    const now = Date.parse('2026-08-10T00:00:00.000Z')
    expect(
      isSessionGraphQuiet('2026-08-06T00:00:00.000Z', 'idle', now),
    ).toBe(true)
    expect(
      isSessionGraphQuiet('2026-08-09T00:00:00.000Z', 'idle', now),
    ).toBe(false)
    expect(
      isSessionGraphQuiet('2026-08-01T00:00:00.000Z', 'running', now),
    ).toBe(false)
    expect(SESSION_GRAPH_QUIET_MS).toBe(3 * 24 * 60 * 60 * 1000)
  })

  it('formats relative time', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z')
    expect(formatSessionGraphRelativeTime('2026-08-02T11:00:00.000Z', now)).toBe('1h')
    expect(formatSessionGraphRelativeTime('2026-07-30T12:00:00.000Z', now)).toBe('3d')
  })

  it('filters cards by title, responsibility, and strip', () => {
    expect(
      sessionMatchesGraphQuery('login', {
        title: 'Auth',
        responsibility: 'Fix login redirect',
      }),
    ).toBe(true)
    expect(
      sessionMatchesGraphQuery('callback', {
        title: 'Auth',
        previewStrip: [{ title: 'Keep the callback' }],
      }),
    ).toBe(true)
    expect(
      sessionMatchesGraphQuery('billing', {
        title: 'Auth',
        responsibility: 'Fix login',
        previewStrip: [{ title: 'Keep the callback' }],
      }),
    ).toBe(false)
  })
})
