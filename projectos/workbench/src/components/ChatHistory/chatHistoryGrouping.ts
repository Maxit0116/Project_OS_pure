import type { ChatSessionHead } from '@contracts/index'

/** Top parallel sessions shown under Recent for fast switching. */
export const CHAT_HISTORY_WORKING_SET_SIZE = 8

export type ChatHistoryGroupKey =
  | 'pinned'
  | 'recent'
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'older'
  | 'archived'

export interface ChatHistoryGroup {
  key: ChatHistoryGroupKey
  labelKey: string
  sessionIds: string[]
}

export interface ChatHistoryGroupingInput {
  heads: ChatSessionHead[]
  pinnedIds: string[]
  activeSessionId: string | null
  searchQuery: string
  now?: number
  workingSetSize?: number
}

function dateBucket(timestamp: string, now: number): Exclude<
  ChatHistoryGroupKey,
  'pinned' | 'recent' | 'archived'
> {
  const date = new Date(timestamp)
  const today = new Date(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)

  if (date.toDateString() === today.toDateString()) return 'today'
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday'
  if (date > weekAgo) return 'thisWeek'
  return 'older'
}

function matchesSearch(head: ChatSessionHead, query: string): boolean {
  if (!query) return true
  const haystack = `${head.title} ${head.subtitle ?? ''}`.toLowerCase()
  return haystack.includes(query)
}

/** Newest activity first; createdAt / id break ties for stable order. */
export function compareChatHistoryActivity(
  a: ChatSessionHead,
  b: ChatSessionHead,
): number {
  const byUpdated = b.lastUpdatedAt.localeCompare(a.lastUpdatedAt)
  if (byUpdated !== 0) return byUpdated
  const byCreated = b.createdAt.localeCompare(a.createdAt)
  if (byCreated !== 0) return byCreated
  return b.id.localeCompare(a.id)
}

const GROUP_ORDER: ChatHistoryGroupKey[] = [
  'pinned',
  'recent',
  'today',
  'yesterday',
  'thisWeek',
  'older',
  'archived',
]

const GROUP_LABEL_KEYS: Record<ChatHistoryGroupKey, string> = {
  pinned: 'chat.history.pinned',
  recent: 'chat.history.recent',
  today: 'chat.history.today',
  yesterday: 'chat.history.yesterday',
  thisWeek: 'chat.history.thisWeek',
  older: 'chat.history.older',
  archived: 'chat.history.archived',
}

/**
 * Build history groups for the chat drawer.
 *
 * Priority: pinned → recent working set (activity float) → date buckets → archived.
 * Status (running / awaiting review / error) is a row badge, not a separate group,
 * so parallel sessions stay clustered at the top for fast switching.
 */
export function groupChatHistorySessions(input: ChatHistoryGroupingInput): ChatHistoryGroup[] {
  const now = input.now ?? Date.now()
  const query = input.searchQuery.trim().toLowerCase()
  const pinnedSet = new Set(input.pinnedIds)
  const workingSetSize = Math.max(1, input.workingSetSize ?? CHAT_HISTORY_WORKING_SET_SIZE)
  const buckets = new Map<ChatHistoryGroupKey, string[]>()

  for (const key of GROUP_ORDER) {
    buckets.set(key, [])
  }

  const matched = input.heads
    .filter((head) => matchesSearch(head, query))
    .sort(compareChatHistoryActivity)

  const pinnedHeads: ChatSessionHead[] = []
  const archivedHeads: ChatSessionHead[] = []
  const eligible: ChatSessionHead[] = []

  for (const head of matched) {
    if (head.isArchived) {
      archivedHeads.push(head)
      continue
    }
    if (pinnedSet.has(head.id)) {
      pinnedHeads.push(head)
      continue
    }
    eligible.push(head)
  }

  const pinnedOrder = input.pinnedIds.filter((id) =>
    pinnedHeads.some((head) => head.id === id),
  )
  buckets.set('pinned', [
    ...pinnedOrder,
    ...pinnedHeads.map((head) => head.id).filter((id) => !pinnedOrder.includes(id)),
  ])

  buckets.set(
    'archived',
    archivedHeads.map((head) => head.id),
  )

  const { recentIds, overflow } = pickWorkingSet(
    eligible,
    input.activeSessionId,
    workingSetSize,
  )
  buckets.set('recent', recentIds)

  for (const head of overflow) {
    const bucket = dateBucket(head.lastUpdatedAt, now)
    buckets.get(bucket)!.push(head.id)
  }

  return GROUP_ORDER.map((key) => ({
    key,
    labelKey: GROUP_LABEL_KEYS[key],
    sessionIds: buckets.get(key) ?? [],
  })).filter((group) => group.sessionIds.length > 0)
}

function pickWorkingSet(
  eligible: ChatSessionHead[],
  activeSessionId: string | null,
  size: number,
): { recentIds: string[]; overflow: ChatSessionHead[] } {
  if (eligible.length === 0) return { recentIds: [], overflow: [] }

  const sorted = [...eligible].sort(compareChatHistoryActivity)
  let recent = sorted.slice(0, size)

  if (activeSessionId) {
    const activeHead = sorted.find((head) => head.id === activeSessionId)
    const alreadyIn = recent.some((head) => head.id === activeSessionId)
    if (activeHead && !alreadyIn) {
      // Keep the open session in the working set even if it has not spoken yet.
      recent = [activeHead, ...recent.filter((head) => head.id !== activeSessionId)].slice(
        0,
        size,
      )
    }
  }

  const recentIdSet = new Set(recent.map((head) => head.id))
  const overflow = sorted.filter((head) => !recentIdSet.has(head.id))
  return {
    recentIds: recent.map((head) => head.id),
    overflow,
  }
}

export function chatHistoryStatusLabelKey(
  status: ChatSessionHead['status'],
): string | null {
  if (status === 'running') return 'chat.history.inProgress'
  if (status === 'awaiting_review') return 'chat.history.awaitingReview'
  if (status === 'error') return 'chat.history.error'
  return null
}

export function formatRelativeChatTime(timestamp: string, now: number): string {
  const date = new Date(timestamp)
  const diffMs = now - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
