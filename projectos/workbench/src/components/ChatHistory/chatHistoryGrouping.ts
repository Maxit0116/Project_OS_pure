import type { ChatSessionHead } from '@contracts/index'

export type ChatHistoryGroupKey =
  | 'pinned'
  | 'awaitingReview'
  | 'inProgress'
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
}

function dateBucket(timestamp: string, now: number): ChatHistoryGroupKey {
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

function isAwaitingReview(head: ChatSessionHead): boolean {
  return head.status === 'awaiting_review'
}

function isInProgress(head: ChatSessionHead): boolean {
  return head.status === 'running'
}

const GROUP_ORDER: ChatHistoryGroupKey[] = [
  'pinned',
  'awaitingReview',
  'inProgress',
  'today',
  'yesterday',
  'thisWeek',
  'older',
  'archived',
]

const GROUP_LABEL_KEYS: Record<ChatHistoryGroupKey, string> = {
  pinned: 'chat.history.pinned',
  awaitingReview: 'chat.history.awaitingReview',
  inProgress: 'chat.history.inProgress',
  today: 'chat.history.today',
  yesterday: 'chat.history.yesterday',
  thisWeek: 'chat.history.thisWeek',
  older: 'chat.history.older',
  archived: 'chat.history.archived',
}

export function groupChatHistorySessions(input: ChatHistoryGroupingInput): ChatHistoryGroup[] {
  const now = input.now ?? Date.now()
  const query = input.searchQuery.trim().toLowerCase()
  const pinnedSet = new Set(input.pinnedIds)
  const buckets = new Map<ChatHistoryGroupKey, string[]>()

  for (const key of GROUP_ORDER) {
    buckets.set(key, [])
  }

  const sortedHeads = [...input.heads].sort((a, b) =>
    b.lastUpdatedAt.localeCompare(a.lastUpdatedAt),
  )

  for (const head of sortedHeads) {
    if (!matchesSearch(head, query)) continue

    if (head.isArchived) {
      buckets.get('archived')!.push(head.id)
      continue
    }

    if (pinnedSet.has(head.id)) {
      buckets.get('pinned')!.push(head.id)
      continue
    }

    if (isAwaitingReview(head)) {
      buckets.get('awaitingReview')!.push(head.id)
      continue
    }

    if (isInProgress(head)) {
      buckets.get('inProgress')!.push(head.id)
      continue
    }

    const bucket = dateBucket(head.lastUpdatedAt, now)
    buckets.get(bucket)!.push(head.id)
  }

  const pinnedOrder = input.pinnedIds.filter((id) => buckets.get('pinned')!.includes(id))
  buckets.set(
    'pinned',
    [
      ...pinnedOrder,
      ...buckets.get('pinned')!.filter((id) => !pinnedOrder.includes(id)),
    ],
  )

  return GROUP_ORDER.map((key) => ({
    key,
    labelKey: GROUP_LABEL_KEYS[key],
    sessionIds: buckets.get(key) ?? [],
  })).filter((group) => group.sessionIds.length > 0)
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
