import { describe, expect, it } from 'vitest'
import type { ChatSessionHead } from '@contracts/index'
import { groupChatHistorySessions } from './chatHistoryGrouping'

function head(partial: Partial<ChatSessionHead> & Pick<ChatSessionHead, 'id'>): ChatSessionHead {
  const now = new Date().toISOString()
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

  it('orders pinned and status groups before date buckets', () => {
    const groups = groupChatHistorySessions({
      now,
      pinnedIds: ['pinned'],
      activeSessionId: 'today',
      searchQuery: '',
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
        head({ id: 'today', title: 'Today', lastUpdatedAt: '2026-08-02T09:00:00.000Z' }),
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
      'awaitingReview',
      'inProgress',
      'today',
      'archived',
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
    expect(ids).toEqual(['a', 'b'])
  })
})
