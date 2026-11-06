import { create } from 'zustand'
import type {
  ReminderComposerMode,
  ReminderTimelineDocument,
  ReminderTimelineItem,
} from '@contracts/index'
import { collectReminderNotifyEvents } from '../notifications/reminderNotification'
import { useWorkbenchStore } from './workbenchStore'

function emitReminderEvents(
  before: ReminderTimelineDocument | null | undefined,
  after: ReminderTimelineDocument | null | undefined,
  focusedItemId: string | null,
) {
  const events = collectReminderNotifyEvents(before, after)
  if (events.length === 0) return
  useWorkbenchStore.getState().notifyReminderEvents(events, { focusedItemId })
}

export type ReminderFilter =
  | 'all'
  | 'milestones'
  | 'reminders'
  | 'overdue'
  | 'conflicts'
  | 'inbox'

export type ReminderComposerSheet = 'none' | 'activity' | 'context'

interface ReminderGraphStore {
  document: ReminderTimelineDocument | null
  selectedId: string | null
  filter: ReminderFilter
  composerDraft: string
  composerSheet: ReminderComposerSheet
  askReply: string | null
  busy: boolean
  syncing: boolean
  error: string | null
  /** Local drag preview before confirm dialog. */
  dragPreview: { itemId: string; phaseIndex: number; manualOrder: number } | null
  confirmOpen: boolean

  setComposerDraft: (value: string) => void
  setFilter: (filter: ReminderFilter) => void
  selectItem: (id: string | null) => void
  toggleComposerSheet: (sheet: Exclude<ReminderComposerSheet, 'none'>) => void
  clearError: () => void
  clear: () => void
  loadForWorkspace: () => Promise<void>
  syncNow: () => Promise<void>
  setComposerMode: (mode: ReminderComposerMode) => Promise<void>
  beginReorderConfirm: (itemId: string, phaseIndex: number, manualOrder: number) => void
  cancelReorderConfirm: () => void
  confirmReorder: () => Promise<void>
  acceptEditOffer: () => Promise<void>
  dismissEditOffer: () => Promise<void>
  completeMilestone: (milestoneId: string, passed: boolean) => Promise<void>
  sendAuthoringTurn: () => Promise<void>
}

function projectClient() {
  const { client, project } = useWorkbenchStore.getState()
  if (!client || !project) return null
  return { client, projectId: project.projectId }
}

