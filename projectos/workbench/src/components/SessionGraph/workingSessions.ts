import type { ChatSessionHead } from '@contracts/index'

const WORKING_STATUSES = new Set(['running', 'awaiting_review', 'error'])

export function isWorkingSession(
  head: ChatSessionHead,
  activeSessionId: string | null,
): boolean {
  if (head.isArchived) return false
  if (head.id === activeSessionId) return true
  return WORKING_STATUSES.has(head.status)
}

/** Active session first, then newest working sessions. */
export function listWorkingSessions(
  heads: ChatSessionHead[],
  activeSessionId: string | null,
): ChatSessionHead[] {
  return heads
    .filter((head) => isWorkingSession(head, activeSessionId))
    .sort((a, b) => {
      if (a.id === activeSessionId) return -1
      if (b.id === activeSessionId) return 1
      return b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
    })
}
