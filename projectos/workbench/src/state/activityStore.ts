import { create } from 'zustand'
import type { ActivityChannel, ActivityEntry } from '@contracts/index'
import { ACTIVITY_BODY_MAX_BYTES, ACTIVITY_LOG_MAX_ENTRIES } from '@contracts/index'

export type ActivityChannelFilter = ActivityChannel | 'all'

function truncateBody(body: string): string {
  if (body.length <= ACTIVITY_BODY_MAX_BYTES) return body
  return body.slice(0, ACTIVITY_BODY_MAX_BYTES) + '\n… [truncated]'
}

function entryId(): string {
  return crypto.randomUUID()
}

interface ActivityStore {
  entries: ActivityEntry[]
  activeChannel: ActivityChannelFilter
  appendEntry: (entry: Omit<ActivityEntry, 'id' | 'timestamp'> & Partial<Pick<ActivityEntry, 'id' | 'timestamp'>>) => void
  appendSystemLine: (line: string) => void
  setActiveChannel: (channel: ActivityChannelFilter) => void
  clearChannel: (channel: ActivityChannel) => void
  clearAll: () => void
  getFilteredEntries: () => ActivityEntry[]
}

export const useActivityStore = create<ActivityStore>((set, get) => ({
  entries: [],
  activeChannel: 'all',

  appendEntry: (entry) => {
    const next: ActivityEntry = {
      id: entry.id ?? entryId(),
      timestamp: entry.timestamp ?? new Date().toISOString(),
      runId: entry.runId,
      channel: entry.channel,
      kind: entry.kind,
      title: entry.title,
      detail: entry.detail,
      body: entry.body ? truncateBody(entry.body) : undefined,
      status: entry.status,
      sourceEventId: entry.sourceEventId,
    }

    set((state) => {
      const entries = [...state.entries, next]
      if (entries.length > ACTIVITY_LOG_MAX_ENTRIES) {
        return { entries: entries.slice(entries.length - ACTIVITY_LOG_MAX_ENTRIES) }
      }
      return { entries }
    })
  },

  appendSystemLine: (line) => {
    get().appendEntry({
      channel: 'system',
      kind: 'command',
      title: line,
      status: line.startsWith('[error]') ? 'error' : 'info',
    })
  },

  setActiveChannel: (channel) => set({ activeChannel: channel }),

  clearChannel: (channel) => {
    set((state) => ({
      entries: state.entries.filter((entry) => entry.channel !== channel),
    }))
  },

  clearAll: () => set({ entries: [], activeChannel: 'all' }),

  getFilteredEntries: () => {
    const { entries, activeChannel } = get()
    if (activeChannel === 'all') return entries
    return entries.filter((entry) => entry.channel === activeChannel)
  },
}))
