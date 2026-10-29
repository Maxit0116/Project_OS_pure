import { create } from 'zustand'
import type {
  AgentPoolHistoryEntry,
  ComposeSubagentLike,
} from './projectAgentPool'
import { buildHistoryEntryFromTask, type AgentPoolTask } from './projectAgentPool'

interface AgentPoolStore {
  removedTaskIds: string[]
  reviewingTaskId: string | null
  continuingTaskIds: string[]
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
  expandedTaskId: string | null
  historyExpandedTaskId: string | null
  composeSubagents: ComposeSubagentLike[]
  /** Snapshot of the task under review (for the Chat acceptance card). */
  reviewingTaskSnapshot: AgentPoolTask | null
  continueFeedbackByTaskId: Record<string, string>

  startReview: (task: AgentPoolTask) => void
  acceptTask: (taskId: string) => void
  continueTask: (taskId: string, feedback?: string) => void
  cancelReview: () => void
  setExpandedTaskId: (taskId: string | null) => void
  setHistoryExpandedTaskId: (taskId: string | null) => void
  setComposeSubagents: (slots: ComposeSubagentLike[]) => void
  clearContinuing: (taskId: string) => void
}

export const useAgentPoolStore = create<AgentPoolStore>((set, get) => ({
  removedTaskIds: [],
  reviewingTaskId: null,
  continuingTaskIds: [],
  historyByTaskId: {},
  expandedTaskId: null,
  historyExpandedTaskId: null,
  composeSubagents: [],
  reviewingTaskSnapshot: null,
  continueFeedbackByTaskId: {},

  startReview: (task) => {
    set({
      reviewingTaskId: task.taskId,
      reviewingTaskSnapshot: task,
    })
  },

  acceptTask: (taskId) => {
    const { removedTaskIds, reviewingTaskId } = get()
    set({
      removedTaskIds: removedTaskIds.includes(taskId)
        ? removedTaskIds
        : [...removedTaskIds, taskId],
      reviewingTaskId: reviewingTaskId === taskId ? null : reviewingTaskId,
      reviewingTaskSnapshot:
        reviewingTaskId === taskId ? null : get().reviewingTaskSnapshot,
      continuingTaskIds: get().continuingTaskIds.filter((id) => id !== taskId),
    })
  },

  continueTask: (taskId, feedback) => {
    const snapshot = get().reviewingTaskSnapshot
    if (!snapshot || snapshot.taskId !== taskId) {
      set({
        reviewingTaskId: null,
        reviewingTaskSnapshot: null,
      })
      return
    }
    const entry = buildHistoryEntryFromTask(snapshot)
    const prev = get().historyByTaskId[taskId] ?? []
    set({
      historyByTaskId: {
        ...get().historyByTaskId,
        [taskId]: [...prev, entry],
      },
      reviewingTaskId: null,
      reviewingTaskSnapshot: null,
      continuingTaskIds: get().continuingTaskIds.includes(taskId)
        ? get().continuingTaskIds
        : [...get().continuingTaskIds, taskId],
      continueFeedbackByTaskId: feedback?.trim()
        ? { ...get().continueFeedbackByTaskId, [taskId]: feedback.trim() }
        : get().continueFeedbackByTaskId,
      historyExpandedTaskId: taskId,
    })
  },

  cancelReview: () => {
    set({ reviewingTaskId: null, reviewingTaskSnapshot: null })
  },

  setExpandedTaskId: (taskId) => set({ expandedTaskId: taskId }),

  setHistoryExpandedTaskId: (taskId) => set({ historyExpandedTaskId: taskId }),

  setComposeSubagents: (slots) => set({ composeSubagents: slots }),

  clearContinuing: (taskId) => {
    set({
      continuingTaskIds: get().continuingTaskIds.filter((id) => id !== taskId),
    })
  },
}))

export function agentPoolOverlayFromStore(state: {
  removedTaskIds: string[]
  reviewingTaskId: string | null
  continuingTaskIds: string[]
  historyByTaskId: Record<string, AgentPoolHistoryEntry[]>
}) {
  return {
    removedTaskIds: new Set(state.removedTaskIds),
    reviewingTaskIds: new Set(
      state.reviewingTaskId ? [state.reviewingTaskId] : [],
    ),
    continuingTaskIds: new Set(state.continuingTaskIds),
    historyByTaskId: state.historyByTaskId,
  }
}
