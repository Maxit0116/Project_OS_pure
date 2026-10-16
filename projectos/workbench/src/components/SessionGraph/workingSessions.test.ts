import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import { isWorkingSession, listWorkingSessions } from './workingSessions'

const now = '2026-08-02T00:00:00.000Z'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  return {
    title: partial.title ?? partial.id,
    createdAt: now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    chatMode: 'ask',
    isArchived: false,
    status: 'idle',
    classification: 'topic',
    ...partial,
  }
}

describe('workingSessions', () => {
  it('keeps running, review, error, and the active session', () => {
    expect(isWorkingSession(head({ id: 'a', status: 'running' }), null)).toBe(true)
    expect(isWorkingSession(head({ id: 'b', status: 'awaiting_review' }), null)).toBe(true)
    expect(isWorkingSession(head({ id: 'c', status: 'error' }), null)).toBe(true)
    expect(isWorkingSession(head({ id: 'd', status: 'idle' }), 'd')).toBe(true)
    expect(isWorkingSession(head({ id: 'e', status: 'idle' }), 'other')).toBe(false)
    expect(isWorkingSession(head({ id: 'f', status: 'running', isArchived: true }), null)).toBe(false)
  })

  it('puts the active session first and sorts the rest by recency', () => {
    const listed = listWorkingSessions(
      [
        head({ id: 'old', status: 'running', lastUpdatedAt: '2026-08-01T00:00:00.000Z' }),
        head({ id: 'active', status: 'idle', lastUpdatedAt: '2026-07-01T00:00:00.000Z' }),
        head({ id: 'new', status: 'error', lastUpdatedAt: '2026-08-03T00:00:00.000Z' }),
        head({ id: 'idle', status: 'idle' }),
      ],
      'active',
    )
    expect(listed.map((item) => item.id)).toEqual(['active', 'new', 'old'])
  })
})
