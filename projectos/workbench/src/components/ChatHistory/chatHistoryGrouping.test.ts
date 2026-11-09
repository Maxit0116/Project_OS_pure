import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import {
  chatHistoryStatusLabelKey,
  groupChatHistorySessions,
} from './chatHistoryGrouping'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  // One fixed time: heads made a millisecond apart sorted newest first and swapped the expected order.
  const now = '2026-08-02T11:00:00.000Z'
  return {
    id: partial.id,
    title: partial.title ?? partial.id,
    createdAt: partial.createdAt ?? now,
    lastUpdatedAt: partial.lastUpdatedAt ?? now,
    chatMode: partial.chatMode ?? 'ask',
    isArchived: partial.isArchived ?? false,
    status: partial.status ?? 'idle',
    ...(partial.subtitle ? { subtitle: partial.subtitle } : {}),
  }
}

describe('groupChatHistorySessions', () => {
  const now = new Date('2026-08-02T12:00:00.000Z').getTime()

  it('keeps pinned first, then a recent working set by activity, then date buckets', () => {
    const groups = groupChatHistorySessions({
      now,
      pinnedIds: ['pinned'],
      activeSessionId: 'active',
      searchQuery: '',
      workingSetSize: 3,
      heads: [
        head({ id: 'pinned', title: 'Pinned', lastUpdatedAt: '2026-08-01T12:00:00.000Z' }),
        head({
          id: 'review',
          title: 'Review',
          status: 'awaiting_review',
          lastUpdatedAt: '2026-08-02T11:00:00.000Z',
        }),
        head({
          id: 'running',
          title: 'Running',
          status: 'running',
          lastUpdatedAt: '2026-08-02T10:00:00.000Z',
        }),
        head({
          id: 'active',
          title: 'Active',
          lastUpdatedAt: '2026-08-02T09:00:00.000Z',
        }),
        head({
          id: 'older-today',
          title: 'Older today',
          lastUpdatedAt: '2026-08-02T08:00:00.000Z',
        }),
        head({
          id: 'archived',
          title: 'Archived',
          isArchived: true,
          lastUpdatedAt: '2026-07-01T12:00:00.000Z',
        }),
      ],
    })

    expect(groups.map((group) => group.key)).toEqual([
      'pinned',
      'recent',
      'today',
      'archived',
    ])
    expect(groups.find((group) => group.key === 'pinned')?.sessionIds).toEqual(['pinned'])
    // Status does not split the working set — newest activity wins.
    expect(groups.find((group) => group.key === 'recent')?.sessionIds).toEqual([
      'review',
      'running',
      'active',
    ])
    expect(groups.find((group) => group.key === 'today')?.sessionIds).toEqual(['older-today'])
  })

  it('floats the most recently updated session to the top of recent', () => {
    const groups = groupChatHistorySessions({
      now,
      pinnedIds: [],
      activeSessionId: 'a',
      searchQuery: '',
      workingSetSize: 8,
      heads: [
        head({ id: 'a', lastUpdatedAt: '2026-08-02T09:00:00.000Z' }),
        head({ id: 'b', lastUpdatedAt: '2026-08-02T11:30:00.000Z' }),
        head({ id: 'c', lastUpdatedAt: '2026-08-02T10:00:00.000Z' }),
      ],
    })

    expect(groups).toEqual([
      {
        key: 'recent',
        labelKey: 'chat.history.recent',
        sessionIds: ['b', 'c', 'a'],
      },
    ])
  })

  it('keeps the active session in the working set even when quieter than overflow peers', () => {
    const groups = groupChatHistorySessions({
      now,
      pinnedIds: [],
      activeSessionId: 'quiet-active',
      searchQuery: '',
      workingSetSize: 2,
      heads: [
        head({ id: 'hot-1', lastUpdatedAt: '2026-08-02T11:00:00.000Z' }),
        head({ id: 'hot-2', lastUpdatedAt: '2026-08-02T10:30:00.000Z' }),
        head({ id: 'hot-3', lastUpdatedAt: '2026-08-02T10:00:00.000Z' }),
        head({
          id: 'quiet-active',
          lastUpdatedAt: '2026-08-01T08:00:00.000Z',
        }),
      ],
    })

    expect(groups.find((group) => group.key === 'recent')?.sessionIds).toEqual([
      'quiet-active',
      'hot-1',
    ])
    expect(groups.find((group) => group.key === 'today')?.sessionIds).toEqual([
      'hot-2',
      'hot-3',
    ])
  })

  it('filters by search query', () => {
    const groups = groupChatHistorySessions({
      now,
      pinnedIds: [],
      activeSessionId: null,
      searchQuery: 'billing',
      heads: [
        head({ id: 'a', title: 'Billing question' }),
        head({ id: 'b', title: 'Login flow', subtitle: 'billing copy' }),
        head({ id: 'c', title: 'Other' }),
      ],
    })

    const ids = groups.flatMap((group) => group.sessionIds)
    expect(ids.sort()).toEqual(['a', 'b'])
  })
})

describe('chatHistoryStatusLabelKey', () => {
  it('maps actionable statuses to history badge keys', () => {
    expect(chatHistoryStatusLabelKey('running')).toBe('chat.history.inProgress')
    expect(chatHistoryStatusLabelKey('awaiting_review')).toBe('chat.history.awaitingReview')
    expect(chatHistoryStatusLabelKey('error')).toBe('chat.history.error')
    expect(chatHistoryStatusLabelKey('idle')).toBeNull()
  })
})