export const useReminderGraphStore = create<ReminderGraphStore>((set, get) => ({
  document: null,
  selectedId: null,
  filter: 'all',
  composerDraft: '',
  composerSheet: 'none',
  askReply: null,
  busy: false,
  syncing: false,
  error: null,
  dragPreview: null,
  confirmOpen: false,

  setComposerDraft: (value) => set({ composerDraft: value }),
  setFilter: (filter) => set({ filter }),
  selectItem: (id) =>
    set({
      selectedId: id,
      ...(id ? { composerSheet: 'context' as const } : {}),
    }),
  toggleComposerSheet: (sheet) =>
    set((state) => ({
      composerSheet: state.composerSheet === sheet ? 'none' : sheet,
    })),
  clearError: () => set({ error: null }),
  clear: () =>
    set({
      document: null,
      selectedId: null,
      composerDraft: '',
      composerSheet: 'none',
      askReply: null,
      busy: false,
      syncing: false,
      error: null,
      dragPreview: null,
      confirmOpen: false,
    }),

  loadForWorkspace: async () => {
    const ctx = projectClient()
    if (!ctx) {
      get().clear()
      return
    }
    set({ busy: true, error: null })
    try {
      const document = await ctx.client.getReminderTimeline(ctx.projectId)
      set({ document, busy: false })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  syncNow: async () => {
    const ctx = projectClient()
    if (!ctx) return
    const before = get().document
    set({ syncing: true, error: null, composerSheet: 'activity' })
    try {
      const document = await ctx.client.syncReminderTimeline(ctx.projectId)
      set({ document, syncing: false })
      emitReminderEvents(before, document, get().selectedId)
    } catch (error) {
      set({
        syncing: false,
        error: error instanceof Error ? error.message : String(error),
        composerSheet: 'activity',
      })
    }
  },

  setComposerMode: async (mode) => {
    const ctx = projectClient()
    if (!ctx) return
    try {
      const document = await ctx.client.setReminderComposerMode(ctx.projectId, mode)
      set({ document })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  beginReorderConfirm: (itemId, phaseIndex, manualOrder) => {
    set({
      dragPreview: { itemId, phaseIndex, manualOrder },
      confirmOpen: true,
    })
  },

  cancelReorderConfirm: () => {
    set({ dragPreview: null, confirmOpen: false })
  },

  confirmReorder: async () => {
    const ctx = projectClient()
    const preview = get().dragPreview
    if (!ctx || !preview) return
    set({ busy: true, error: null })
    try {
      const document = await ctx.client.reorderReminderItem(ctx.projectId, {
        itemId: preview.itemId,
        newPhaseIndex: preview.phaseIndex,
        newManualOrder: preview.manualOrder,
        confirm: false,
      })
      set({
        document,
        busy: false,
        confirmOpen: false,
        dragPreview: null,
      })
    } catch (error) {
      set({
        busy: false,
        confirmOpen: false,
        dragPreview: null,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  acceptEditOffer: async () => {
    const ctx = projectClient()
    if (!ctx) return
    const before = get().document
    set({ busy: true, error: null })
    try {
      const document = await ctx.client.acceptReminderEditOffer(ctx.projectId)
      set({ document, busy: false })
      emitReminderEvents(before, document, get().selectedId)
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  dismissEditOffer: async () => {
    const ctx = projectClient()
    if (!ctx) return
    set({ busy: true, error: null })
    try {
      const document = await ctx.client.dismissReminderEditOffer(ctx.projectId)
      set({ document, busy: false })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  completeMilestone: async (milestoneId, passed) => {
    const ctx = projectClient()
    if (!ctx) return
    const before = get().document
    set({ busy: true, error: null })
    try {
      const document = await ctx.client.setReminderMilestoneStatus(ctx.projectId, {
        milestoneId,
        status: passed ? 'passed' : 'upcoming',
        source: 'manual',
      })
      set({ document, busy: false })
      emitReminderEvents(before, document, get().selectedId)
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  },

  sendAuthoringTurn: async () => {
    const ctx = projectClient()
    const draft = get().composerDraft.trim()
    const document = get().document
    if (!ctx || !draft || !document) return
    set({ busy: true, error: null, askReply: null, composerSheet: 'activity' })
    try {
      const result = await ctx.client.sendReminderAuthoringTurn(ctx.projectId, {
        mode: document.composerMode ?? 'ask',
        prompt: draft,
      })
      const hasOffer = Boolean(result.document.pendingEditOffer)
      set({
        document: result.document,
        busy: false,
        composerDraft: '',
        askReply: result.reply ?? null,
        composerSheet: hasOffer ? 'activity' : get().composerSheet,
      })
    } catch (error) {
      set({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
        composerSheet: 'activity',
      })
    }
  },
}))

export function filterReminderItems(
  items: ReminderTimelineItem[],
  filter: ReminderFilter,
): ReminderTimelineItem[] {
  switch (filter) {
    case 'milestones':
      return items.filter((item) => item.kind === 'milestone')
    case 'reminders':
      return items.filter((item) => item.kind === 'reminder')
    case 'inbox':
      return items.filter((item) => item.kind === 'inbox')
    case 'conflicts':
      return items.filter((item) => item.reminderStatus === 'conflict')
    case 'overdue':
      return items.filter((item) => {
        if (item.kind === 'reminder' && item.reminderStatus === 'ready') return true
        if (item.kind === 'milestone' && item.milestoneStatus === 'due') return true
        const due = item.dueAt ?? item.targetDate
        if (!due) return false
        return Date.parse(due) < Date.now() && item.milestoneStatus !== 'passed'
      })
    default:
      return items
  }
}
